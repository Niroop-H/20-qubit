import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { simulateScalable,methodFor,validateLargeProgram } from "../studio/scalable";
import { parseLargeQasm } from "../studio/largeQasm";
import { QuantumCircuit } from "../simulator/QuantumCircuit";
import { idealState } from "../studio/simulate";
import { validateProgram } from "../studio/model";
import { parseQasm } from "../studio/qasm";
import type { Step } from "../studio/model";

const program=(n:number,steps:Step[])=>({qubits:n,bits:n,steps});
const op=(id:string,gate:Step["gate"],targets:number[],controls:number[]=[],params?:Record<string,number>):Step=>({id,gate,targets,controls,params});
const scalar=(n:number,i:number)=>i.toString(2).padStart(n,"0");
const near=(v:number,target:number,tol=1e-11)=>assert.ok(Math.abs(v-target)<tol,"Expected "+target+", got "+v);

describe("exact scalable 100-qubit and 1000+ qubit engines",()=>{
 it("accepts 100 in Studio but maintains a hard 20-qubit dense statevector bound",()=>{
  validateProgram(program(100,[]));
  assert.throws(()=>validateProgram(program(101,[])));
  assert.throws(()=>new QuantumCircuit(21));
  assert.equal(parseQasm('OPENQASM 2.0; qreg q[100]; creg c[100]; x q[99];').qubits,100);
 });
 it("computes 100-qubit GHZ exactly without allocating 2^100 state entries",()=>{
  const steps=[op("h","H",[0])];
  for(let q=1;q<100;q++)steps.push(op("cx"+q,"CX",[q],[q-1]));
  const p=program(100,steps);
  const out=simulateScalable(p,2048,45);
  assert.equal(out.method,"stabilizer-tableau");
  assert.equal(out.exact,true);
  assert.equal(out.supportRank,1);
  near(out.idealProbabilities["0".repeat(100)],.5);
  near(out.idealProbabilities["1".repeat(100)],.5);
  assert.equal(Object.values(out.counts).reduce((a,b)=>a+b,0),2048);
  assert.equal(out.stateVector.length,0);
 });
 it("computes 1000-qubit GHZ with exact two-point distribution",()=>{
  const steps=[op("h","H",[0])];
  for(let q=1;q<1000;q++)steps.push(op("cx"+q,"CX",[q],[q-1]));
  const out=simulateScalable(program(1000,steps),512,17);
  assert.equal(out.supportRank,1);
  near(out.idealProbabilities["0".repeat(1000)],.5);
  near(out.idealProbabilities["1".repeat(1000)],.5);
  assert.equal(Object.values(out.counts).reduce((a,b)=>a+b,0),512);
 });
 it("reaches the full 4096-logical-qubit width with exact GHZ correlation",()=>{
  const steps=[op("h","H",[0])];
  for(let q=1;q<4096;q++)steps.push(op("cx"+q,"CX",[q],[q-1]));
  const out=simulateScalable(program(4096,steps),32,29);
  assert.equal(out.method,"stabilizer-tableau");
  assert.equal(out.supportRank,1);
  near(out.idealProbabilities["0".repeat(4096)],.5);
  near(out.idealProbabilities["1".repeat(4096)],.5);
  assert.equal(Object.values(out.counts).reduce((a,b)=>a+b,0),32);
 });
 it("runs exact 2048-qubit |+> product sampling with no dense statevector",()=>{
  const p=program(2048,Array.from({length:2048},(_,q)=>op("h"+q,"H",[q])));
  const out=simulateScalable(p,32,24);
  assert.equal(out.method,"stabilizer-tableau");
  assert.equal(out.supportRank,2048);
  assert.equal(Object.values(out.counts).reduce((a,b)=>a+b,0),32);
  assert.ok(Object.keys(out.counts).every(x=>x.length===2048));
  assert.equal(out.idealProbabilityLog2,-2048);
 });
 it("supports non-Clifford one-qubit rotations across 100 qubits",()=>{
  const p=program(100,[
   op("h","H",[99]),op("t","T",[99]),op("rx","RX",[0],[],{theta:Math.PI/3}),
   op("u","U",[29],[],{theta:.83,phi:-.14,lambda:.21}),
  ]);
  const out=simulateScalable(p,4096,71);
  assert.equal(out.method,"separable-state");
  assert.equal(out.exact,true);
  assert.equal(Object.values(out.counts).reduce((a,b)=>a+b,0),4096);
  assert.ok(Object.keys(out.counts).every(x=>x.length===100));
 });
 it("simulates 100-qubit non-Clifford entangled subcircuits exactly",()=>{
  const p=program(100,[
   op("h","H",[0]),op("cx","CX",[99],[0]),op("t","T",[99]),
   op("h2","H",[0]),op("ry","RY",[7],[],{theta:.731})
  ]);
  const out=simulateScalable(p,1024,7);
  assert.equal(out.method,"partitioned-statevector");
  assert.equal(out.exact,true);
  assert.equal(Object.values(out.counts).reduce((a,b)=>a+b,0),1024);
  assert.ok(Object.keys(out.counts).every(label=>label.length===100));
 });
 it("simulates independent non-Clifford clusters across 1,000 logical qubits",()=>{
  const p=program(1000,[
   op("h0","H",[0]),op("cx0","CX",[999],[0]),op("t0","T",[999]),
   op("h0a","H",[0]),op("h1","H",[10]),op("cz1","CZ",[11],[10]),
   op("rx","RX",[11],[],{theta:.91}),op("h1a","H",[10])
  ]);
  const out=simulateScalable(p,512,66);
  assert.equal(out.method,"partitioned-statevector");
  assert.equal(Object.values(out.counts).reduce((a,b)=>a+b,0),512);
  assert.ok(Object.keys(out.idealProbabilities).every(s=>s.length===1000));
 });
 it("supports Toffoli in 1,000-qubit register with finite connected cluster",()=>{
  const parsed=parseLargeQasm('OPENQASM 2.0; qreg q[1000]; creg c[1000]; h q[1]; h q[2]; ccx q[1],q[2],q[999];');
  assert.equal(parsed.steps[2].gate,"CCX");
  assert.equal(parsed.steps[2].targets[0],999);
  assert.deepEqual(parsed.steps[2].controls,[1,2]);
  const out=simulateScalable(parsed,256,3);
  assert.equal(out.method,"partitioned-statevector");
  assert.equal(Object.values(out.counts).reduce((a,b)=>a+b,0),256);
 });
 it("rejects oversized connected clusters instead of claiming general quantum speedup",()=>{
  const steps=[op("h","H",[0]),op("t","T",[0])];
  for(let q=1;q<19;q++)steps.push(op("cx"+q,"CX",[q],[q-1]));
  assert.throws(()=>simulateScalable(program(100,steps),128,7),/19 qubits/);
 });
 it("enforces aggregate component memory budget before allocating state arrays",()=>{
  const steps:Step[]=[];
  for(let block=0;block<5;block++){
   const start=block*18;
   steps.push(op("h"+block,"H",[start]),op("t"+block,"T",[start]));
   for(let q=start+1;q<start+18;q++)steps.push(op("cx"+q,"CX",[q],[q-1]));
  }
  assert.throws(()=>simulateScalable(program(100,steps),64,1),/aggregate.*memory budget/i);
 });
 for(let n=2;n<=9;n++)it("crosschecks non-Clifford entanglement against dense statevector at "+n+" qubits",()=>{
  const steps:Step[]=[
   op("h","H",[0]),op("cx","CX",[n-1],[0]),op("t","T",[n-1]),
   op("rx","RX",[0],[],{theta:.713}),op("h2","H",[n-1]),
   op("ry","RY",[1],[],{theta:-.92})
  ];
  if(n>2)steps.push(op("ccx","CCX",[1],[0,n-1]));
  steps.push(op("rz","RZ",[n-1],[],{theta:1.12}),op("h3","H",[0]));
  const p=program(n,steps);
  const oracle=idealState(p).getProbabilities();
  const out=simulateScalable(p,2048,13);
  assert.equal(out.method,"partitioned-statevector");
  for(const [bits,prob] of Object.entries(out.idealProbabilities))
   near(prob,oracle[parseInt(bits,2)],1e-11);
  assert.equal(Object.values(out.counts).reduce((a,b)=>a+b,0),2048);
 });
 it("computes correct marginal for terminal partial measurements after entanglement",()=>{
  const n=8;
  const p=program(n,[
   op("h","H",[0]),op("cx","CX",[5],[0]),op("t","T",[0]),
   op("h2","H",[5]),{...op("m0","MEASURE",[0]),classical:7},
   {...op("m5","MEASURE",[5]),classical:1}
  ]);
  const dense=idealState(p).getProbabilities();
  const out=simulateScalable(p,2048,9);
  assert.equal(out.method,"partitioned-statevector");
  for(const [bits,value]of Object.entries(out.idealProbabilities)){
   let expected=0;
   for(let i=0;i<256;i++)if((((i&1)<<7)|(((i>>5)&1)<<1))===parseInt(bits,2))expected+=dense[i];
   near(value,expected,1e-11);
  }
  assert.ok(Object.keys(out.counts).every(bits=>bits.length===8));
 });
 it("rejects 1000-qubit noisy trajectories honestly",()=>{
  assert.throws(()=>simulateScalable(program(1000,[]),64,1,{enabled:true}),/Noise models/);
 });
 it("rejects duplicate measurement destinations",()=>{
  const p=program(100,[op("m1","MEASURE",[0]),{...op("m2","MEASURE",[1]),classical:0}]);
  assert.throws(()=>validateLargeProgram(p),/duplicate measurement/i);
 });
 it("routes measurement q999 to classical c0",()=>{
  const p=program(1000,[op("x","X",[999]),{...op("m","MEASURE",[999]),classical:0}]);
  const out=simulateScalable(p,64,5);
  assert.equal(out.counts["0".repeat(999)+"1"],64);
 });
 it("rounds and tracks exact Clifford stabilizer phases for Bell minus state",()=>{
  const p=program(100,[
   op("h","H",[0]),op("z","Z",[0]),op("cx","CX",[99],[0]),
  ]);
  const out=simulateScalable(p,512,4);
  assert.equal(out.supportRank,1);
  near(out.idealProbabilities["0".repeat(100)],.5);
  near(out.idealProbabilities["1"+"0".repeat(98)+"1"],.5);
 });
 it("parses large QASM2 and QASM3 without arbitrary code execution",()=>{
  const p=parseLargeQasm('OPENQASM 2.0; include "qelib1.inc"; qreg q[1000]; creg c[1000]; h q[0]; cx q[0],q[999];');
  assert.equal(p.qubits,1000);assert.equal(p.steps.length,2);
  assert.equal(simulateScalable(p,128,7).supportRank,1);
  const q=parseLargeQasm('OPENQASM 3.0; include "stdgates.inc"; qubit[1024] q; bit[1024] c; h q[0]; c[0] = measure q[0];');
  assert.equal(q.qubits,1024);
  assert.throws(()=>parseLargeQasm('OPENQASM 2.0; qreg q[5000];'),/4096/);
  assert.throws(()=>parseLargeQasm('OPENQASM 2.0; qreg q[1000]; system("danger");'),/Unsupported/);
 });
 for(let n=1;n<=7;n++)it("cross-checks stabilizer distribution with dense exact statevector at "+n+" qubits",()=>{
  let seed=1234567+n;
  const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  const gates:Step["gate"][]=["H","H","S","S","X","Y","Z","CX","CZ","SWAP"];
  const steps:Step[]=[];
  for(let i=0;i<24;i++){
   let gate:Step["gate"]=gates[Math.floor(rand()*gates.length)];
   if(n===1&&["CX","CZ","SWAP"].includes(gate))gate="H";
   const a=Math.floor(rand()*n),b=(a+1+Math.floor(rand()*Math.max(1,n-1)))%n;
   if(gate==="CX"||gate==="CZ")steps.push(op("t"+i,gate,[b],[a]));
   else if(gate==="SWAP")steps.push(op("t"+i,gate,[a,b]));
   else steps.push(op("t"+i,gate,[a]));
  }
  const p=program(n,steps),small=idealState(p).getProbabilities(),large=simulateScalable(p,512,23);
  for(const [state,prob]of Object.entries(large.idealProbabilities))
   near(prob,small[parseInt(state,2)],1e-10);
  assert.equal(Object.values(large.counts).reduce((a,b)=>a+b,0),512);
 });
 for(let n=2;n<=7;n++)it("cross-checks arbitrary separable gates with dense numerical engine at "+n+" qubits",()=>{
  const p=program(n,[
   op("h","H",[n-1]),op("rx","RX",[0],[],{theta:.731}),op("t","T",[n-1]),
   op("ry","RY",[1],[],{theta:-1.23}),op("rz","RZ",[0],[],{theta:.77}),
   op("swap","SWAP",[0,n-1]),
  ].filter(s=>s.gate!=="SWAP"||s.targets[0]!==s.targets[1]));
  const small=idealState(p).getProbabilities(),large=simulateScalable(p,256,23);
  assert.equal(large.method,"separable-state");
  for(const [state,prob]of Object.entries(large.idealProbabilities))
   near(prob,small[parseInt(state,2)],1e-11);
 });
});
