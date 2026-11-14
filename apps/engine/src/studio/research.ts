/**
 * Deterministic, independently testable scientific workbench analytics for the
 * exact 1000+ logical-qubit simulator. No invented hardware or fidelity data.
 */
import {parseLargeQasm} from "./largeQasm";
import {methodFor,type ScalableMethod} from "./scalable";
import type {Step} from "./model";

export const RESEARCH_WIDTHS=[1000,1024,1536,2048,4096] as const;
export const RESEARCH_SHOTS=[32,64,128,256,512,1024] as const;
export type ResearchModel="ghz"|"graph"|"plus"|"rotation"|"bell"|"ramsey"|"clifford"|"islands";
export interface ResearchTemplate {
 id:ResearchModel;name:string;category:string;description:string;expected:ScalableMethod;
 industry:string;scientificUse:string;
}
export const RESEARCH_TEMPLATES:ResearchTemplate[]=[
 {id:"ghz",name:"GHZ correlation chain",category:"Entanglement",description:"H on q0 followed by a long-range CX chain.",expected:"stabilizer-tableau",industry:"Quantum communications / logical state preparation",scientificUse:"Correlated Z-basis state distribution"},
 {id:"graph",name:"Linear graph-state preparation",category:"Graph states",description:"H on every logical qubit with neighboring CZ gates.",expected:"stabilizer-tableau",industry:"Measurement-based computing / stabilizer research",scientificUse:"Graph-state circuit structure"},
 {id:"plus",name:"Uniform Hadamard ensemble",category:"Clifford",description:"A product of |+> states across the entire logical register.",expected:"stabilizer-tableau",industry:"Sampling and computational baselines",scientificUse:"High-rank uniform Z-basis sampling"},
 {id:"rotation",name:"Separable RY ensemble",category:"Variational primitives",description:"Independent exact non-Clifford rotation gates.",expected:"separable-state",industry:"Variational circuit components / controls research",scientificUse:"Independent product-state probability"},
 {id:"bell",name:"Independent Bell-pair array",category:"Entanglement",description:"Disjoint H/CX entangled pairs, without cross-pair connections.",expected:"stabilizer-tableau",industry:"Entanglement distribution / quantum network protocols",scientificUse:"Disjoint two-qubit correlations"},
 {id:"ramsey",name:"Ideal Ramsey interference array",category:"Sensing model",description:"H–RZ–H single-qubit interference on a bounded set of logical wires.",expected:"separable-state",industry:"Quantum sensor algorithm research",scientificUse:"Ideal phase-to-measurement mapping (no sensor calibration)"},
 {id:"clifford",name:"Two-layer Clifford graph pattern",category:"Graph states",description:"H preparation followed by disjoint CZ couplings on alternating pairs.",expected:"stabilizer-tableau",industry:"Clifford compilation / graph connectivity",scientificUse:"Connectivity and depth diagnostics"},
 {id:"islands",name:"Non-Clifford entanglement islands",category:"Partitioned",description:"Independent three-qubit H/CX/T/CX entangled components.",expected:"partitioned-statevector",industry:"Modular algorithm experiments / device partition studies",scientificUse:"Bounded exact non-Clifford entanglement"}
];
export function templateQasm(n:number,id:ResearchModel):string {
 if(!Number.isInteger(n)||n<1000||n>4096)throw Error("Research register must contain 1,000–4,096 logical qubits.");
 const lines=["OPENQASM 2.0;",'include "qelib1.inc";',"qreg q["+n+"];", "creg c["+n+"];"];
 switch(id){
 case "ghz":
  lines.push("h q[0];");
  for(let i=1;i<n;i++)lines.push("cx q["+(i-1)+"],q["+i+"];");
  break;
 case "graph":
  lines.push("h q;");
  for(let i=1;i<n;i++)lines.push("cz q["+(i-1)+"],q["+i+"];");
  break;
 case "plus":lines.push("h q;");break;
 case "rotation":lines.push("ry(pi/3) q;");break;
 case "bell":
  for(let i=0;i+1<n;i+=2)lines.push("h q["+i+"];","cx q["+i+"],q["+(i+1)+"];");
  break;
 case "ramsey":
  for(let i=0;i<Math.min(n,2000);i++)lines.push("h q["+i+"];","rz(pi/3) q["+i+"];","h q["+i+"];");
  break;
 case "clifford":
  lines.push("h q;");
  for(let i=0;i+1<n;i+=2)lines.push("cz q["+i+"],q["+(i+1)+"];");
  for(let i=1;i+1<n;i+=2)lines.push("cz q["+i+"],q["+(i+1)+"];");
  break;
 case "islands":
  for(let i=0;i+2<n;i+=4)lines.push("h q["+i+"];","cx q["+i+"],q["+(i+1)+"];","t q["+(i+1)+"];","cx q["+(i+1)+"],q["+(i+2)+"];");
  break;
 default:throw Error("Unknown model.");
 }
 return lines.join("\n")+"\n";
}
export interface CircuitDiagnostic{
 qubits:number;bits:number;operations:number;gateCounts:{gate:string;count:number}[];
 activeQubits:number;multiQubitGates:number;measurements:number;
 logicalDepthUpperBound:number;method:ScalableMethod;
 bucketTouches:number[];bucketEdges:{from:number;to:number;count:number}[];
 estimatedDenseBytes:string;observedMaxComponent:number;
}
const BUCKETS=32;
export function analyzeLargeCircuit(source:string):CircuitDiagnostic{
 const p=parseLargeQasm(source),method=methodFor(p);
 const counts=new Map<string,number>();
 const active=new Uint8Array(p.qubits),lastDepth=new Int32Array(p.qubits);
 const touches=new Array<number>(BUCKETS).fill(0);
 const edges=new Map<string,number>();
 const parent=new Int32Array(p.qubits);
 for(let i=0;i<p.qubits;i++)parent[i]=i;
 const root=(q:number):number=>{while(parent[q]!==q){parent[q]=parent[parent[q]];q=parent[q];}return q;};
 const union=(a:number,b:number)=>{const r=root(a),s=root(b);if(r!==s)parent[r]=s;};
 const bucket=(q:number)=>Math.min(BUCKETS-1,Math.floor(q*BUCKETS/p.qubits));
 let multi=0,measurements=0,depth=0;
 for(const s of p.steps){
  counts.set(s.gate,(counts.get(s.gate)||0)+1);
  if(s.gate==="MEASURE"){measurements++;continue;}
  if(s.gate==="BARRIER")continue;
  const q=[...s.targets,...(s.controls||[])];
  const d=1+q.reduce((v,i)=>Math.max(v,lastDepth[i]),0);
  depth=Math.max(depth,d);
  for(const i of q){lastDepth[i]=d;active[i]=1;touches[bucket(i)]++;}
  if(q.length>=2){
   multi++;
   for(let j=1;j<q.length;j++){
    union(q[0],q[j]);
    const a=bucket(q[0]),b=bucket(q[j]);
    const x=Math.min(a,b),y=Math.max(a,b),key=x+":"+y;
    edges.set(key,(edges.get(key)||0)+1);
   }
  }
 }
 const group=new Map<number,number>();
 for(let q=0;q<p.qubits;q++)if(active[q]){const r=root(q);group.set(r,(group.get(r)||0)+1);}
 return{
  qubits:p.qubits,bits:p.bits,operations:p.steps.length,
  gateCounts:[...counts].map(([gate,count])=>({gate,count})).sort((a,b)=>b.count-a.count||a.gate.localeCompare(b.gate)),
  activeQubits:active.reduce((a,b)=>a+b,0),multiQubitGates:multi,measurements,
  logicalDepthUpperBound:depth,method,bucketTouches:touches,
  bucketEdges:[...edges].map(([key,count])=>{const [from,to]=key.split(":").map(Number);return{from,to,count};}).sort((a,b)=>b.count-a.count).slice(0,256),
  estimatedDenseBytes:"2^"+p.qubits+" × 16 bytes (dense representation not allocated)",
  observedMaxComponent:Math.max(0,...group.values())
 };
}
export interface MeasuredBit{index:number;ones:number;shots:number;pOne:number;zMean:number;normal95:[number,number]}
export interface PairCorrelation{a:number;b:number;shots:number;zz:number;connected:number}
export function measuredBit(counts:Record<string,number>,index:number):MeasuredBit{
 const entries=Object.entries(counts);
 const width=entries[0]?.[0].length||0;
 if(!Number.isInteger(index)||index<0||index>=width)throw Error("Measurement bit index is out of range.");
 let shots=0,ones=0;
 for(const [s,n] of entries){
  if(s.length!==width||!/^[01]+$/.test(s)||!Number.isInteger(n)||n<0)throw Error("Malformed sampled measurement histogram.");
  shots+=n;if(s[width-index-1]==="1")ones+=n;
 }
 if(!shots)throw Error("No measured shots available.");
 // Wilson score interval avoids zero-width "certainty" with all-zero/all-one samples.
 const p=ones/shots,z=1.959963984540054,zz=z*z;
 const denominator=1+zz/shots;
 const center=(p+zz/(2*shots))/denominator;
 const halfWidth=z*Math.sqrt((p*(1-p)+zz/(4*shots))/shots)/denominator;
 return{index,ones,shots,pOne:p,zMean:1-2*p,
  normal95:[Math.max(0,center-halfWidth),Math.min(1,center+halfWidth)]};
}
export function pairCorrelation(counts:Record<string,number>,a:number,b:number):PairCorrelation{
 const pa=measuredBit(counts,a),pb=measuredBit(counts,b);
 if(a===b)throw Error("Choose distinct classical bits.");
 const width=Object.keys(counts)[0].length;
 let zz=0;
 for(const [s,n]of Object.entries(counts)){
  const za=s[width-a-1]==="1"?-1:1,zb=s[width-b-1]==="1"?-1:1;
  zz+=za*zb*n;
 }
 zz/=pa.shots;
 return{a,b,shots:pa.shots,zz,connected:zz-pa.zMean*pb.zMean};
}
export function sampleEntropy(counts:Record<string,number>){
 const shots=Object.values(counts).reduce((s,n)=>s+n,0);
 if(!shots)return 0;
 return Object.values(counts).reduce((h,n)=>{const p=n/shots;return p?h-p*Math.log2(p):h;},0);
}
export function measuredHistogramStats(counts:Record<string,number>){
 const rows=Object.entries(counts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
 const shots=rows.reduce((s,x)=>s+x[1],0);
 return {rows,shots,distinct:rows.length,entropy:sampleEntropy(counts)};
}
