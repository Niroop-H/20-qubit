/**
 * MAH Quantum v1 enterprise interoperability contract.
 *
 * Strict bounded synchronous classical simulation, NOT a persistent queue,
 * instrument interface, unrestricted quantum computer, or production SLA.
 * Server-side module: do not import this file into a browser bundle.
 */
import {createHash} from "node:crypto";
import {parseLargeQasm} from "./largeQasm";
import {methodFor,simulateScalable} from "./scalable";
import {validateIndustrialGraph,runIndustrialOptimization,type IndustrialGraph} from "./industrial";
import type {ScalableMethod,LargeProgram} from "./scalable";

export const INDUSTRY_SCHEMA="MAH-Quantum-Industry-Job/v1" as const;
export const INDUSTRY_RESULT_SCHEMA="MAH-Quantum-Industry-Result/v1" as const;
export const INDUSTRY_MAX_REQUEST_BYTES=128*1024;
export const INDUSTRY_MAX_QASM_BYTES=100*1024;
export const INDUSTRY_MAX_BATCH=3;
export const INDUSTRY_MAX_CIRCUIT_QUBITS=2048;
export const INDUSTRY_MAX_CIRCUIT_GATES=3072;
export const INDUSTRY_MAX_CIRCUIT_SHOTS=256;

export type IndustryCircuitJob={
 schema:typeof INDUSTRY_SCHEMA;
 jobId:string;
 kind:"circuit";
 operation:"inspect"|"execute";
 source:string;
 shots?:number;
 seed?:number;
};
export type IndustryOptimizationJob={
 schema:typeof INDUSTRY_SCHEMA;
 jobId:string;
 kind:"optimization";
 operation:"execute";
 graph:unknown;
 shots:number;
 seed:number;
};
export type IndustryJob=IndustryCircuitJob|IndustryOptimizationJob;
export type PreparedCircuit={job:IndustryCircuitJob;program:LargeProgram;method:ScalableMethod;digest:string;canonical:string};
export type PreparedOptimization={job:IndustryOptimizationJob;graph:IndustrialGraph;digest:string;canonical:string};
export type PreparedJob=PreparedCircuit|PreparedOptimization;
export class IndustryInputError extends Error{
 constructor(message:string,public readonly status=422){super(message);this.name="IndustryInputError";}
}
const scalar=(value:unknown):value is Record<string,unknown>=>
 value!==null&&typeof value==="object"&&!Array.isArray(value);
const requireFields=(obj:Record<string,unknown>,allowed:string[])=>{
 for(const key of Object.keys(obj))
  if(!allowed.includes(key))throw new IndustryInputError("Unrecognized request field: "+key);
};
const id=(value:unknown)=>{
 if(typeof value!=="string"||!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(value))
  throw new IndustryInputError("jobId must be 1–64 ASCII letters, numbers, underscores, periods, colons or hyphens.");
 return value;
};
const uint=(n:unknown,name:string,max:number,min:number)=>{
 if(typeof n!=="number"||!Number.isSafeInteger(n)||n<min||n>max)
  throw new IndustryInputError(name+" must be an integer from "+min+" to "+max+".");
 return n;
};
const sourceDigest=(source:string)=>createHash("sha256").update(source,"utf8").digest("hex");
export function inspectIndustryCapability(){
 return {
  schema:"MAH-Quantum-Industry-Capability/v1",execution:"synchronous-serverless",
  engine:"classical-ideal-quantum-circuit-simulation",
  physicalQpu:false,physicalInstrumentControl:false,noiseCalibrated:false,quantumAdvantageClaimed:false,
  requirements:{authentication:"Server-only Bearer credential; disabled until configured.",
   contentType:"application/json",maxRequestBytes:INDUSTRY_MAX_REQUEST_BYTES,maxBatch:INDUSTRY_MAX_BATCH},
  formats:{
   circuit:{format:"OpenQASM 2.0 and recognized QASM 3 register/gate subset only",
    parserMaxLogicalQubits:4096,parserMaxExpandedOperations:8192,
    executeMaxLogicalQubits:INDUSTRY_MAX_CIRCUIT_QUBITS,
    executeMaxExpandedOperations:INDUSTRY_MAX_CIRCUIT_GATES,
    executeMaxShots:INDUSTRY_MAX_CIRCUIT_SHOTS,
    sourceMaxBytes:INDUSTRY_MAX_QASM_BYTES,
    backends:["stabilizer-tableau","separable-state","partitioned-statevector"],
    measurement:"terminal measurements only",arbitraryQasm3:false,devicePulses:false},
   optimization:{objective:"weighted-undirected-maxcut",qubits:{min:2,max:10},
    algorithm:"ideal-p1-QAOA",classicalBaseline:"exhaustive-global-optimum",
    shots:{min:128,max:1024},hardConstraints:false}
  },
  caveat:"Non-Clifford entanglement remains bounded by component amplitude budgets. Workloads can exceed hosting runtime even when parsing succeeds; use customer-qualified hosting for production."
 };
}
export function prepareIndustryJob(raw:unknown):PreparedJob{
 if(!scalar(raw))throw new IndustryInputError("Job must be a JSON object.");
 requireFields(raw,["schema","jobId","kind","operation","source","graph","shots","seed"]);
 if(raw.schema!==INDUSTRY_SCHEMA)throw new IndustryInputError("Unsupported job schema. Expected "+INDUSTRY_SCHEMA+".");
 const jobId=id(raw.jobId);
 if(raw.kind==="circuit"){
  if(raw.operation!=="inspect"&&raw.operation!=="execute")
   throw new IndustryInputError("Circuit operation must be inspect or execute.");
  if(raw.graph!==undefined)throw new IndustryInputError("Circuit jobs do not accept a graph.");
  if(typeof raw.source!=="string"||!raw.source.trim())
   throw new IndustryInputError("Circuit source is required.");
  if(Buffer.byteLength(raw.source,"utf8")>INDUSTRY_MAX_QASM_BYTES)
   throw new IndustryInputError("Circuit source exceeds the 100 KiB API budget.",413);
  let program:LargeProgram;
  try{program=parseLargeQasm(raw.source);}
  catch(e){throw new IndustryInputError("Unsupported or invalid OpenQASM subset: "+(e as Error).message);}
  const method=methodFor(program);
  if(raw.operation==="inspect"){
   if(raw.shots!==undefined||raw.seed!==undefined)
    throw new IndustryInputError("Inspect-only requests must omit shots and seed.");
  }else{
   uint(raw.shots,"shots",INDUSTRY_MAX_CIRCUIT_SHOTS,1);
   uint(raw.seed,"seed",4294967295,0);
   if(program.qubits>INDUSTRY_MAX_CIRCUIT_QUBITS||
    program.steps.length>INDUSTRY_MAX_CIRCUIT_GATES)
    throw new IndustryInputError("Synchronous execution is limited to "+INDUSTRY_MAX_CIRCUIT_QUBITS+
     " qubits and "+INDUSTRY_MAX_CIRCUIT_GATES+" gates. Use inspect mode for larger circuits.");
  }
  const job:IndustryCircuitJob={schema:INDUSTRY_SCHEMA,jobId,kind:"circuit",
   operation:raw.operation,source:raw.source,
   ...(raw.operation==="execute"?{shots:raw.shots as number,seed:raw.seed as number}:{})};
  const canonical=JSON.stringify({kind:job.kind,operation:job.operation,
   sourceSha256:sourceDigest(job.source),shots:job.shots??null,seed:job.seed??null});
  return{job,program,method,canonical,digest:createHash("sha256").update(canonical).digest("hex")};
 }
 if(raw.kind==="optimization"){
  if(raw.operation!=="execute")throw new IndustryInputError("Optimization jobs require execute.");
  if(raw.source!==undefined)throw new IndustryInputError("Optimization jobs cannot include circuit source.");
  const shots=uint(raw.shots,"shots",1024,128);
  const seed=uint(raw.seed,"seed",4294967295,0);
  let graph:IndustrialGraph;
  try{graph=validateIndustrialGraph(raw.graph);}
  catch(e){throw new IndustryInputError("Invalid weighted MaxCut model: "+(e as Error).message);}
  const job:IndustryOptimizationJob={schema:INDUSTRY_SCHEMA,jobId,kind:"optimization",operation:"execute",graph,shots,seed};
  const canonical=JSON.stringify({kind:job.kind,graph,shots,seed});
  return{job,graph,canonical,digest:createHash("sha256").update(canonical).digest("hex")};
 }
 throw new IndustryInputError("Job kind must be circuit or optimization.");
}
const provenance=(prepared:PreparedJob)=>({
 jobId:prepared.job.jobId,inputSha256:prepared.digest,canonicalInputJson:prepared.canonical,physicalQpu:false as const,runEnvironment:"classical-software",
 calculationFamily:prepared.job.kind
});
export interface IndustryExecutionResponse {
 schema:typeof INDUSTRY_RESULT_SCHEMA;
 status:"completed"|"inspected";
 jobId:string;
 inputSha256:string;
 canonicalInputJson:string;
 physicalQpu:false;
 runEnvironment:string;
 calculationFamily:"circuit"|"optimization";
 elapsedMs:number;
 sourceSha256?:string;
 result?:ReturnType<typeof runIndustrialOptimization>;
 analysis?:{
  logicalQubits:number;classicalBits:number;expandedGates:number;method:ScalableMethod;
  statevectorAllocatedGlobally:boolean;noiseCalibrated:boolean;hardwareDevice:boolean;note:string;
  exactForSupportedCircuit?:boolean;limitations?:string;finiteSupportRank?:number|null;idealProbabilityLog2?:number|null;
 };
 samples?:{seed:number;requestedShots:number;completedShots:number;
  counts:Record<string,number>;frequencies:Record<string,number>;
  idealProbabilitiesReported:Record<string,number>;omittedIdealProbabilityMass:number};
}
export function executePreparedIndustryJob(prepared:PreparedJob):IndustryExecutionResponse{
 const start=performance.now();
 if("graph" in prepared){
  const job=prepared.job;
  const result=runIndustrialOptimization(prepared.graph,job.shots,job.seed);
  return{schema:INDUSTRY_RESULT_SCHEMA,status:"completed",...provenance(prepared),
   elapsedMs:performance.now()-start,result};
 }
 const {program,method}=prepared,job=prepared.job;
 const summary={logicalQubits:program.qubits,classicalBits:program.bits,
  expandedGates:program.steps.length,method,
  statevectorAllocatedGlobally:false,noiseCalibrated:false,hardwareDevice:false,
  note:"Exact ideal computation only for mathematically supported circuit families; resource acceptance at runtime."};
 if(job.operation==="inspect")
  return{schema:INDUSTRY_RESULT_SCHEMA,status:"inspected",...provenance(prepared),
   sourceSha256:sourceDigest(job.source),elapsedMs:performance.now()-start,analysis:summary};
 const result=simulateScalable(program,job.shots!,job.seed!);
 const observed=Object.values(result.counts).reduce((a,b)=>a+b,0);
 if(observed!==job.shots)throw new Error("Internal invariant failed: incomplete shot histogram.");
 return{schema:INDUSTRY_RESULT_SCHEMA,status:"completed",...provenance(prepared),
  sourceSha256:sourceDigest(job.source),elapsedMs:performance.now()-start,
  analysis:{...summary,method:result.method,exactForSupportedCircuit:result.exact,
   limitations:result.detail,finiteSupportRank:result.supportRank??null,
   idealProbabilityLog2:result.idealProbabilityLog2??null},
  samples:{seed:job.seed!,requestedShots:job.shots!,completedShots:observed,
   counts:result.counts,frequencies:result.probabilities,
   idealProbabilitiesReported:result.idealProbabilities,
   omittedIdealProbabilityMass:result.distributionInfo.omittedIdealProbabilityMass}
 };
}
export function executeIndustryBatch(raw:unknown){
 if(!scalar(raw))throw new IndustryInputError("Batch body must be a JSON object.");
 requireFields(raw,["schema","jobs"]);
 if(raw.schema!=="MAH-Quantum-Industry-Batch/v1")
  throw new IndustryInputError("Unsupported batch schema.");
 if(!Array.isArray(raw.jobs)||raw.jobs.length<1||raw.jobs.length>INDUSTRY_MAX_BATCH)
  throw new IndustryInputError("Batch requires 1–"+INDUSTRY_MAX_BATCH+" jobs.");
 const prepared=raw.jobs.map(prepareIndustryJob);
 const ids=new Set(prepared.map(p=>p.job.jobId));
 if(ids.size!==prepared.length)throw new IndustryInputError("Batch job IDs must be unique.");
 // Conservative workload budget protects synchronous serverless functions.
 const work=prepared.reduce((sum,p)=>{
  if("graph" in p)return sum+1000000;
  if(p.job.operation==="inspect")return sum+50000;
  return sum+p.program.qubits*Math.max(1,p.program.steps.length)*p.job.shots!;
 },0);
 if(work>180000000)throw new IndustryInputError("Batch exceeds aggregate synchronous processing budget.");
 return{schema:"MAH-Quantum-Industry-Batch-Result/v1",execution:"synchronous",
  items:prepared.map(executePreparedIndustryJob),total:prepared.length};
}
