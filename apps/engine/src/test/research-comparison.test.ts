import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {compareScientificRuns,type ComparisonSample} from "../studio/research-comparison";

const run=(counts:Record<string,number>,overrides:Partial<ComparisonSample>={}):ComparisonSample=>({
 source:'OPENQASM 2.0; qreg q[1000]; creg c[1000]; h q[0];',
 method:"stabilizer-tableau",qubits:1000,shots:Object.values(counts).reduce((a,b)=>a+b,0),seed:42,counts,...overrides
});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-12,"Expected "+b+" found "+a);
describe("scientific run comparison",()=>{
 it("reports exactly zero empirical variation for identical count distributions",()=>{
  const a=run({"00":50,"11":50}),b=run({"00":100,"11":100},{seed:73});
  const c=compareScientificRuns(a,b);
  assert.equal(c.comparable,true);
  near(c.totalVariationDistance!,0);
  near(c.sampledEntropyA!,1);near(c.sampledEntropyB!,1);
  assert.equal(c.runA.shots,100);assert.equal(c.runB.shots,200);
 });
 it("reports total variation of one for disjoint observed supports",()=>{
  const c=compareScientificRuns(run({"00":128}),run({"11":128}));
  near(c.totalVariationDistance!,1);
  near(c.sampledEntropyA!,0);near(c.sampledEntropyB!,0);
  assert.equal(c.mostChanged.length,2);
 });
 it("agrees with independent finite discrete distribution arithmetic",()=>{
  const a=run({"00":60,"11":40}),b=run({"00":25,"11":75});
  const c=compareScientificRuns(a,b);
  near(c.totalVariationDistance!,.35);
  assert.ok(c.mostChanged.length>0);
  near(c.mostChanged[0]!.absoluteDelta,.35);
 });
 it("forbids direct numerical comparison of different QASM, solvers or widths",()=>{
  const a=run({"00":128});
  for(const b of [
   run({"00":128},{source:"qreg q[1000];"}),
   run({"00":128},{method:"separable-state"}),
   run({"00":128},{qubits:1024}),
   run({"000":128})
  ]){
   const c=compareScientificRuns(a,b);
   assert.equal(c.comparable,false);assert.equal(c.totalVariationDistance,null);
   assert.equal(c.mostChanged.length,0);
  }
 });
 it("rejects invalid shot provenance and untrusted histogram inputs",()=>{
  const a=run({"00":128});
  assert.throws(()=>compareScientificRuns(a,run({"11":128},{shots:256})),/reconcile/);
  assert.throws(()=>compareScientificRuns(a,run({"bad":128})),/Malformed/);
  assert.throws(()=>compareScientificRuns(a,run({"11":-5},{shots:128})),/Malformed/);
  assert.throws(()=>compareScientificRuns(a,run({"11":128},{seed:-2})),/Invalid/);
 });
});
