import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {inspectIndustryCapability,prepareIndustryJob,executePreparedIndustryJob,
 executeIndustryBatch,INDUSTRY_SCHEMA} from "../studio/enterprise";
import {serveIndustryHttp,type IndustryHttpResponse} from "../studio/industry-http";

const secret="industrial-integration-test-token-not-a-real-credential-001";
const source=(n:number,operations="h q[0]; cx q[0],q[1];")=>
 "OPENQASM 2.0; qreg q["+n+"]; creg c["+n+"]; "+operations;
const circuit=(n=1000,options:Record<string,unknown>={})=>({
 schema:INDUSTRY_SCHEMA,jobId:"plant-2026-0001",kind:"circuit",operation:"execute",
 source:source(n),shots:64,seed:2026,...options
});
const graph={name:"Synthetic plant separation",nodes:["A","B","C"],edges:[
 {source:0,target:1,weight:2},{source:1,target:2,weight:3}
]};
const optimize=(options:Record<string,unknown>={})=>({
 schema:INDUSTRY_SCHEMA,jobId:"plant-opt-001",kind:"optimization",operation:"execute",
 graph,shots:256,seed:2026,...options
});
function mockHttp(action:"execute"|"batch"|"capabilities",body:unknown,options:{
 method?:string;token?:string;contentType?:string;secret?:string;headers?:Record<string,string>
}={}){
 const headers:Record<string,string>={};
 let code=0,payload:unknown;
 const res:IndustryHttpResponse={
  setHeader(k,v){headers[k.toLowerCase()]=v;return this;},
  status(n){code=n;return this;},
  json(data){payload=data;return this;}
 };
 serveIndustryHttp({method:options.method??(action==="capabilities"?"GET":"POST"),
  headers:{authorization:options.token===undefined?"Bearer "+secret:options.token,
   "content-type":options.contentType??"application/json",...options.headers},body
 },res,action,options.secret===undefined?secret:options.secret);
 return{code,payload:payload as Record<string,any>,headers};
}
describe("Industry v1 interoperability: strong typed mathematical contracts",()=>{
 it("publishes truthful, bounded capabilities with no physical device or universal statevector claims",()=>{
  const cap=inspectIndustryCapability();
  assert.equal(cap.physicalQpu,false);
  assert.equal(cap.physicalInstrumentControl,false);
  assert.equal(cap.formats.circuit.executeMaxLogicalQubits,2048);
  assert.equal(cap.formats.circuit.parserMaxLogicalQubits,4096);
  assert.equal(cap.formats.optimization.qubits.max,10);
 });
 it("inspects but does not execute a permitted 4096-qubit Clifford circuit",()=>{
  const job=prepareIndustryJob(circuit(4096,{operation:"inspect",shots:undefined,seed:undefined}));
  const r=executePreparedIndustryJob(job);
  assert.equal(r.status,"inspected");
  assert.equal(r.analysis?.logicalQubits,4096);
  assert.equal(r.analysis?.method,"stabilizer-tableau");
 });
 it("executes a 1000-qubit ideal GHZ simulation with complete deterministic shot counts",()=>{
  const p=prepareIndustryJob(circuit());
  const a=executePreparedIndustryJob(p),b=executePreparedIndustryJob(p);
  assert.equal(a.schema,"MAH-Quantum-Industry-Result/v1");
  assert.equal(a.status,"completed");
  assert.equal(a.samples?.completedShots,64);
  assert.deepEqual(a.samples?.counts,b.samples?.counts);
  assert.equal(a.analysis?.method,"stabilizer-tableau");
  assert.equal(a.inputSha256,b.inputSha256);
  assert.equal(a.sourceSha256,createHash("sha256").update(source(1000)).digest("hex"));
  assert.equal(a.physicalQpu,false);
 });
 it("supports a real 3-variable industrial QAOA problem with independently verified optimum",()=>{
  const a=executePreparedIndustryJob(prepareIndustryJob(optimize()));
  assert.equal(a.status,"completed");
  assert.equal(a.result?.schema,"MAH-Quantum-Industrial-QAOA-MaxCut/v1");
  assert.equal(a.result?.classical.optimum,5);
  assert.ok(a.result!.quantum.expectedScore<=a.result!.classical.optimum+1e-9);
  assert.equal(a.result?.quantum.outcomes.reduce((s,o)=>s+o.count,0),256);
 });
 it("batch validates all input and job IDs before synchronous execution",()=>{
  const jobs=[circuit(),optimize(),circuit(1000,{jobId:"third",seed:2027})];
  const r=executeIndustryBatch({schema:"MAH-Quantum-Industry-Batch/v1",jobs});
  assert.equal(r.total,3);
  assert.equal(r.items.length,3);
  assert.deepEqual(r.items.map(x=>x.status),["completed","completed","completed"]);
  assert.throws(()=>executeIndustryBatch({schema:"MAH-Quantum-Industry-Batch/v1",
   jobs:[circuit(),circuit()]}),/unique/);
  assert.throws(()=>executeIndustryBatch({schema:"MAH-Quantum-Industry-Batch/v1",
   jobs:[circuit(),optimize(),circuit(1000,{jobId:"three"}),optimize({jobId:"four"})]}),/1–3/);
 });
 it("rejects oversized execution, shots, invalid QASM, rogue control fields and unsafe IDs",()=>{
  for(const body of [
   circuit(4096),circuit(1000,{shots:257}),circuit(1000,{seed:-1}),
   circuit(1000,{source:"OPENQASM 3.0; qubit[1000] q; while (true) {}"}),
   circuit(1000,{admin:true}),circuit(1000,{jobId:"../unsafe"}),
   circuit(1000,{operation:"inspect",shots:64}),
   optimize({shots:1025}),optimize({graph:{...graph,edges:[{source:0,target:1,weight:NaN}]}})
  ])assert.throws(()=>prepareIndustryJob(body));
 });
});
describe("Industry v1 authenticated synchronous HTTP",()=>{
 it("fails closed by default, never accepts an invalid token or permissive CORS",()=>{
  assert.equal(mockHttp("execute",circuit(),{secret:""}).code,503);
  assert.equal(mockHttp("execute",circuit(),{secret:"short"}).code,503);
  assert.equal(mockHttp("execute",circuit(),{token:"Bearer invalid"}).code,401);
  assert.equal(mockHttp("execute",circuit(),{token:""}).code,401);
  const r=mockHttp("execute",circuit(),{method:"OPTIONS"});
  assert.equal(r.code,405);
  assert.equal(r.headers["access-control-allow-origin"],undefined);
  assert.equal(r.headers["cache-control"],"no-store");
 });
 it("supports capabilities GET without credentials, but not POST",()=>{
  assert.equal(mockHttp("capabilities",null,{token:""}).code,200);
  assert.equal(mockHttp("capabilities",null,{method:"POST"}).code,405);
 });
 it("accepts authorized JSON, returns provenance, and rejects unsupported formats",()=>{
  const r=mockHttp("execute",circuit());
  assert.equal(r.code,200);assert.equal(r.payload.status,"completed");
  assert.equal(r.payload.samples.completedShots,64);
  assert.equal(mockHttp("execute",circuit(),{contentType:"text/plain"}).code,415);
  assert.equal(mockHttp("execute",circuit(),{headers:{"content-length":"131073"}}).code,413);
  assert.equal(mockHttp("execute","{malformed").code,400);
  assert.equal(mockHttp("execute",circuit(),{method:"GET"}).code,405);
 });
 it("rejects invalid optimization models and malformed batch jobs before execution",()=>{
  const r=mockHttp("execute",optimize({shots:0}));
  assert.equal(r.code,422);
  assert.equal(r.payload.error,"invalid_industry_request");
  const b=mockHttp("batch",{schema:"MAH-Quantum-Industry-Batch/v1",jobs:[circuit(),circuit()]});
  assert.equal(b.code,422);
  assert.match(b.payload.message,/unique/i);
 });
});
