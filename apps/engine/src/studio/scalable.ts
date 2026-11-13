/**
 * Exact scalable quantum circuit backends.
 *
 * - Stabilizer tableau: Clifford gates, entanglement and joint Z-basis sampling.
 * - Separable pure states: arbitrary supported one-qubit gates and SWAP.
 *
 * Neither representation stores 2^n amplitudes; neither simulates arbitrary
 * non-Clifford *entangled* states. Unsupported circuits throw a clear error.
 */
import type { Step } from "./model";
import { GATES, createRxGate, createRyGate, createRzGate, createUGate } from "../math/gates";
import type { ComplexMatrix2x2 } from "../math/complex";
import type { StudioResult } from "./simulate";

export interface LargeProgram {
  qubits: number;
  bits: number;
  steps: Step[];
}
export type ScalableMethod = "stabilizer-tableau" | "separable-state";

export const LARGE_MAX_QUBITS = 4096;
export const LARGE_MAX_STEPS = 8192;
const CLIFFORD = new Set(["I","H","S","X","Y","Z","CX","CZ","SWAP","BARRIER","MEASURE"]);
const SEPARABLE = new Set(["I","H","S","T","X","Y","Z","RX","RY","RZ","U","SWAP","BARRIER","MEASURE"]);

export function validateLargeProgram(p: LargeProgram, maximumQubits = LARGE_MAX_QUBITS): void {
  if (!p || !Number.isInteger(p.qubits) || p.qubits < 1 || p.qubits > maximumQubits)
    throw new Error("Quantum register must contain 1–" + maximumQubits + " logical qubits.");
  if (!Number.isInteger(p.bits) || p.bits < 1 || p.bits > maximumQubits)
    throw new Error("Classical register must contain 1–" + maximumQubits + " bits.");
  if (!Array.isArray(p.steps) || p.steps.length > LARGE_MAX_STEPS)
    throw new Error("A scalable circuit supports up to " + LARGE_MAX_STEPS + " expanded operations.");
  const ids = new Set<string>(), measuredSources = new Set<number>(), measuredDestinations = new Set<number>();
  let afterMeasure = false;
  for (const [index, step] of p.steps.entries()) {
    const fail = (message:string):never => {throw new Error("Operation "+(index+1)+": "+message);};
    if (!step || typeof step.id!=="string" || ids.has(step.id)) fail("operation IDs must be unique.");
    ids.add(step.id);
    if (!Array.isArray(step.targets) || (step.controls !== undefined && !Array.isArray(step.controls)))
      fail("invalid targets or controls.");
    const operands=[...step.targets,...(step.controls||[])];
    if (operands.some(q=>!Number.isInteger(q)||q<0||q>=p.qubits)||new Set(operands).size!==operands.length)
      fail("invalid, duplicate or out-of-range qubit index.");
    if (!CLIFFORD.has(step.gate) && !SEPARABLE.has(step.gate))
      fail("unsupported gate in scalable engine: "+step.gate+".");
    const nc=step.gate==="CX"||step.gate==="CZ"?1:0;
    const nt=step.gate==="SWAP"?2:step.gate==="BARRIER"?step.targets.length:1;
    if (!nt || step.targets.length!==nt || (step.controls?.length||0)!==nc) fail("wrong number of operands.");
    const keys=step.gate==="U"?["theta","phi","lambda"]:
      ["RX","RY","RZ"].includes(step.gate)?["theta"]:[];
    if (keys.some(k=>!Number.isFinite(step.params?.[k]))) fail("non-finite or missing gate parameter.");
    if (step.gate==="MEASURE"){
      afterMeasure=true;
      const c=step.classical??step.targets[0];
      if (!Number.isInteger(c)||c<0||c>=p.bits||measuredSources.has(step.targets[0])||measuredDestinations.has(c))
        fail("invalid or duplicate measurement mapping.");
      measuredSources.add(step.targets[0]);measuredDestinations.add(c);
    }else if(afterMeasure&&step.gate!=="BARRIER") fail("only terminal measurements are supported.");
  }
}
export function methodFor(p: LargeProgram):ScalableMethod {
  validateLargeProgram(p);
  if (p.steps.every(s=>CLIFFORD.has(s.gate))) return "stabilizer-tableau";
  if (p.steps.every(s=>SEPARABLE.has(s.gate))) return "separable-state";
  throw new Error("This circuit combines non-Clifford gates with entangling gates. Exact 100+ qubit simulation for that general circuit is not available; simplify the circuit or use ≤20 qubits in the dense solver.");
}

const word=(q:number)=>q>>>5;
const mask=(q:number)=>1<<(q&31);
const bit=(bits:Uint32Array,q:number)=>+(!!(bits[word(q)]&mask(q)));
const flip=(bits:Uint32Array,q:number)=>{bits[word(q)]^=mask(q);};
const set=(bits:Uint32Array,q:number,v:number)=>{if (v)bits[word(q)]|=mask(q);else bits[word(q)]&=~mask(q);};
const pop=(value:number)=>{
  value-=((value>>>1)&0x55555555);
  value=(value&0x33333333)+((value>>>2)&0x33333333);
  return (((value+(value>>>4))&0x0f0f0f0f)*0x01010101)>>>24;
};
const parity=(a:Uint32Array,b:Uint32Array)=>{
 let result=0;for(let i=0;i<a.length;i++)result^=pop(a[i]&b[i])&1;return result;
};
const dot=(a:Uint32Array,b:Uint32Array)=>{
 let result=0;for(let i=0;i<a.length;i++)result+=pop(a[i]&b[i]);return result;
};
const seedRandom=(seed:number)=>{let x=seed>>>0;return()=>{
 x=(x+0x6d2b79f5)>>>0;let t=x;t=Math.imul(t^(t>>>15),t|1);
 t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;
};};
type Row={x:Uint32Array,z:Uint32Array,sign:number};
const copy=(a:Row):Row=>({x:a.x.slice(),z:a.z.slice(),sign:a.sign});
const xor=(a:Uint32Array,b:Uint32Array)=>{for(let i=0;i<a.length;i++)a[i]^=b[i];};
/** Multiply commuting Hermitian Pauli stabilizers with sign correctly tracked. */
function multiply(left:Row,right:Row):void {
 const phase=dot(left.x,left.z)+dot(right.x,right.z)+2*dot(left.z,right.x);
 xor(left.x,right.x);xor(left.z,right.z);
 const delta=((phase-dot(left.x,left.z))%4+4)%4;
 if(delta&1)throw new Error("Internal non-commuting stabilizer product.");
 left.sign^=right.sign^(delta===2?1:0);
}
function conjugate(row:Row,gate:string,a:number,b=0):void{
 const x=bit(row.x,a),z=bit(row.z,a);
 if(gate==="I"||gate==="BARRIER"||gate==="MEASURE")return;
 if(gate==="H"){row.sign^=x&z;set(row.x,a,z);set(row.z,a,x);}
 else if(gate==="S"){row.sign^=x&z;set(row.z,a,z^x);}
 else if(gate==="X")row.sign^=z;
 else if(gate==="Z")row.sign^=x;
 else if(gate==="Y")row.sign^=x^z;
 else if(gate==="SWAP"){
  const bx=bit(row.x,b),bz=bit(row.z,b);
  set(row.x,a,bx);set(row.z,a,bz);set(row.x,b,x);set(row.z,b,z);
 }else if(gate==="CX"){
  const xb=bit(row.x,b),zb=bit(row.z,b);
  row.sign^=x&zb&(xb^z^1);
  set(row.x,b,xb^x);set(row.z,a,z^zb);
 }else if(gate==="CZ"){
  // H(target) CX(control,target) H(target)
  conjugate(row,"H",b);
  conjugate(row,"CX",a,b);
  conjugate(row,"H",b);
 }
}
/** Solve Z-parity constraints and return a base computational-basis state. */
function solveBase(rows:Row[],n:number,words:number):Uint32Array{
 const eq=rows.map(copy);let rank=0;
 const pivots:number[]=[];
 for(let q=0;q<n&&rank<eq.length;q++){
  let pivot=rank;while(pivot<eq.length&&!bit(eq[pivot].z,q))pivot++;
  if(pivot===eq.length)continue;
  [eq[pivot],eq[rank]]=[eq[rank],eq[pivot]];
  for(let j=rank+1;j<eq.length;j++)if(bit(eq[j].z,q)){
   xor(eq[j].z,eq[rank].z);eq[j].sign^=eq[rank].sign;
  }
  pivots.push(q);rank++;
 }
 for(let j=rank;j<eq.length;j++)if(eq[j].sign)
  throw new Error("Internal inconsistent stabilizer constraints.");
 const state=new Uint32Array(words);
 for(let i=rank-1;i>=0;i--){
  const value=eq[i].sign^parity(eq[i].z,state);
  if(value)set(state,pivots[i],1);
 }
 return state;
}
function stabilizerSupport(p:LargeProgram){
 const n=p.qubits,words=Math.ceil(n/32);
 const rows:Row[]=Array.from({length:n},(_,q)=>{
  const z=new Uint32Array(words);set(z,q,1);
  return{x:new Uint32Array(words),z,sign:0};
 });
 for(const step of p.steps){
  if(step.gate==="MEASURE"||step.gate==="BARRIER")continue;
  const a=step.gate==="CX"||step.gate==="CZ"?step.controls![0]:step.targets[0];
  const b=step.gate==="CX"||step.gate==="CZ"?step.targets[0]:
    step.gate==="SWAP"?step.targets[1]:0;
  for(const row of rows)conjugate(row,step.gate,a,b);
 }
 let rank=0;
 for(let q=0;q<n&&rank<n;q++){
  let pivot=rank;while(pivot<n&&!bit(rows[pivot].x,q))pivot++;
  if(pivot===n)continue;
  [rows[rank],rows[pivot]]=[rows[pivot],rows[rank]];
  for(let k=rank+1;k<n;k++)if(bit(rows[k].x,q))multiply(rows[k],rows[rank]);
  rank++;
 }
 const base=solveBase(rows.slice(rank),n,words);
 return{base,generators:rows.slice(0,rank).map(r=>r.x),rank};
}
/** Convert computational index to classical register, no 32-bit-width restriction. */
function project(p:LargeProgram,input:Uint32Array):Uint32Array{
 const out=new Uint32Array(Math.ceil((p.steps.some(s=>s.gate==="MEASURE")?p.bits:p.qubits)/32));
 const measurements=p.steps.filter(s=>s.gate==="MEASURE");
 if(!measurements.length){out.set(input);return out;}
 for(const s of measurements)if(bit(input,s.targets[0]))set(out,s.classical??s.targets[0],1);
 return out;
}
/** Take a linearly independent GF(2) basis for projected outcome deltas. */
function projectedBasis(vectors:Uint32Array[],width:number):Uint32Array[]{
 const pivots=new Map<number,Uint32Array>(),basis:Uint32Array[]=[];
 for(const input of vectors){
  const v=input.slice();
  for(let q=0;q<width;q++)if(bit(v,q)){
   const current=pivots.get(q);
   if(current)xor(v,current);
   else{pivots.set(q,v);basis.push(v);break;}
  }
 }
 return basis;
}
const label=(v:Uint32Array,width:number)=>{
 const chars=new Array<string>(width);
 for(let i=0;i<width;i++)chars[width-i-1]=bit(v,i)?"1":"0";
 return chars.join("");
};
function gateMatrix(s:Step):ComplexMatrix2x2{
 switch(s.gate){
  case"RX":return createRxGate(s.params!.theta);
  case"RY":return createRyGate(s.params!.theta);
  case"RZ":return createRzGate(s.params!.theta);
  case"U":return createUGate(s.params!.theta,s.params!.phi,s.params!.lambda);
  default:{const gate=GATES[s.gate];if(!gate)throw new Error("Unsupported separable gate "+s.gate);return gate;}
 }
}
function productProbabilities(p:LargeProgram){
 const n=p.qubits;
 const ar=new Float64Array(n),ai=new Float64Array(n),br=new Float64Array(n),bi=new Float64Array(n);
 ar.fill(1);
 for(const s of p.steps){
  if(s.gate==="MEASURE"||s.gate==="BARRIER")continue;
  if(s.gate==="SWAP"){
   const a=s.targets[0],b=s.targets[1];
   for(const data of [ar,ai,br,bi]){const t=data[a];data[a]=data[b];data[b]=t;}
   continue;
  }
  const q=s.targets[0],u=gateMatrix(s);
  const r0=ar[q],i0=ai[q],r1=br[q],i1=bi[q];
  ar[q]=u.real[0][0]*r0-u.imag[0][0]*i0+u.real[0][1]*r1-u.imag[0][1]*i1;
  ai[q]=u.real[0][0]*i0+u.imag[0][0]*r0+u.real[0][1]*i1+u.imag[0][1]*r1;
  br[q]=u.real[1][0]*r0-u.imag[1][0]*i0+u.real[1][1]*r1-u.imag[1][1]*i1;
  bi[q]=u.real[1][0]*i0+u.imag[1][0]*r0+u.real[1][1]*i1+u.imag[1][1]*r1;
 }
 const prob=new Float64Array(n);
 for(let i=0;i<n;i++){
  const z=br[i]*br[i]+bi[i]*bi[i],t=ar[i]*ar[i]+ai[i]*ai[i]+z;
  prob[i]=z/t;
 }
 return prob;
}
export interface ScalableResult extends StudioResult {
  method:ScalableMethod;
  exact:boolean;
  supportRank?:number;
  idealProbabilityLog2?:number;
  detail:string;
}
/**
 * Exact Z-basis sampling for supported circuit families; no dense statevector
 * or invented amplitude list. No physical-noise/fidelity claim.
 */
export function simulateScalable(p:LargeProgram,shots:number,seed:number,noise?:{enabled?:boolean}):ScalableResult{
 validateLargeProgram(p);
 if(!Number.isInteger(shots)||shots<1||shots>(p.qubits>100?1024:8192))
  throw new Error("Shots must be 1–"+(p.qubits>100?1024:8192)+" for this backend.");
 if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw new Error("Seed must be a 32-bit unsigned integer.");
 if(noise?.enabled)throw new Error("Noise models beyond the 20-qubit dense engine are not calibrated or supported; disable noise.");
 const started=performance.now(),method=methodFor(p),rng=seedRandom(seed);
 const width=p.steps.some(s=>s.gate==="MEASURE")?p.bits:p.qubits;
 const counts:Record<string,number>={},idealProbabilities:Record<string,number>={},probabilities:Record<string,number>={};
 let supportRank:number|undefined,idealProbabilityLog2:number|undefined;
 let sample:()=>{outcome:string,ideal:number};
 let base:Uint32Array|undefined,vectorBasis:Uint32Array[]|undefined;
 const measurements=p.steps.filter(s=>s.gate==="MEASURE");
 if(method==="stabilizer-tableau"){
  const support=stabilizerSupport(p);
  base=project(p,support.base);
  vectorBasis=projectedBasis(support.generators.map(x=>project(p,x)),width);
  supportRank=vectorBasis.length;
  idealProbabilityLog2=-supportRank;
  const weight=Math.pow(2,-supportRank);
  sample=()=>{
   const b=base!.slice();
   for(const v of vectorBasis!)if(rng()<.5)xor(b,v);
   return {outcome:label(b,width),ideal:weight};
  };
  // Enumerate only when support has no more than 64 outcomes.
  if(supportRank<=6){
   const outcomes=1<<supportRank;
   for(let i=0;i<outcomes;i++){
    const b=base.slice();
    for(let j=0;j<supportRank;j++)if(i&(1<<j))xor(b,vectorBasis[j]);
    idealProbabilities[label(b,width)]=weight;
   }
  }
 }else{
  const prob=productProbabilities(p);
  const mapping=measurements.length?
    measurements.map(s=>[s.targets[0],s.classical??s.targets[0]]):
    Array.from({length:p.qubits},(_,q)=>[q,q]);
  const active=mapping.filter(([q])=>prob[q]>1e-14&&prob[q]<1-1e-14);
  supportRank=active.length;
  sample=()=>{
   const b=new Uint32Array(Math.ceil(width/32));let probability=1;
   for(const [q,c] of mapping){
    const one=rng()<prob[q];
    probability*=one?prob[q]:1-prob[q];
    if(one)set(b,c,1);
   }
   return {outcome:label(b,width),ideal:probability};
  };
  // 1q non-Clifford gates are represented exactly; samples are stochastic.
 }
 for(let shot=0;shot<shots;shot++){
  const {outcome,ideal}=sample();
  counts[outcome]=(counts[outcome]||0)+1;
  idealProbabilities[outcome]=ideal;
 }
 for(const [name,count]of Object.entries(counts))probabilities[name]=count/shots;
 const mass=Object.values(idealProbabilities).reduce((a,b)=>a+b,0);
 const total=Object.keys(idealProbabilities).length;
 return {
  counts,probabilities,idealProbabilities,
  stateVector:[],
  stateVectorInfo:{totalStates:0,nonZeroStates:0,shownStates:0,truncated:true,retainedProbabilityMass:0,omittedProbabilityMass:1},
  distributionInfo:{shownOutcomes:total,omittedIdealProbabilityMass:Math.max(0,1-mass)},
  bloch:[],executionTimeMs:performance.now()-started,seed,
  stateLabel:method==="stabilizer-tableau"?
   "Exact Clifford stabilizer distribution; full 2^n statevector not materialized":
   "Exact separable-state probabilities; full 2^n statevector not materialized",
  backendInfo:{qpuSimulated:method==="stabilizer-tableau"?"Exact Clifford stabilizer tableau":"Exact separable-state solver",
   qubitCount:p.qubits,shots,fidelityEstimated:null},
  method,exact:true,supportRank,idealProbabilityLog2,
  detail:method==="stabilizer-tableau"?
   "Clifford-only circuit. Exact joint Z-basis distribution over an affine binary subspace.":
   "Single-qubit gates and SWAP only. Entangled non-Clifford circuits are not supported.",
 };
}
