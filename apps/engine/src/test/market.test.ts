import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {parseQasm} from "../studio/qasm";
import {parseLargeQasm} from "../studio/largeQasm";
import {simulateScalable} from "../studio/scalable";

describe("Commercial release input and scientific-result integrity",()=>{
 it("does not accept inherited prototype method names as quantum gates",()=>{
  for(const name of ["constructor","toString","valueOf","hasOwnProperty","__proto__"]){
   const small="OPENQASM 2.0; qreg q[2]; creg c[2]; "+name+" q[0];";
   const large="OPENQASM 2.0; qreg q[1000]; creg c[1000]; "+name+" q[0];";
   assert.throws(()=>parseQasm(small),/Unsupported/);
   assert.throws(()=>parseLargeQasm(large),/Unsupported/);
  }
 });
 it("rejects all nonfinite angles, overexpanded register operations, and arbitrary extensions",()=>{
  assert.throws(()=>parseLargeQasm("OPENQASM 2.0; qreg q[4096]; creg c[4096]; rx(1/0) q[0];"),/non-finite/i);
  assert.throws(()=>parseLargeQasm("OPENQASM 2.0; qreg q[4096]; creg c[4096]; h q; h q; h q;"),/8192/);
  assert.throws(()=>parseLargeQasm("OPENQASM 2.0; qreg q[1000]; creg c[1000]; while(x) h q[0];"),/Unsupported/i);
 });
 it("reproduces every bitstring count across identical seeds on 1000-qubit long-range GHZ",()=>{
  const source="OPENQASM 2.0; qreg q[1000]; creg c[1000]; h q[0]; cx q[0],q[999];";
  const program=parseLargeQasm(source);
  const one=simulateScalable(program,128,108),two=simulateScalable(program,128,108);
  assert.deepEqual(one.counts,two.counts);
  assert.deepEqual(one.idealProbabilities,two.idealProbabilities);
  assert.equal(one.method,"stabilizer-tableau");
  assert.equal(one.exact,true);
 });
 it("reproduces non-Clifford partitioned entanglement with fixed seed",()=>{
  const program=parseLargeQasm("OPENQASM 2.0; qreg q[1000]; creg c[1000]; h q[0]; t q[0]; cx q[0],q[999]; h q[999];");
  const one=simulateScalable(program,128,13),two=simulateScalable(program,128,13);
  assert.deepEqual(one.counts,two.counts);
  assert.equal(one.method,"partitioned-statevector");
  assert.equal(one.exact,true);
  assert.equal(Object.values(one.counts).reduce((a,b)=>a+b,0),128);
 });
 it("large noise requests never silently fall back to ideal results",()=>{
  const program=parseLargeQasm("OPENQASM 2.0; qreg q[1000]; creg c[1000]; h q[0];");
  assert.throws(()=>simulateScalable(program,128,13,{enabled:true}),/Noise models/);
 });
 it("enforces exact shot budgets and full-register classical output width",()=>{
  const program=parseLargeQasm("OPENQASM 2.0; qreg q[1000]; creg c[1000]; x q[999];");
  assert.throws(()=>simulateScalable(program,1025,1),/Shots/);
  const out=simulateScalable(program,64,1);
  assert.equal(out.counts["1"+"0".repeat(999)],64);
  assert.ok(out.stateVector.length===0);
 });
});
