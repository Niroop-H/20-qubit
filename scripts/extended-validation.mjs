/**
 * Extended software verification: 20 logical qubits, numerical reference,
 * compiler, sampling, noise and resource bounds.
 * Run after npm test: node scripts/extended-validation.mjs
 * Writes machine-readable, individually traceable evidence.
 * Does NOT establish performance of any physical quantum processing unit.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import process from "node:process";
const require=createRequire(import.meta.url);
const { parseQasm, toQasm }=require("../apps/engine/dist/studio/qasm.js");
const { simulate, idealState, summarizeState, expectation }=require("../apps/engine/dist/studio/simulate.js");
const { QuantumCircuit }=require("../apps/engine/dist/simulator/QuantumCircuit.js");
const { validateProgram, MAX_QUBITS }=require("../apps/engine/dist/studio/model.js");
const { simulateRequest }=require("../apps/engine/dist/studio/request.js");
const { transpile }=require("../apps/engine/dist/studio/transform.js");
const checks=[];
const startAll=performance.now();
function caseRun(group,name,fn) {
 const t=performance.now(), id="EV-"+String(checks.length+1).padStart(3,"0");
 try {
  const facts=fn()||{};
  checks.push({id,group,name,status:"PASS",durationMs:+(performance.now()-t).toFixed(3),...facts});
  console.log(id+" PASS "+group+": "+name);
 } catch(e) {
  checks.push({id,group,name,status:"FAIL",durationMs:+(performance.now()-t).toFixed(3),
    error:String(e?.stack||e)});
  console.error(id+" FAIL "+group+": "+name+" :: "+String(e?.message||e));
 }
}
const eq=(a,b,t=1e-11)=>assert.ok(Math.abs(a-b)<=t, "expected "+b+" got "+a+"; abs error "+Math.abs(a-b));
const qasm=(body,n=20)=>parseQasm('OPENQASM 2.0; include "qelib1.inc"; qreg q['+n+']; creg c['+n+']; '+body);
const bit=(n,k)=>(2**k).toString(2).padStart(n,"0");
const sum=v=>Object.values(v).reduce((a,b)=>a+b,0);
const noise={enabled:true,t1:50,t2:70,gateTime:.02,readoutError:[0,0],depolarizingRate:0};
function overlap(a,b) {
 let r=0,i=0;
 for(let k=0;k<a.stateSize;k++) {
  r+=a.real[k]*b.real[k]+a.imag[k]*b.imag[k];
  i+=a.real[k]*b.imag[k]-a.imag[k]*b.real[k];
 }
 return r*r+i*i;
}
function randomProgram(seed) {
 let v=seed>>>0;
 const rnd=()=>{v^=v<<13;v^=v>>>17;v^=v<<5;return (v>>>0)/4294967296};
 const gates=["H","X","Y","Z","S","T","RX","RY","RZ","U","CX","CZ","SWAP","CCX"];
 const steps=[];
 for(let k=0;k<27;k++){
  const gate=gates[Math.floor(rnd()*gates.length)];
  const q=Math.floor(rnd()*5);
  const candidates=[0,1,2,3,4].filter(x=>x!==q);
  let controls=[],targets=[q],params={};
  if(gate==="CX"||gate==="CZ")controls=[candidates[Math.floor(rnd()*candidates.length)]];
  if(gate==="SWAP")targets=[q,candidates[Math.floor(rnd()*candidates.length)]];
  if(gate==="CCX") {
   const ci=Math.floor(rnd()*candidates.length);
   controls=[candidates[ci],candidates.filter(x=>x!==candidates[ci])[Math.floor(rnd()*3)]];
  }
  if(["RX","RY","RZ","U"].includes(gate))params={theta:(rnd()-.5)*5};
  if(gate==="U")params={...params,phi:(rnd()-.5)*4,lambda:(rnd()-.5)*4};
  steps.push({id:"rand-"+seed+"-"+k,gate,targets,controls,params});
 }
 return {qubits:5,bits:5,steps};
}
caseRun("baseline","engine declares 100 Studio logical qubits while dense tests remain at 20",()=>{assert.equal(MAX_QUBITS,100);return {maxQubits:MAX_QUBITS,denseQubitTestWidth:20}});
for(let n=1;n<=20;n++)caseRun("registers","OpenQASM 2 register width "+n,()=>{
 const p=qasm("h q[0];",n); assert.equal(p.qubits,n);assert.equal(p.bits,n);return {qubits:n,format:"OpenQASM 2"};});
for(let n=1;n<=20;n++)caseRun("registers","OpenQASM 3 register width "+n,()=>{
 const p=parseQasm('OPENQASM 3; include "stdgates.inc"; qubit['+n+'] q; bit['+n+'] c; x q[0];');
 assert.equal(p.qubits,n);assert.equal(p.bits,n);return {qubits:n,format:"OpenQASM 3"};});
for(let q=0;q<20;q++)caseRun("basis","X basis addressing q["+q+"]",()=>{
 const out=simulate(qasm("x q["+q+"];"),64,101);
 assert.equal(out.counts[bit(20,q)],64);assert.equal(sum(out.counts),64);
 return {qubits:20,target:q,shots:64,exact:1};
});
for(let q=0;q<20;q++)caseRun("superposition","H probability on q["+q+"]",()=>{
 const out=simulate(qasm("h q["+q+"];"),128,102);
 eq(out.idealProbabilities["0".repeat(20)],.5,1e-12);
 eq(out.idealProbabilities[bit(20,q)],.5,1e-12);
 assert.equal(sum(out.counts),128);
 return {qubits:20,target:q,idealProbability:.5,shots:128};
});
for(let q=0;q<20;q++)caseRun("reversibility","H-H returns to |0> on q["+q+"]",()=>{
 const out=simulate(qasm("h q["+q+"]; h q["+q+"];"),128,103);
 assert.equal(out.counts["0".repeat(20)],128);
 eq(out.idealProbabilities["0".repeat(20)],1,1e-12);
 return {qubits:20,target:q,returnProbability:out.idealProbabilities["0".repeat(20)]};
});
for(let k=1;k<=19;k++)caseRun("entanglement","long-range Bell q[0]-q["+k+"]",()=>{
 const out=simulate(qasm("h q[0]; cx q[0],q["+k+"];"),256,104);
 const x=(1+2**k).toString(2).padStart(20,"0"),z="0".repeat(20);
 eq(out.idealProbabilities[x],.5,1e-12);eq(out.idealProbabilities[z],.5,1e-12);
 assert.equal(sum(out.counts),256);
 return {qubits:20,control:0,target:k,idealProbabilityError:Math.abs(out.idealProbabilities[x]-.5)};
});
for(let seed=1;seed<=16;seed++)caseRun("independent oracle","random 5-qubit 27-gate case seed "+seed,()=>{
 const p=randomProgram(seed*1777);
 validateProgram(p);
 const oracle=spawnSync("python",["scripts/independent_reference.py"],{input:JSON.stringify(p),encoding:"utf8",maxBuffer:1000000});
 assert.equal(oracle.status,0,oracle.stderr||String(oracle.error));
 const expect=JSON.parse(oracle.stdout);
 const c=idealState(p);
 let maxError=0,norm=0;
 for(let i=0;i<c.stateSize;i++) {
  maxError=Math.max(maxError,Math.abs(c.real[i]-expect[i][0]),Math.abs(c.imag[i]-expect[i][1]));
  norm+=c.real[i]*c.real[i]+c.imag[i]*c.imag[i];
 }
 eq(norm,1,2e-11);
 assert.ok(maxError<2e-11,"component discrepancy "+maxError);
 return {qubits:5,gates:p.steps.length,reference:"Python independent complex oracle",maxComponentError:maxError,normError:Math.abs(norm-1)};
});
for(const ang of [-2.4,-1.3,-.731,-.2,0,.2,.731,1.3,2.4]){
 caseRun("interference","Ramsey analytical phase theta="+ang,()=>{
  const out=simulate(qasm("h q[0]; cx q[0],q[19]; rz("+ang+") q[19]; cx q[0],q[19]; h q[0];"),64,105);
  const want=Math.sin(ang/2)**2,actual=out.idealProbabilities[bit(20,0)]||0;
  eq(actual,want,1e-11);
  return {qubits:20,theta:ang,analytical:want,computed:actual,absoluteError:Math.abs(actual-want)};
 });
}
for(const k of [3,7,13,19])caseRun("compiler","linear-neighbor transpile q0->q"+k,()=>{
 const p=qasm("h q[0]; cx q[0],q["+k+"];");
 const tr=transpile(p,true);
 assert.ok(tr.steps.length<=256);
 assert.ok(tr.steps.every(s=>s.gate==="U"||(s.gate==="CX"&&Math.abs(s.targets[0]-s.controls[0])===1)));
 const fidelity=overlap(idealState(p),idealState(tr));
 eq(fidelity,1,1e-10);
 return {qubits:20,distance:k,originalOperations:p.steps.length,compiledOperations:tr.steps.length,fidelity};
});
for(const index of [0,1,9,19])caseRun("measurement","map high quantum index q"+index+" to c0",()=>{
 const out=simulate(qasm("x q["+index+"]; measure q["+index+"] -> c[0];"),72,106);
 assert.equal(out.counts[bit(20,0)],72);
 return {qubits:20,source:index,destination:0,shots:72};
});
for(const index of [0,5,10,19])caseRun("measurement","map q0 to classical bit c"+index,()=>{
 const out=simulate(qasm("x q[0]; measure q[0] -> c["+index+"];"),72,106);
 assert.equal(out.counts[bit(20,index)],72);
 return {qubits:20,source:0,destination:index,shots:72};
});
for(const n of [1,8,12,16,20])caseRun("serialization","QASM 2/3 roundtrip at "+n+" qubits",()=>{
 const original=qasm("h q[0]; x q["+(n-1)+"];",n);
 for(const version of [2,3]){
  const parsed=parseQasm(toQasm(original,version));
  assert.equal(parsed.qubits,n);assert.equal(parsed.steps.length,2);
  eq(overlap(idealState(original),idealState(parsed)),1,1e-12);
 }
 return {qubits:n,formats:["QASM2","QASM3"]};
});
const badCases=[
 ["zero width",()=>new QuantumCircuit(0)],
 ["21 width",()=>new QuantumCircuit(21)],
 ["noninteger width",()=>new QuantumCircuit(2.5)],
 ["negative width QASM",()=>qasm("x q[0];",0)],
 ["21 quantum QASM",()=>qasm("x q[0];",21)],
 ["duplicate step identifier",()=>validateProgram({qubits:2,bits:2,steps:[{id:"dup",gate:"H",targets:[0]},{id:"dup",gate:"H",targets:[1]}]})],
 ["target above width",()=>validateProgram({qubits:2,bits:2,steps:[{id:"out",gate:"X",targets:[2]}]})],
 ["control equals target",()=>validateProgram({qubits:2,bits:2,steps:[{id:"equal",gate:"CX",targets:[0],controls:[0]}]})],
 ["unknown operation",()=>validateProgram({qubits:2,bits:2,steps:[{id:"bad",gate:"CUSTOM",targets:[0]}]})],
 ["nonfinite parameter",()=>validateProgram({qubits:2,bits:2,steps:[{id:"nan",gate:"RX",targets:[0],params:{theta:NaN}}]})],
 ["mid-circuit measurement",()=>qasm("measure q[0] -> c[0]; h q[0];",2)],
 ["duplicate classical output",()=>qasm("measure q[0] -> c[0]; measure q[1] -> c[0];",2)],
 ["zero shots",()=>simulate(qasm("x q[0];",1),0,1)],
 ["too many shots",()=>simulate(qasm("x q[0];",1),8193,1)],
 ["negative seed",()=>simulate(qasm("x q[0];",1),64,-1)],
 ["seed beyond uint32",()=>simulate(qasm("x q[0];",1),64,4294967296)],
 ["oversize noisy work",()=>simulate(qasm("h q;"),8192,1,{...noise,enabled:true})],
 ["bad request schema",()=>simulateRequest({qubits:21,bits:21,steps:[],shots:64,seed:1})],
];
for(const [name,fn] of badCases)caseRun("negative validation",name,()=>{
 assert.throws(fn);return {rejected:true};
});
caseRun("statistics","seeded GHZ counts and 5-sigma acceptance",()=>{
 let src="h q[0];";
 for(let q=1;q<20;q++)src+=" cx q["+(q-1)+"],q["+q+"];";
 const p=qasm(src),a=simulate(p,4096,42),b=simulate(p,4096,42);
 assert.deepEqual(a.counts,b.counts);
 const zero="0".repeat(20),one="1".repeat(20);
 const obs=a.counts[one],expected=2048;
 assert.ok(Math.abs(obs-expected)<=5*Math.sqrt(4096*.25));
 assert.equal(sum(a.counts),4096);
 return {qubits:20,shots:4096,ones:obs,zeros:a.counts[zero],fiveSigmaBound:160,reproducible:true};
});
caseRun("resource","dense 20-qubit uniform state and exact missing mass",()=>{
 const out=simulate(qasm("h q;"),512,9);
 assert.equal(out.stateVectorInfo.totalStates,1048576);
 assert.equal(out.stateVectorInfo.nonZeroStates,1048576);
 assert.equal(out.stateVectorInfo.shownStates,128);
 eq(out.stateVectorInfo.retainedProbabilityMass,128/1048576,1e-10);
 assert.ok(out.distributionInfo.omittedIdealProbabilityMass>0.99);
 return {qubits:20,basisStates:1048576,displayed:128,omittedProbabilityMass:out.distributionInfo.omittedIdealProbabilityMass,
  retainedStateMass:out.stateVectorInfo.retainedProbabilityMass,shots:512,rssMiB:+(process.memoryUsage().rss/1048576).toFixed(2)};
});
caseRun("resource","exact 20-qubit ground state remains sparse",()=>{
 const c=new QuantumCircuit(20);const s=summarizeState(c);
 assert.equal(s.stateVectorInfo.nonZeroStates,1);assert.equal(s.stateVectorInfo.shownStates,1);
 eq(s.stateVectorInfo.omittedProbabilityMass,0);
 return {qubits:20,nonZero:1,retainedMass:1};
});
caseRun("observables","20-qubit |+> Pauli X and Z expectations",()=>{
 const c=idealState(qasm("h q[0];"));
 eq(expectation(c,"I".repeat(19)+"X"),1,1e-11);
 eq(expectation(c,"I".repeat(19)+"Z"),0,1e-11);
 return {qubits:20,expectationX:1,expectationZ:0};
});
caseRun("noise","readout bit-flip one qubit",()=>{
 const out=simulate(qasm("x q[0];",1),64,3,{...noise,readoutError:[1,1]});
 assert.equal(out.counts["0"],64);return {qubits:1,shots:64,flipProbability:1};
});
caseRun("noise","T1 relaxation under strong amplitude damping",()=>{
 const out=simulate(qasm("x q[0];",1),64,3,{...noise,t1:.001,t2:.001,gateTime:1});
 assert.equal(out.counts["0"],64);return {qubits:1,shots:64,relaxed:true};
});
caseRun("noise","deterministic same-seed trajectory replay",()=>{
 const p=qasm("h q[0]; cx q[0],q[1];",2);
 const config={...noise,t1:10,t2:15,gateTime:.2,readoutError:[.02,.03],depolarizingRate:.03};
 const a=simulate(p,256,66,config),b=simulate(p,256,66,config);
 assert.deepEqual(a.counts,b.counts);
 assert.equal(a.backendInfo.fidelityEstimated,null);
 return {qubits:2,shots:256,replay:true,noHardwareFidelityClaim:true};
});
const failures=checks.filter(x=>x.status==="FAIL");
const report={
 schema:"MQ-Quantum-Studio-Extended-Validation/v1",
 gitSha:process.env.GITHUB_SHA||"local",generatedUtc:new Date().toISOString(),
 target:"MAH Quantum 20-logical-qubit ideal statevector simulator",
 scopeNote:"Software verification only. Not a physical QPU test or industrial safety certification.",
 environment:{node:process.version,platform:process.platform,arch:process.arch,cpus:cpus().length,memoryGiB:+(totalmem()/2**30).toFixed(2)},
 counts:{total:checks.length,passed:checks.length-failures.length,failed:failures.length},
 elapsedMs:+(performance.now()-startAll).toFixed(3),
 evidence:checks,
 issues:failures.map(x=>({id:x.id,name:x.name,error:x.error}))
};
mkdirSync("artifacts",{recursive:true});
writeFileSync("artifacts/extended-quantum-validation.json",JSON.stringify(report,null,2)+"\n");
console.log("EXTENDED VALIDATION SUMMARY "+JSON.stringify({counts:report.counts,elapsedMs:report.elapsedMs,sha:report.gitSha}));
if(failures.length)process.exitCode=1;
