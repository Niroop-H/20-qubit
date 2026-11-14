import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {ISING_SCHEMA,isingPreset,validateIsingModel,analyzeIsingSamples} from "../studio/hamiltonian";

const model={
 schema:ISING_SCHEMA,name:"Known Bell measurements",offset:.5,
 fields:[{bit:0,weight:-1},{bit:1,weight:2}],
 couplings:[{a:0,b:1,weight:3}]
};
describe("diagonal Ising statistical workbench",()=>{
 it("matches independently derived Bell-sample energy, Z/ZZ contributions, and SE",()=>{
  const a=analyzeIsingSamples(model,{"00":50,"11":50});
  assert.equal(a.schema,"MAH-Quantum-Ising-Sample-Analysis/v1");
  assert.equal(a.shots,100);
  assert.equal(a.mean,3.5);
  assert.equal(a.variance,100/99);
  assert.ok(Math.abs(a.standardError!-Math.sqrt(1/99))<1e-12);
  assert.deepEqual(a.observedMinimum,{bits:"11",energy:2.5,shots:50});
  assert.deepEqual(a.observedMaximum,{bits:"00",energy:4.5,shots:50});
  assert.deepEqual(a.zMeans,[0,0]);
  assert.deepEqual(a.zzMatrix,[[1,1],[1,1]]);
  assert.deepEqual(a.termEstimates.map(x=>x.contribution),[.5,0,0,3]);
  assert.equal(a.histogram.reduce((sum,x)=>sum+x.shots,0),100);
  assert.ok(Math.abs(a.termEstimates.reduce((sum,x)=>sum+x.contribution,0)-a.mean)<1e-12);
  assert.ok(a.confidence95![0]<a.mean&&a.confidence95![1]>a.mean);
 });
 it("uses bit-zero at the right of a high-width classical output",()=>{
  const m={schema:ISING_SCHEMA,name:"Endianness",offset:0,
   fields:[{bit:0,weight:2},{bit:999,weight:7}],couplings:[]};
  const bits="1"+"0".repeat(999);
  const a=analyzeIsingSamples(m,{[bits]:4});
  assert.equal(a.mean,-5); // c999=-1, c0=+1
  assert.equal(a.variance,0);
  assert.deepEqual(a.selectedBits,[0,999]);
 });
 it("handles single shots without claiming a confidence interval",()=>{
  const a=analyzeIsingSamples(model,{"00":1});
  assert.equal(a.mean,4.5);
  assert.equal(a.variance,null);
  assert.equal(a.standardError,null);
  assert.equal(a.confidence95,null);
 });
 it("presets are fully validated on a 1000-bit register",()=>{
  for(const p of ["chain","frustration","separation"] as const){
   const m=isingPreset(p);
   assert.deepEqual(validateIsingModel(m,1000),m);
   const a=analyzeIsingSamples(m,{["0".repeat(1000)]:1});
   assert.equal(a.shots,1);
   assert.equal(a.histogram.reduce((s,x)=>s+x.shots,0),1);
  }
 });
 it("rejects arbitrary fields, nonfinite numbers, duplicate terms and invalid indices",()=>{
  const bad=[
   {...model,fields:[{bit:0,weight:Infinity}]},
   {...model,fields:[{bit:0,weight:1},{bit:0,weight:2}]},
   {...model,couplings:[{a:0,b:0,weight:1}]},
   {...model,couplings:[{a:0,b:1,weight:1},{a:1,b:0,weight:2}]},
   {...model,couplings:[{a:0,b:7,weight:1}]},
   {...model,dangerousCommand:"run"},
   {...model,fields:[],couplings:[]},
   {...model,offset:NaN},
  ];
  for(const raw of bad)assert.throws(()=>validateIsingModel(raw,2));
  assert.throws(()=>analyzeIsingSamples(model,{"00":0}));
  assert.throws(()=>analyzeIsingSamples(model,{"02":10}));
  assert.throws(()=>analyzeIsingSamples(model,{"00":2,"000":2}));
  assert.throws(()=>analyzeIsingSamples(model,{"00":2.5}));
  assert.throws(()=>analyzeIsingSamples(model,{}));
 });
});
