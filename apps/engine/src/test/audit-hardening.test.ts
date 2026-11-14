/** Regression evidence for issues confirmed in the 2026-11 scientific/security audit.
 * These tests use the compiled numerical engine, never mock measurements.
 */
import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {parseQasm} from "../studio/qasm";
import {parseLargeQasm} from "../studio/largeQasm";
import {simulate,seededRandom} from "../studio/simulate";
import {QuantumCircuit} from "../simulator/QuantumCircuit";
import {NoiseEngine} from "../simulator/NoiseEngine";
import {circuitStats,type Program} from "../studio/model";
import {optimize} from "../studio/transform";
import {compareScientificRuns} from "../studio/research-comparison";
import {prepareIndustryJob,estimateIndustryWork,INDUSTRY_SCHEMA} from "../studio/enterprise";
import {bellCHSH} from "../lab/communication";
import {validateProject} from "../lab/hardware";
import {GATES} from "../math/gates";

const header=(n:number)=>'OPENQASM 2.0; include "qelib1.inc"; qreg q['+n+']; creg c['+n+']; ';
const step=(id:string,gate:Program["steps"][number]["gate"],targets:number[],controls:number[]=[])=>
 ({id,gate,targets,controls});
describe("2026 quantum simulator audit: fail-closed QASM, numerical and workload boundaries",()=>{
 it("malicious QASM whitespace and assignments parse in bounded time without catastrophic backtracking",()=>{
  const whitespace=" ".repeat(12000);
  for(const parser of [parseQasm,parseLargeQasm]){
   const width=parser===parseQasm?2:1000;
   for(const malformed of [
    "measure"+whitespace+";",
    "measure"+whitespace+"->"+whitespace+";",
    "c[0]"+whitespace+"="+whitespace+"measure"+whitespace+";",
    "h"+whitespace+";"
   ]){
    const start=performance.now();
    assert.throws(()=>parser(header(width)+malformed),/Line|Unsupported|Unknown|Measurement/);
    assert.ok(performance.now()-start<1500,"QASM parser exceeded its bounded-time regression budget");
   }
  }
 });
 it("QASM2/3 include declarations are version-specific and large QASM accepts same basic gate family",()=>{
  assert.throws(()=>parseQasm('OPENQASM 2.0; include "stdgates.inc"; qreg q[2];'),/include/i);
  assert.throws(()=>parseLargeQasm('OPENQASM 3.0; include "qelib1.inc"; qubit[1000] q;'),/include/i);
  const p=parseLargeQasm(header(1000)+
   'i q[0]; p(pi/4) q[0]; u1(.2) q[1]; u2(pi/2,.2) q[2]; sx q[3]; sxdg q[4];');
  assert.equal(p.qubits,1000);
  assert.equal(p.steps.length,6);
  assert.ok(p.steps.some(s=>s.gate==="U"));
  assert.equal(p.steps[0].gate,"I");
  assert.throws(()=>parseLargeQasm(header(1000)+"garbage q[0];"),/Line/);
 });
 it("rejects out-of-bounds dense classical widths before allocation or bit-shift overflow",()=>{
  for(const width of [21,25,30,31,32,100]){
   const p:Program={qubits:1,bits:width,steps:[]};
   assert.throws(()=>simulate(p,16,7),/1–20.*classical/);
  }
  const p:Program={qubits:1,bits:20,steps:[{...step("x","X",[0])},{...step("m","MEASURE",[0]),classical:19}]};
  const actual=simulate(p,16,7);
  assert.equal(actual.counts["1"+"0".repeat(19)],16);
 });
 it("rejects malformed low-level gates and statevector norm drift rather than outputting NaN or hiding it",()=>{
  const c=new QuantumCircuit(3);
  assert.throws(()=>c.applyStep(step("bad","X",[5])),/outside/);
  assert.throws(()=>c.applyStep(step("same","CX",[0],[0])),/distinct/);
  assert.throws(()=>c.applySingleQubitGate(3,GATES.H),/outside/);
  assert.throws(()=>c.applyControlledGate(0,0,GATES.X),/distinct/);
  assert.throws(()=>c.applySwap(1,1),/distinct/);
  assert.equal(c.getProbabilities()[0],1);
  c.real[0]=1.1;
  assert.throws(()=>c.getProbabilities(),/normalization/);
  c.real[0]=Number.NaN;
  assert.throws(()=>c.getProbabilities(),/non-finite/);
 });
 it("normalized seeded Kraus trajectories reproduce amplitude damping expectation without double-counting",()=>{
  const cfg={enabled:true,t1:1,t2:1.5,gateTime:Math.log(2),depolarizingRate:0,readoutError:[0,0] as [number,number]};
  const run=(seed:number)=>{
   const rng=seededRandom(seed);let observed=0;
   for(let i=0;i<1000;i++){
    const c=new QuantumCircuit(1);
    c.applySingleQubitGate(0,GATES.H);
    NoiseEngine.applyStepNoise(c,[0],cfg,rng);
    assert.ok(Math.abs(c.normSquared()-1)<1e-8);
    observed+=c.getProbabilities()[1];
   }
   return observed/1000;
  };
  const p=run(2026);
  assert.equal(p,run(2026));
  assert.ok(Math.abs(p-0.25)<0.06,"Expected amplitude damping to reduce ideal P1=0.5 to P1≈0.25");
  assert.throws(()=>NoiseEngine.applyStepNoise(new QuantumCircuit(1),[5],cfg,seededRandom(7)),/out of range/);
 });
 it("accounts for exponential partitioned statevector work before synchronous API execution",()=>{
  const heavy=header(1000)+"h q[0];"+
   Array.from({length:17},(_,i)=>"cx q["+i+"],q["+(i+1)+"];").join("")+
   "t q[17];".repeat(160);
  const job={schema:INDUSTRY_SCHEMA,jobId:"adversarial-18q-cost",kind:"circuit",
   operation:"execute",shots:128,seed:42,source:heavy};
  assert.throws(()=>prepareIndustryJob(job),/work budget/i);
  const safe=prepareIndustryJob({...job,source:header(1000)+"h q[0];"});
  assert.ok(estimateIndustryWork(safe)>0);
 });
 it("records CCX separately from two-qubit gates, and cancels symmetric CZ/SWAP pairs",()=>{
  const p:Program={qubits:3,bits:3,steps:[step("a","CCX",[2],[0,1])]};
  assert.equal(circuitStats(p).twoQubit,0);
  assert.equal(circuitStats(p).threeQubit,1);
  const sym:Program={qubits:2,bits:2,steps:[
   step("a","CZ",[1],[0]),step("b","CZ",[0],[1]),
   step("c","SWAP",[0,1]),step("d","SWAP",[1,0])
  ]};
  assert.equal(optimize(sym).steps.length,0);
 });
 it("compares valid 8192-shot dense runs and rejects mixed outcome widths",()=>{
  const base={source:"bell test",method:"dense-statevector",qubits:20,shots:8192,seed:7,
   counts:{["0".repeat(20)]:8192}};
  assert.equal(compareScientificRuns(base,base).totalVariationDistance,0);
  const malformed={...base,counts:{["0".repeat(20)]:4096,["0".repeat(19)]:4096}};
  assert.throws(()=>compareScientificRuns(malformed,base),/Malformed/);
 });
 it("validates CHSH seed and malformed hardware project objects as domain errors",()=>{
  assert.throws(()=>bellCHSH(.9,128,NaN),/Seed/);
  assert.throws(()=>bellCHSH(.9,128,-1),/Seed/);
  assert.throws(()=>validateProject({version:1,devices:[null],links:[]}),/Invalid device/);
  assert.throws(()=>validateProject({version:1,devices:[{id:"device-x",kind:"laser",x:0,z:0,rotation:0}],links:[]}),/parameters/);
 });
});
