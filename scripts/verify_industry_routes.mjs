/* End-to-end integration checks of *actual* bundled API route entrypoints.
 * Bundling exercises the same TypeScript module edges as a Node serverless
 * runtime; this does not prove a live deployed cloud origin or SLA.
 */
import assert from "node:assert/strict";
import {build} from "esbuild";
import {createRequire} from "node:module";
import {spawn} from "node:child_process";
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
const secret="offline-fail-closed-integration-test-secret-2026";
const root=resolve("artifacts/industry-route-build");
mkdirSync(root,{recursive:true});
await build({
 entryPoints:["api/v1/execute.ts","api/v1/batch.ts","api/v1/capabilities.ts",
  "api/circuit/simulate.ts","api/health.ts"],
 outdir:root,bundle:true,platform:"node",format:"cjs",target:"node22",
 outExtension:{".js":".cjs"},logLevel:"silent",
 packages:"external"
});
const require=createRequire(import.meta.url);
const execute=require(resolve(root,"v1/execute.cjs")).default;
const batch=require(resolve(root,"v1/batch.cjs")).default;
const caps=require(resolve(root,"v1/capabilities.cjs")).default;
const legacy=require(resolve(root,"circuit/simulate.cjs")).default;
const health=require(resolve(root,"health.cjs")).default;
const evidence=[];
function invoke(handler,method,body,authorization="Bearer "+secret,headers={}){
 const out={headers:{},status:0,data:null};
 const res={
  setHeader(k,v){out.headers[k.toLowerCase()]=v;return this;},
  status(n){out.status=n;return this;},
  json(value){out.data=value;return this;}
 };
 handler({method,body,headers:{"content-type":"application/json",authorization,...headers}},res);
 return out;
}
const test=(name,fn)=>{
 const result=fn();evidence.push({name,status:"PASS",...result});console.log("INDUSTRY_API_GATE "+JSON.stringify(evidence.at(-1)));
};
const qasm="OPENQASM 2.0; qreg q[1000]; creg c[1000]; h q[0]; cx q[0],q[999];";
const qjob={schema:"MAH-Quantum-Industry-Job/v1",jobId:"lab-2026-q",
 kind:"circuit",operation:"execute",source:qasm,shots:128,seed:29};
const graph={name:"Manufacturing pair",nodes:["A","B"],edges:[{source:0,target:1,weight:1}]};
const ojob={schema:"MAH-Quantum-Industry-Job/v1",jobId:"lab-2026-opt",
 kind:"optimization",operation:"execute",graph,shots:128,seed:29};
const before=process.env.MAH_QUANTUM_INDUSTRY_API_KEY;
try{
 delete process.env.MAH_QUANTUM_INDUSTRY_API_KEY;
 test("Production route disabled without server-only credential",()=>{
  const r=invoke(execute,"POST",qjob);
  assert.equal(r.status,503);return{httpStatus:r.status};
 });
 process.env.MAH_QUANTUM_INDUSTRY_API_KEY=secret;
 test("Capabilities route advertises truthful circuit / instrument limits",()=>{
  const r=invoke(caps,"GET",null,"");
  assert.equal(r.status,200);
  assert.equal(r.data.physicalQpu,false);
  assert.equal(r.data.physicalInstrumentControl,false);
  assert.equal(r.data.formats.circuit.executeMaxLogicalQubits,2048);
  return{httpStatus:r.status};
 });
 test("Former unauthenticated compatibility route refuses execution without wildcard CORS",()=>{
  const r=invoke(legacy,"POST",{qubits:1,shots:128,steps:[]});
  assert.equal(r.status,410);
  assert.equal(r.headers["access-control-allow-origin"],undefined);
  assert.match(r.data.message,/authenticated/);
  return{retired:true,noAnonymousExecution:true};
 });
 test("Public health route advertises scoped capabilities, not unsupported physical hardware",()=>{
  const r=invoke(health,"GET",null,"");
  assert.equal(r.status,200);
  assert.equal(r.data.denseStatevectorMaxQubits,20);
  assert.equal(r.data.authenticatedRemoteExecuteMaxQubits,2048);
  assert.equal(r.data.physicalQuantumProcessor,false);
  return{maxDenseQubits:20,remoteMax:2048};
 });
 test("Actual serverless QASM route rejects unauthenticated operator",()=>{
  const r=invoke(execute,"POST",qjob,"Bearer bad");
  assert.equal(r.status,401);
  assert.equal(r.headers["access-control-allow-origin"],undefined);
  return{httpStatus:r.status};
 });
 test("1000Q GHZ executes through bundled serverless API and reconciles complete shots",()=>{
  const r=invoke(execute,"POST",qjob);
  assert.equal(r.status,200);
  assert.equal(r.data.samples.completedShots,128);
  assert.equal(Object.values(r.data.samples.counts).reduce((a,b)=>a+b,0),128);
  assert.equal(r.data.analysis.method,"stabilizer-tableau");
  assert.equal(r.data.physicalQpu,false);
  return{qubits:r.data.analysis.logicalQubits,shots:r.data.samples.completedShots};
 });
 test("Actual optimization endpoint checks global classical optimum",()=>{
  const r=invoke(execute,"POST",ojob);
  assert.equal(r.status,200);
  assert.equal(r.data.result.classical.optimum,1);
  assert.equal(r.data.result.quantum.outcomes.reduce((s,o)=>s+o.count,0),128);
  return{optimum:r.data.result.classical.optimum,shots:128};
 });
 test("Bundled synchronous batch supports distinct job identifiers",()=>{
  const r=invoke(batch,"POST",{schema:"MAH-Quantum-Industry-Batch/v1",jobs:[qjob,ojob]});
  assert.equal(r.status,200);assert.equal(r.data.total,2);
  assert.deepEqual(r.data.items.map(x=>x.status),["completed","completed"]);
  return{jobs:r.data.total};
 });
 test("Malformed and oversized body denied by live route adapter",()=>{
  assert.equal(invoke(execute,"POST","{").status,400);
  assert.equal(invoke(execute,"POST",qjob,undefined,{"content-length":"131073"}).status,413);
  assert.equal(invoke(execute,"POST",qjob,undefined,{"content-type":"text/plain"}).status,415);
  return{checks:3};
 });
}finally{
 if(before===undefined)delete process.env.MAH_QUANTUM_INDUSTRY_API_KEY;
 else process.env.MAH_QUANTUM_INDUSTRY_API_KEY=before;
}
// Exercise the real local Express transport independently of the Vercel shell.
const port=18471;
const daemon=spawn(process.execPath,["apps/engine/dist/server.js"],{
 env:{...process.env,PORT:String(port),MAH_QUANTUM_INDUSTRY_API_KEY:secret},
 stdio:"ignore"
});
try{
 let online=false;
 for(let i=0;i<50;i++){
  if(daemon.exitCode!==null)throw Error("Local Express engine exited before it became healthy.");
  try{
   const response=await fetch("http://127.0.0.1:"+port+"/api/v1/capabilities");
   if(response.ok){online=true;break;}
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!online)throw Error("Local Express integration endpoint did not start within the bounded test.");
 const rejected=await fetch("http://127.0.0.1:"+port+"/api/v1/execute",{
  method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer incorrect"},body:JSON.stringify(qjob)
 });
 assert.equal(rejected.status,401);
 const response=await fetch("http://127.0.0.1:"+port+"/api/v1/execute",{
  method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+secret},body:JSON.stringify(qjob)
 });
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.samples.completedShots,128);
 assert.equal(data.analysis.logicalQubits,1000);
 const legacyHttp=await fetch("http://127.0.0.1:"+port+"/api/circuit/simulate",{
  method:"POST",headers:{"Content-Type":"application/json"},body:"{}"
 });
 assert.equal(legacyHttp.status,410);
 evidence.push({name:"Real local Express industry HTTP port, authentication, 1000Q engine and retired legacy",
  status:"PASS",qubits:1000,shots:128,unauthorizedDenied:true,legacyRetired:true});
 console.log("INDUSTRY_API_GATE "+JSON.stringify(evidence.at(-1)));
}finally{
 daemon.kill("SIGTERM");
}
mkdirSync("artifacts",{recursive:true});
writeFileSync("artifacts/industry-api-release-gate.json",JSON.stringify({
 schema:"MAH-Quantum-Industry-Route-Verification/v1",
 recordedAtUtc:new Date().toISOString(),commit:process.env.GITHUB_SHA||"local",
 scope:"Bundled Node API route integration; no real cloud deployment or physical hardware verified",
 tests:evidence,passed:evidence.length,failed:0
},null,2)+"\n");
console.log("INDUSTRY_API_GATE_SUMMARY "+JSON.stringify({total:evidence.length,passed:evidence.length,failed:0}));
