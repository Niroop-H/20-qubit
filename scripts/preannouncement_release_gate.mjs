/* Twenty-logical-qubit pre-announcement scientific release gate.
 * Independent Python sparse complex oracle; 20-bit addressing and stress.
 * This does not test a physical quantum processor or certify safety.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";
import {performance} from "node:perf_hooks";
import {mkdirSync,writeFileSync} from "node:fs";
import {cpus,totalmem} from "node:os";
const require=createRequire(import.meta.url);
const {simulate,idealState,expectation}=require("../apps/engine/dist/studio/simulate.js");
const {validateProgram,MAX_QUBITS}=require("../apps/engine/dist/studio/model.js");
const {QuantumCircuit}=require("../apps/engine/dist/simulator/QuantumCircuit.js");
const {transpile}=require("../apps/engine/dist/studio/transform.js");
const {parseQasm}=require("../apps/engine/dist/studio/qasm.js");
const {simulateRequest}=require("../apps/engine/dist/studio/request.js");
const cases=[],begin=performance.now(),zero="0".repeat(20);
const sum=values=>Object.values(values).reduce((acc,x)=>acc+x,0);
const p20=body=>parseQasm('OPENQASM 2.0; include "qelib1.inc"; qreg q[20]; creg c[20]; '+body);
const near=(a,b,t,msg)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,msg+" actual="+a+" expected="+b);
function check(label,fn){
 const t=performance.now();
 try {
  const facts=fn()||{};
  const metric={label,status:"PASS",durationMs:+(performance.now()-t).toFixed(3),...facts};
  cases.push(metric);console.log("RELEASE_GATE "+JSON.stringify(metric));
 }catch(e){
  const metric={label,status:"FAIL",durationMs:+(performance.now()-t).toFixed(3),error:String(e?.stack||e)};
  cases.push(metric);console.error("RELEASE_GATE "+JSON.stringify(metric));
 }
}
function prng(seed){let x=seed>>>0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};}
const active=[0,4,9,14,19];
function randomFullWidthCircuit(seed){
 const rnd=prng(seed),gates=["I","H","X","Y","Z","S","T","RX","RY","RZ","U","CX","CZ","SWAP","CCX"];
 const steps=active.map((q,i)=>({id:"prep-"+seed+"-"+i,gate:"H",targets:[q],controls:[]}));
 for(let i=0;i<46;i++){
  const gate=gates[Math.floor(rnd()*gates.length)],target=active[Math.floor(rnd()*active.length)];
  const rest=active.filter(q=>q!==target);
  let targets=[target],controls=[],params={};
  if(gate==="CX"||gate==="CZ")controls=[rest[Math.floor(rnd()*rest.length)]];
  if(gate==="CCX"){controls=[rest[Math.floor(rnd()*rest.length)]];const candidates=rest.filter(q=>q!==controls[0]);controls.push(candidates[Math.floor(rnd()*candidates.length)]);}
  if(gate==="SWAP")targets=[target,rest[Math.floor(rnd()*rest.length)]];
  if(["RX","RY","RZ","U"].includes(gate))params={theta:(rnd()-.5)*5};
  if(gate==="U")params={...params,phi:(rnd()-.5)*4,lambda:(rnd()-.5)*4};
  steps.push({id:"seed-"+seed+"-"+i,gate,targets,controls,params});
 }
 const p={qubits:20,bits:20,steps};validateProgram(p);return p;
}
check("20-qubit capacity and raw state allocation",()=>{
 assert.equal(MAX_QUBITS,20);const c=new QuantumCircuit(20);
 assert.equal(c.stateSize,1048576);assert.equal(c.real.byteLength+c.imag.byteLength,16777216);
 return{qubits:20,basisStates:c.stateSize,rawComplexStateBytes:16777216};
});
for(const seed of [91,102,193,211,244,319,402,511,613,719,821,977]){
 check("Independent 20-qubit complex oracle seed "+seed,()=>{
  const p=randomFullWidthCircuit(seed),a=idealState(p);
  const py=spawnSync("python",["scripts/release_sparse_reference.py"],{input:JSON.stringify(p),encoding:"utf8",maxBuffer:2000000,timeout:20000});
  assert.equal(py.status,0,py.stderr||String(py.error));
  const ref=JSON.parse(py.stdout),expected=new Map(ref.amplitudes.map(([i,r,im])=>[i,[r,im]]));
  let maxError=0,norm=0,significant=0;
  for(let i=0;i<a.stateSize;i++){
   const ex=expected.get(i)||[0,0];
   maxError=Math.max(maxError,Math.abs(a.real[i]-ex[0]),Math.abs(a.imag[i]-ex[1]));
   const prob=a.real[i]*a.real[i]+a.imag[i]*a.imag[i];norm+=prob;
   if(prob>1e-16)significant++;
  }
  near(norm,1,3e-11,"full-width norm");near(ref.norm,1,3e-11,"independent norm");
  assert.ok(maxError<5e-11,"complex amplitude discrepancy "+maxError);
  return{qubits:20,gates:p.steps.length,occupiedReferenceStates:ref.occupied,significantProductionStates:significant,maxComponentError:maxError,normError:Math.abs(norm-1)};
 });
}
check("256-operation 20-qubit ideal circuit",()=>{
 const ops=["h q[0];","h q[19];"];
 for(let i=0;i<254;i++)ops.push(i%2===0?"z q[0];":"z q[19];");
 const p=p20(ops.join(" "));assert.equal(p.steps.length,256);
 const a=simulate(p,4096,27);near(a.idealProbabilities[zero],.25,1e-12,"ideal zero probability");
 near(a.idealProbabilities["1"+"0".repeat(19)],.25,1e-12,"high-bit probability");
 assert.equal(sum(a.counts),4096);
 return{qubits:20,operations:256,shots:4096,idealZero:a.idealProbabilities[zero]};
});
check("8192-shot dense 20-qubit superposition",()=>{
 const a=simulate(p20("h q;"),8192,2026);
 assert.equal(sum(a.counts),8192);assert.equal(a.stateVectorInfo.totalStates,1048576);
 assert.equal(a.stateVectorInfo.nonZeroStates,1048576);assert.equal(a.stateVector.length,128);
 assert.equal(a.distributionInfo.shownOutcomes,Object.keys(a.idealProbabilities).length);
 assert.ok(a.distributionInfo.omittedIdealProbabilityMass>0.98);
 return{qubits:20,shots:8192,sampledLabels:Object.keys(a.counts).length,omittedIdealProbabilityMass:a.distributionInfo.omittedIdealProbabilityMass,rssMiB:+(process.memoryUsage().rss/1048576).toFixed(2)};
});
check("8192-shot 20-qubit GHZ",()=>{
 let src="h q[0];";for(let i=0;i<19;i++)src+="cx q["+i+"],q["+(i+1)+"];";
 const a=simulate(p20(src),8192,2026),ones="1".repeat(20);
 near(a.idealProbabilities[zero],.5,1e-12,"GHZ zero");near(a.idealProbabilities[ones],.5,1e-12,"GHZ one");
 assert.equal(sum(a.counts),8192);
 assert.ok(Math.abs(a.counts[zero]-4096)<300,"GHZ samples outside conservative bound");
 return{qubits:20,shots:8192,zeroCount:a.counts[zero],onesCount:a.counts[ones]};
});
check("q19 -> c0 full 20-bit measurement mapping",()=>{
 const a=simulate(p20("x q[19]; measure q[19] -> c[0];"),1024,91);
 assert.equal(a.counts["0".repeat(19)+"1"],1024);
 near(a.distributionInfo.omittedIdealProbabilityMass,0,1e-12,"ideal mass");
 return{qubits:20,shots:1024,mapping:"q19 to c0"};
});
check("Pauli observables on highest qubit q19",()=>{
 const c=idealState(p20("h q[19];"));
 near(expectation(c,"X"+"I".repeat(19)),1,1e-11,"Pauli X");
 near(expectation(c,"Z"+"I".repeat(19)),0,1e-11,"Pauli Z");
 return{qubits:20,expectationX:1,expectationZ:0};
});
check("Full-width long-range linear transpiler fidelity",()=>{
 const p=p20("h q[0];cx q[0],q[19];"),r=transpile(p,true);
 assert.ok(r.steps.length<=256);
 assert.ok(r.steps.every(s=>s.gate==="U"||(s.gate==="CX"&&Math.abs(s.targets[0]-s.controls[0])===1)));
 const a=idealState(p),b=idealState(r);let re=0,im=0;
 for(let i=0;i<a.stateSize;i++){re+=a.real[i]*b.real[i]+a.imag[i]*b.imag[i];im+=a.real[i]*b.imag[i]-a.imag[i]*b.real[i];}
 const fidelity=re*re+im*im;near(fidelity,1,2e-11,"transpiler fidelity");
 return{qubits:20,routedOperations:r.steps.length,fidelity};
});
check("Over-budget 20-qubit noisy job fails explicitly",()=>{
 assert.throws(()=>simulate(p20("h q;"),8192,1,{enabled:true,t1:50,t2:70,gateTime:.02,readoutError:[.01,.01],depolarizingRate:.001}),/work limit/);
 return{rejected:true};
});
check("Max shots accepted by 20-qubit request schema",()=>{
 const a=simulateRequest({...p20("x q[19];"),shots:8192,seed:2026});
 assert.equal(a.counts["1"+"0".repeat(19)],8192);return{qubits:20,shots:8192};
});
const failures=cases.filter(x=>x.status==="FAIL");
const evidence={
 schema:"MQ-DSQ-20Q-RELEASE-GATE-v1",
 generatedUtc:new Date().toISOString(),gitSha:process.env.GITHUB_SHA||"local",
 scope:"20-logical-qubit ideal statevector software, not physical quantum hardware",
 environment:{node:process.version,platform:process.platform,arch:process.arch,cpuCount:cpus().length,memoryGiB:+(totalmem()/2**30).toFixed(2)},
 durationMs:+(performance.now()-begin).toFixed(2),
 counts:{total:cases.length,passed:cases.length-failures.length,failed:failures.length},
 cases,issues:failures,
 boundaries:["Sparse independent oracle probes representative selected 20-bit subspaces, not every possible 20-qubit circuit",
 "Real quantum hardware calibration and performance are not tested",
 "Noisy 20-qubit execution is work-limited",
 "Browser end-to-end behavior is not tested in this Node CI scenario"]
};
mkdirSync("artifacts",{recursive:true});
writeFileSync("artifacts/preannouncement-release-gate.json",JSON.stringify(evidence,null,2)+"\n");
console.log("RELEASE_GATE_SUMMARY "+JSON.stringify(evidence.counts)+" sha="+evidence.gitSha);
if(failures.length)process.exitCode=1;
