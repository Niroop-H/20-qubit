/**
 * Bounded industrial research companion: exact p=1 QAOA for weighted MaxCut.
 * Scientifically honest 2–10 decision variables, not 1000-qubit QAOA.
 *
 * Simulator: pure FP64 classical amplitudes with existing QuantumCircuit RX
 * transformations. Ground-truth optimum and deterministic classical heuristic
 * are computed independently of the variational quantum output.
 */
import {QuantumCircuit} from "../simulator/QuantumCircuit";
import {createRxGate} from "../math/gates";

export interface IndustrialEdge {source:number;target:number;weight:number}
export interface IndustrialGraph {name:string;nodes:string[];edges:IndustrialEdge[];context?:string}
export interface IndustrialOptimizationResult{
 schema:"MAH-Quantum-Industrial-QAOA-MaxCut/v1";
 graph:IndustrialGraph;
 method:"ideal-classical-statevector-qaoa-p1";
 settings:{shots:number;seed:number;parametersEvaluated:number};
 landscape:{gammaMax:number;betaMax:number;gammaPoints:number;betaPoints:number;samples:Array<{gamma:number;beta:number;expectedScore:number}>};
 classical:{optimum:number;optimalAssignment:string;degeneracy:number;greedyScore:number;greedyAssignment:string;randomBaseline:number};
 quantum:{gamma:number;beta:number;expectedScore:number;approximationRatio:number;optimalOutcomeProbability:number;
  sampledMeanScore:number;bestSampleScore:number;bestSampleAssignment:string;
  outcomes:Array<{bits:string;count:number;score:number;idealProbability:number}>};
 execution:{logicalQubits:number;statevectorBytes:number;durationMs:number;completedShots:number;physicalHardware:false};
 disclaimers:string[];
}
const MAX_Q=10,MAX_SHOTS=1024;
const isFiniteNumber=(n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n);
export function validateIndustrialGraph(raw:unknown):IndustrialGraph{
 if(!raw||Array.isArray(raw)||typeof raw!=="object")throw Error("Graph must be a JSON object.");
 const v=raw as Record<string,unknown>;
 if(typeof v.name!=="string"||!v.name.trim()||v.name.length>110)throw Error("Graph name must be 1–110 characters.");
 if(!Array.isArray(v.nodes)||v.nodes.length<2||v.nodes.length>MAX_Q||
  v.nodes.some(n=>typeof n!=="string"||!n.trim()||n.length>60))
  throw Error("Graph needs 2–10 labeled decision variables (each label up to 60 characters).");
 const nodes=(v.nodes as string[]).map(s=>s.trim());
 if(new Set(nodes.map(x=>x.toLocaleLowerCase("en"))).size!==nodes.length)throw Error("Node labels must be unique.");
 if(!Array.isArray(v.edges)||v.edges.length<1||v.edges.length>45)throw Error("Graph needs 1–45 weighted undirected edges.");
 const edges:IndustrialEdge[]=[];
 const keys=new Set<string>();
 for(const [i,rawEdge]of v.edges.entries()){
  if(!rawEdge||typeof rawEdge!=="object"||Array.isArray(rawEdge))throw Error("Edge "+(i+1)+" is not a valid object.");
  const edge=rawEdge as Record<string,unknown>;
  if(!Number.isInteger(edge.source)||!Number.isInteger(edge.target)||
   (edge.source as number)<0||(edge.target as number)<0||
   (edge.source as number)>=nodes.length||(edge.target as number)>=nodes.length||
   edge.source===edge.target)
   throw Error("Edge "+(i+1)+" must connect distinct, in-range nodes.");
  if(!isFiniteNumber(edge.weight)||edge.weight<=0||edge.weight>1000)
   throw Error("Edge "+(i+1)+" weight must be a finite positive value no greater than 1,000.");
  const source=Math.min(edge.source as number,edge.target as number);
  const target=Math.max(edge.source as number,edge.target as number);
  const key=source+":"+target;
  if(keys.has(key))throw Error("Duplicate undirected edge "+key+".");
  keys.add(key);edges.push({source,target,weight:edge.weight});
 }
 const context=v.context===undefined?undefined:
  typeof v.context==="string"&&v.context.length<=400?v.context:
  (()=>{throw Error("Context must be a string up to 400 characters.");})();
 return{name:v.name.trim(),nodes,edges,context};
}
export function cutObjective(graph:IndustrialGraph,mask:number):number{
 let value=0;
 for(const e of graph.edges)if(((mask>>>e.source)^(mask>>>e.target))&1)value+=e.weight;
 return value;
}
export function qaoaDistribution(graph:IndustrialGraph,gamma:number,beta:number):Float64Array{
 if(!Number.isFinite(gamma)||!Number.isFinite(beta))throw Error("Variational parameters must be finite.");
 const n=graph.nodes.length,size=2**n,circuit=new QuantumCircuit(n),amplitude=1/Math.sqrt(size);
 for(let mask=0;mask<size;mask++){
  const phase=-gamma*cutObjective(graph,mask);
  circuit.real[mask]=amplitude*Math.cos(phase);
  circuit.imag[mask]=amplitude*Math.sin(phase);
 }
 const rx=createRxGate(2*beta);
 for(let bit=0;bit<n;bit++)circuit.applySingleQubitGate(bit,rx);
 return circuit.getProbabilities();
}
const label=(mask:number,n:number)=>mask.toString(2).padStart(n,"0");
function random(seed:number){
 let state=seed>>>0;
 return()=>{state=(state+0x6d2b79f5)>>>0;let x=state;
  x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);
  return((x^(x>>>14))>>>0)/4294967296;
 };
}
export function runIndustrialOptimization(raw:unknown,shots:number,seed:number):IndustrialOptimizationResult{
 const started=performance.now();
 const graph=validateIndustrialGraph(raw);
 if(!Number.isInteger(shots)||shots<128||shots>MAX_SHOTS)throw Error("Shots must be an integer from 128 to 1,024.");
 if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error("Seed must be an unsigned 32-bit integer.");
 const n=graph.nodes.length,size=2**n,scores=new Float64Array(size);
 let optimum=-Infinity,optimalMask=0,degeneracy=0;
 for(let mask=0;mask<size;mask++){
  const val=cutObjective(graph,mask);scores[mask]=val;
  if(val>optimum+1e-9){optimum=val;optimalMask=mask;degeneracy=1;}
  else if(Math.abs(val-optimum)<1e-9)degeneracy++;
 }
 // Deterministic single-bit-flip hill-climber, an independent classical baseline.
 let greedyMask=0,greedyScore=scores[0];
 for(let step=0;step<n;step++){
  let best=greedyMask,score=greedyScore;
  for(let bit=0;bit<n;bit++){
   const proposed=greedyMask^(1<<bit);
   if(scores[proposed]>score+1e-9){best=proposed;score=scores[proposed];}
  }
  if(best===greedyMask)break;
  greedyMask=best;greedyScore=score;
 }
 const biggest=Math.max(...graph.edges.map(e=>e.weight)),gammaRange=2*Math.PI/biggest;
 let gamma=0,beta=0,expected=-Infinity,evaluated=0;
 const landscape:Array<{gamma:number;beta:number;expectedScore:number}>=[];
 const evaluate=(g:number,b:number,recordGrid=false)=>{
  const probabilities=qaoaDistribution(graph,g,b);
  let objective=0;for(let i=0;i<size;i++)objective+=probabilities[i]*scores[i];
  evaluated++;
  if(recordGrid)landscape.push({gamma:g,beta:b,expectedScore:objective});
  if(objective>expected+1e-12){expected=objective;gamma=g;beta=b;}
 };
 for(let i=0;i<12;i++)for(let j=0;j<=8;j++)
  evaluate(i*gammaRange/12,j*Math.PI/16,true);
 let dGamma=gammaRange/24,dBeta=Math.PI/32;
 for(let pass=0;pass<2;pass++){
  const centerG=gamma,centerB=beta;
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)
   evaluate(Math.max(0,Math.min(gammaRange,centerG+i*dGamma)),Math.max(0,Math.min(Math.PI/2,centerB+j*dBeta)));
  dGamma/=2;dBeta/=2;
 }
 const probabilities=qaoaDistribution(graph,gamma,beta),cdf=new Float64Array(size);
 let norm=0,optimalProbability=0;
 for(let i=0;i<size;i++){
  if(!Number.isFinite(probabilities[i])||probabilities[i]<-1e-12)
   throw Error("Invalid probability from quantum amplitude evolution.");
  norm+=probabilities[i];cdf[i]=norm;
  if(Math.abs(scores[i]-optimum)<1e-9)optimalProbability+=probabilities[i];
 }
 if(Math.abs(norm-1)>1e-9)throw Error("Quantum probability normalization failed.");
 const rng=random(seed),counts=new Uint32Array(size);
 let sampledSum=0,bestSampleScore=-Infinity,bestSampleMask=0;
 for(let shot=0;shot<shots;shot++){
  const r=rng()*norm;
  let lo=0,hi=size-1;
  while(lo<hi){const mid=(lo+hi)>>>1;if(r<cdf[mid])hi=mid;else lo=mid+1;}
  counts[lo]++;
  sampledSum+=scores[lo];
  if(scores[lo]>bestSampleScore+1e-9){bestSampleScore=scores[lo];bestSampleMask=lo;}
 }
 const outcomes:Array<{bits:string;count:number;score:number;idealProbability:number}>=[];
 for(let i=0;i<size;i++)if(counts[i])outcomes.push({
  bits:label(i,n),count:counts[i],score:scores[i],idealProbability:probabilities[i]
 });
 outcomes.sort((a,b)=>b.count-a.count||b.score-a.score||a.bits.localeCompare(b.bits));
 return{
  schema:"MAH-Quantum-Industrial-QAOA-MaxCut/v1",graph,method:"ideal-classical-statevector-qaoa-p1",
  settings:{shots,seed,parametersEvaluated:evaluated},
  landscape:{gammaMax:gammaRange,betaMax:Math.PI/2,gammaPoints:12,betaPoints:9,samples:landscape},
  classical:{optimum,optimalAssignment:label(optimalMask,n),degeneracy,
   greedyScore,greedyAssignment:label(greedyMask,n),
   randomBaseline:graph.edges.reduce((sum,e)=>sum+e.weight,0)/2},
  quantum:{gamma,beta,expectedScore:expected,approximationRatio:expected/optimum,
   optimalOutcomeProbability:optimalProbability,sampledMeanScore:sampledSum/shots,
   bestSampleScore,bestSampleAssignment:label(bestSampleMask,n),outcomes},
  execution:{logicalQubits:n,statevectorBytes:16*size,durationMs:performance.now()-started,
   completedShots:shots,physicalHardware:false},
  disclaimers:[
   "This is 2–10-qubit ideal QAOA p=1 for weighted MaxCut, not unrestricted 1000-qubit industrial optimization.",
   "QAOA angles are selected by a bounded parameter grid plus two local refinements, not guaranteed to be optimal.",
   "The independent classical solver enumerates every 2^n assignment to verify the true optimum.",
   "Only positive pairwise separation weights are modeled. Capacity, precedence, flow and safety constraints are absent.",
   "Synthetic examples do not establish equipment-level accuracy, physical quantum advantage, or operational suitability."
  ]
 };
}
