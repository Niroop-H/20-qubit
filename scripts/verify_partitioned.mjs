/**
 * Independent pre-release mathematical acceptance for the partitioned backend.
 * Reference calculations come from standalone Python complex-array matrices
 * with no imports from the production TypeScript gate library.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdirSync,writeFileSync } from "node:fs";
import {performance} from "node:perf_hooks";
const require=createRequire(import.meta.url);
const {simulateScalable}=require("../apps/engine/dist/studio/scalable.js");
const {parseLargeQasm}=require("../apps/engine/dist/studio/largeQasm.js");
const results=[],begin=performance.now();
const close=(a,b,t=2e-11)=>assert.ok(Math.abs(a-b)<t,"Expected "+b+" but got "+a+" (|error|="+Math.abs(a-b)+")");
function check(name,fn){
 const t=performance.now();
 try{
  const data=fn()||{};
  const result={name,status:"PASS",durationMs:+(performance.now()-t).toFixed(2),...data};
  results.push(result);console.log("PARTITIONED_REFERENCE "+JSON.stringify(result));
 }catch(err){
  const result={name,status:"FAIL",durationMs:+(performance.now()-t).toFixed(2),error:String(err.stack||err)};
  results.push(result);console.error("PARTITIONED_REFERENCE "+JSON.stringify(result));
 }
}
function rng(seed){let x=seed>>>0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};}
const op=(id,gate,targets,controls=[],params={})=>({id,gate,targets,controls,params});
const families=["H","T","X","Y","Z","S","RX","RY","RZ","U","CX","CZ","SWAP","CCX"];
function circuit(seed){
 const random=rng(seed),n=5,steps=[
  op("h","H",[0]),op("t","T",[0]),op("cx","CX",[4],[0])
 ];
 for(let index=0;index<30;index++){
  const gate=families[Math.floor(random()*families.length)],q=Math.floor(random()*n);
  const candidates=[0,1,2,3,4].filter(x=>x!==q);
  const other=candidates[Math.floor(random()*candidates.length)];
  let targets=[q],controls=[],params={};
  if(gate==="CX"||gate==="CZ")controls=[other];
  if(gate==="SWAP")targets=[q,other];
  if(gate==="CCX"){
   controls=[other,candidates.filter(x=>x!==other)[Math.floor(random()*3)]];
  }
  if(["RX","RY","RZ","U"].includes(gate))params.theta=(random()-.5)*6;
  if(gate==="U"){params.phi=(random()-.5)*6;params.lambda=(random()-.5)*6;}
  steps.push(op("g"+index,gate,targets,controls,params));
 }
 return{qubits:n,bits:n,steps};
}
for(let s=1;s<=24;s++){
 check("Independent Python complex gate oracle seed "+s,()=>{
  const program=circuit(s*314159),shots=2048;
  const py=spawnSync("python",["scripts/independent_reference.py"],{
   encoding:"utf8",input:JSON.stringify(program),timeout:12000,maxBuffer:2000000
  });
  assert.equal(py.status,0,py.stderr||String(py.error));
  const reference=JSON.parse(py.stdout);
  assert.equal(reference.length,32);
  const out=simulateScalable(program,shots,s*7);
  assert.equal(out.method,"partitioned-statevector");
  assert.equal(Object.values(out.counts).reduce((a,b)=>a+b,0),shots);
  let biggest=0;
  let referenceNorm=0;
  for(const [r,i] of reference)referenceNorm+=r*r+i*i;
  close(referenceNorm,1);
  for(const [bits,prob]of Object.entries(out.idealProbabilities)){
   const [r,i]=reference[parseInt(bits,2)],wanted=r*r+i*i;
   biggest=Math.max(biggest,Math.abs(prob-wanted));
   close(prob,wanted);
  }
  return{qubits:program.qubits,operations:program.steps.length,shots,maxProbabilityError:biggest,reference:"Independent Python complex matrix oracle"};
 });
}
check("Analytical 1000-logical-qubit non-Clifford long-range interference",()=>{
 const p=parseLargeQasm('OPENQASM 2.0; qreg q[1000]; creg c[1000]; h q[0]; t q[0]; cx q[0],q[999]; h q[0];');
 const out=simulateScalable(p,1024,19);
 assert.equal(out.method,"partitioned-statevector");
 const candidates=["0".repeat(1000),"0".repeat(999)+"1","1"+"0".repeat(999),"1"+"0".repeat(998)+"1"];
 for(const bits of candidates)close(out.idealProbabilities[bits],.25);
 assert.equal(Object.values(out.counts).reduce((a,b)=>a+b,0),1024);
 return{qubits:1000,support:4,eachIdealProbability:.25,shots:1024};
});
check("Rejects exponential connected workload before component allocation",()=>{
 const steps=[op("h","H",[0]),op("t","T",[0])];
 for(let q=1;q<19;q++)steps.push(op("e"+q,"CX",[q],[q-1]));
 assert.throws(()=>simulateScalable({qubits:1000,bits:1000,steps},32,7),/19 qubits/);
 return{qubits:1000,connectedEntangledQubits:19,rejected:true};
});
const fail=results.filter(x=>x.status==="FAIL");
const evidence={schema:"MQ-Partitioned-Independent-Validation/v1",createdUtc:new Date().toISOString(),
 sha:process.env.GITHUB_SHA||"local",scope:"Numerical independent-reference checks for exact, limited non-Clifford entangled circuits; not hardware fidelity",
 elapsedMs:+(performance.now()-begin).toFixed(2),
 counts:{total:results.length,passed:results.length-fail.length,failed:fail.length},
 results};
mkdirSync("artifacts",{recursive:true});
writeFileSync("artifacts/partitioned-independent-validation.json",JSON.stringify(evidence,null,2)+"\n");
console.log("PARTITIONED_REFERENCE_SUMMARY "+JSON.stringify(evidence.counts));
if(fail.length)process.exitCode=1;
