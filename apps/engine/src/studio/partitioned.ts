/**
 * Exact non-Clifford circuits on independent entangled clusters.
 *
 * A circuit may contain thousands of logical wires while its interaction graph
 * decomposes into small connected components. We evolve each component using
 * the existing exact dense solver, then sample the tensor-product distribution.
 * This extends useful gate coverage without claiming general universal
 * 1000-qubit exact statevector simulation.
 *
 * Limits:
 *  - max 18 entangled qubits in any connected component;
 *  - max 2^20 aggregate component basis entries;
 *  - terminal measurements only, checked upstream;
 *  - exact ideal mathematical circuit probabilities within FP64 arithmetic.
 */
import { QuantumCircuit } from "../simulator/QuantumCircuit";
import type { Step } from "./model";
import type { LargeProgram, ScalableResult } from "./scalable";

const MAX_COMPONENT_QUBITS = 18;
const MAX_TOTAL_AMPLITUDES = 1 << 20;
const seedRandom=(seed:number)=>{
 let x=seed>>>0;
 return()=>{x=(x+0x6d2b79f5)>>>0;let t=x;t=Math.imul(t^(t>>>15),t|1);
  t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
};
interface Fragment {
  wires:number[];
  cumulative:Float64Array;
  masks:number[];
  classical:number[];
  marginal:Float64Array;
}
const write=(register:Uint32Array,index:number)=>{
  register[index>>>5]|=1<<(index&31);
};
const outputLabel=(bits:Uint32Array,width:number)=>{
 const chars=new Array<string>(width);
 for(let q=0;q<width;q++)chars[width-q-1]=(bits[q>>>5]&(1<<(q&31)))?"1":"0";
 return chars.join("");
};
const pick=(cdf:Float64Array,random:number)=>{
 let lo=0,hi=cdf.length-1;
 while(lo<hi){
  const mid=(lo+hi)>>>1;
  if(random<cdf[mid])hi=mid;else lo=mid+1;
 }
 return lo;
};
function components(p:LargeProgram):number[][]{
 const parent=new Int32Array(p.qubits);
 for(let i=0;i<parent.length;i++)parent[i]=i;
 const root=(q:number):number=>{
  let r=q;while(parent[r]!==r)r=parent[r];
  while(parent[q]!==q){const next=parent[q];parent[q]=r;q=next;}
  return r;
 };
 const merge=(a:number,b:number)=>{const x=root(a),y=root(b);if(x!==y)parent[y]=x;};
 const active=new Set<number>();
 for(const s of p.steps){
  if(s.gate==="BARRIER"||s.gate==="MEASURE")continue;
  const operands=[...s.targets,...(s.controls||[])];
  for(const q of operands)active.add(q);
  if(operands.length>1){
   const first=operands[0];
   for(let i=1;i<operands.length;i++)merge(first,operands[i]);
  }
 }
 const grouped=new Map<number,number[]>();
 for(const q of active){
  const r=root(q),wires=grouped.get(r)||[];
  wires.push(q);grouped.set(r,wires);
 }
 return [...grouped.values()].map(wires=>wires.sort((a,b)=>a-b));
}
export function simulatePartitioned(p:LargeProgram,shots:number,seed:number):ScalableResult {
 const start=performance.now(),groups=components(p);
 let aggregate=0,maxSize=0;
 for(const wires of groups){
  maxSize=Math.max(maxSize,wires.length);
  if(wires.length>MAX_COMPONENT_QUBITS)
   throw new Error("The circuit requires an entangled non-Clifford component with "+
    wires.length+" qubits. This exact partitioned backend supports up to "+
    MAX_COMPONENT_QUBITS+" connected qubits. Reduce cross-component entanglement "+
    "or use a suitable tensor-network backend; no approximate result has been fabricated.");
  aggregate+=2**wires.length;
  if(aggregate>MAX_TOTAL_AMPLITUDES)
   throw new Error("The exact partitioned state exceeds its aggregate 2^20-amplitude memory budget.");
 }
 const byQubit=new Int32Array(p.qubits);byQubit.fill(-1);
 const localQubit=new Int32Array(p.qubits);localQubit.fill(-1);
 groups.forEach((wires,id)=>wires.forEach((q,i)=>{byQubit[q]=id;localQubit[q]=i;}));
 const steps=groups.map(()=>[] as Step[]);
 for(const s of p.steps){
  if(s.gate==="BARRIER"||s.gate==="MEASURE")continue;
  const id=byQubit[s.targets[0]];
  if(id<0)throw new Error("Internal partitioned-circuit component error.");
  const remap=(q:number)=> {
   if(byQubit[q]!==id)throw new Error("Internal cross-component gate error.");
   return localQubit[q];
  };
  steps[id].push({
   ...s,targets:s.targets.map(remap),
   controls:(s.controls||[]).map(remap),
  });
 }
 const mapped=new Int32Array(p.qubits);mapped.fill(-1);
 const measurements=p.steps.filter(s=>s.gate==="MEASURE");
 const width=measurements.length?p.bits:p.qubits;
 if(measurements.length){
  for(const s of measurements)mapped[s.targets[0]]=s.classical??s.targets[0];
 }else for(let q=0;q<p.qubits;q++)mapped[q]=q;
 const fragments:Fragment[]=groups.map((wires,id)=>{
  const c=new QuantumCircuit(wires.length);
  for(const step of steps[id])c.applyStep(step);
  const probabilities=c.getProbabilities();
  const cumulative=new Float64Array(probabilities.length);
  let norm=0;
  for(let k=0;k<probabilities.length;k++){
   norm+=probabilities[k];cumulative[k]=norm;
  }
  if(!Number.isFinite(norm)||norm<=0||Math.abs(norm-1)>1e-8)
   throw new Error("Component state normalization failed ("+norm+").");
  for(let k=0;k<cumulative.length;k++)cumulative[k]/=norm;
  cumulative[cumulative.length-1]=1;
  const masks:number[]=[],classical:number[]=[];
  wires.forEach((q,i)=>{
   if(mapped[q]>=0){masks.push(1<<i);classical.push(mapped[q]);}
  });
  const marginal=new Float64Array(2**masks.length);
  for(let k=0;k<probabilities.length;k++){
   let key=0;
   for(let j=0;j<masks.length;j++)if(k&masks[j])key|=1<<j;
   marginal[key]+=probabilities[k]/norm;
  }
  return{wires,cumulative,masks,classical,marginal};
 });
 const counts:Record<string,number>=Object.create(null);
 const idealProbabilities:Record<string,number>=Object.create(null);
 const probabilities:Record<string,number>=Object.create(null);
 const rng=seedRandom(seed);
 for(let shot=0;shot<shots;shot++){
  const bits=new Uint32Array(Math.ceil(width/32));
  let ideal=1;
  for(const fragment of fragments){
   const sample=pick(fragment.cumulative,rng());
   let key=0;
   for(let j=0;j<fragment.masks.length;j++){
    if(sample&fragment.masks[j]){
      key|=1<<j;write(bits,fragment.classical[j]);
    }
   }
   ideal*=fragment.marginal[key];
  }
  const outcome=outputLabel(bits,width);
  counts[outcome]=(counts[outcome]||0)+1;
  idealProbabilities[outcome]=ideal;
 }
 for(const [outcome,count]of Object.entries(counts))probabilities[outcome]=count/shots;
 const shown=Object.keys(idealProbabilities).length;
 const probabilityMass=Object.values(idealProbabilities).reduce((a,b)=>a+b,0);
 return {
  counts,probabilities,idealProbabilities,
  stateVector:[],
  stateVectorInfo:{
   totalStates:0,nonZeroStates:0,shownStates:0,truncated:true,
   retainedProbabilityMass:0,omittedProbabilityMass:1,
  },
  distributionInfo:{
   shownOutcomes:shown,omittedIdealProbabilityMass:Math.max(0,1-probabilityMass),
  },
  bloch:[],executionTimeMs:performance.now()-start,seed,
  stateLabel:"Exact partitioned statevector: independent entangled components (not a full 2^n array)",
  backendInfo:{
   qpuSimulated:"Exact partitioned statevector",
   qubitCount:p.qubits,shots,fidelityEstimated:null,
  },
  method:"partitioned-statevector",exact:true,
  detail:"Non-Clifford entangled circuits supported only where independent connected components each have ≤"+
   MAX_COMPONENT_QUBITS+" qubits; largest component="+maxSize+
   ", aggregate state bases="+aggregate+
   ". Joint probabilities are obtained from component marginals.",
 };
}
