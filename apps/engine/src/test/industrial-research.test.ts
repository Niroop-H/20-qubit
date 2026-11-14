import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {QuantumCircuit} from "../simulator/QuantumCircuit";
import {validateIndustrialGraph,cutObjective,qaoaDistribution,runIndustrialOptimization} from "../studio/industrial";
const pair={name:"Two-zone partition",nodes:["Plant A","Plant B"],edges:[{source:0,target:1,weight:1}]};
const near=(a:number,b:number,epsilon=1e-10)=>assert.ok(Math.abs(a-b)<epsilon,a+" does not match "+b);
describe("industrial 2–10-variable quantum optimization companion",()=>{
 it("rejects malformed, duplicate, unbounded and non-finite industrial models",()=>{
  const bad=(x:unknown)=>assert.throws(()=>validateIndustrialGraph(x));
  bad(null);bad({...pair,nodes:["A","a"]});bad({...pair,edges:[]});
  bad({...pair,edges:[{source:0,target:0,weight:1}]});
  bad({...pair,edges:[{source:0,target:2,weight:1}]});
  bad({...pair,edges:[{source:0,target:1,weight:Infinity}]});
  bad({...pair,edges:[{source:0,target:1,weight:-2}]});
  bad({...pair,edges:[{source:0,target:1,weight:1},{source:1,target:0,weight:1}]});
  bad({...pair,nodes:Array.from({length:11},(_,i)=>"N"+i)});
 });
 it("two-qubit cut objective and ideal p=1 QAOA admit an independent analytic optimum",()=>{
  const g=validateIndustrialGraph(pair);
  near(cutObjective(g,0),0);near(cutObjective(g,1),1);
  near(cutObjective(g,2),1);near(cutObjective(g,3),0);
  const p=qaoaDistribution(g,Math.PI/2,Math.PI/8);
  near(p[0],0);near(p[3],0);near(p[1],.5);near(p[2],.5);
 });
 it("QAOA state evolution matches independent CX-RZ-CX gate-level cost circuit",()=>{
  const g=validateIndustrialGraph({name:"3-zone graph",nodes:["A","B","C"],edges:[
   {source:0,target:1,weight:.75},{source:1,target:2,weight:2.5}
  ]});
  const gamma=.63,beta=.19,c=new QuantumCircuit(3);
  for(let q=0;q<3;q++)c.applyStep({id:"H"+q,gate:"H",targets:[q]});
  for(const e of g.edges){
   c.applyStep({id:"CXa",gate:"CX",controls:[e.source],targets:[e.target]});
   c.applyStep({id:"RZ",gate:"RZ",targets:[e.target],params:{theta:-gamma*e.weight}});
   c.applyStep({id:"CXb",gate:"CX",controls:[e.source],targets:[e.target]});
  }
  for(let q=0;q<3;q++)c.applyStep({id:"RX"+q,gate:"RX",targets:[q],params:{theta:2*beta}});
  const p=qaoaDistribution(g,gamma,beta),q=c.getProbabilities();
  for(let i=0;i<p.length;i++)near(p[i],q[i]);
 });
 it("independent classical verifier is globally optimal and reports complete shot provenance",()=>{
  const r=runIndustrialOptimization(pair,512,42);
  near(r.classical.optimum,1);
  assert.equal(r.classical.degeneracy,2);
  near(r.quantum.expectedScore,1,1e-9);
  near(r.quantum.approximationRatio,1,1e-9);
  near(r.quantum.optimalOutcomeProbability,1,1e-9);
  assert.equal(r.quantum.outcomes.reduce((a,b)=>a+b.count,0),512);
  assert.equal(r.execution.completedShots,512);
  assert.equal(r.execution.logicalQubits,2);
  assert.equal(r.execution.physicalHardware,false);
  assert.equal(r.landscape.gammaPoints,36);
  assert.equal(r.landscape.betaPoints,9);
  assert.equal(r.landscape.gammaSpans.length,3);
  assert.equal(r.landscape.samples.length,324);
  for(const p of r.landscape.samples){
   const prob=qaoaDistribution(validateIndustrialGraph(pair),p.gamma,p.beta);
   const mean=Array.from(prob,(v,mask)=>v*cutObjective(validateIndustrialGraph(pair),mask)).reduce((a,b)=>a+b,0);
   near(p.expectedScore,mean);
   assert.ok(p.expectedScore<=r.classical.optimum+1e-9);
  }
 });
 it("follows identical results and shot distributions for the same seed and graph",()=>{
  const graph={name:"Production separation pilot",nodes:["Line A","Line B","Line C","Line D"],edges:[
   {source:0,target:1,weight:3},{source:1,target:2,weight:5},
   {source:0,target:3,weight:1},{source:2,target:3,weight:4}
  ]};
  const r=runIndustrialOptimization(graph,256,2026);
  const again=runIndustrialOptimization(graph,256,2026);
  assert.deepEqual(r.quantum,again.quantum);
  assert.deepEqual(r.classical,again.classical);
  assert.ok(r.quantum.expectedScore<=r.classical.optimum+1e-9);
  assert.ok(r.quantum.bestSampleScore<=r.classical.optimum+1e-9);
  assert.ok(r.classical.greedyScore<=r.classical.optimum+1e-9);
 });
 it("enforces full 10-decision-node graph and bounded resource budget",()=>{
  const graph={name:"10-node dense reference",nodes:Array.from({length:10},(_,i)=>"N"+i),
   edges:Array.from({length:10},(_,i)=>i).flatMap(i=>
    Array.from({length:9-i},(_,j)=>({source:i,target:i+j+1,weight:1})))};
  const r=runIndustrialOptimization(graph,128,7);
  assert.equal(r.execution.statevectorBytes,16384);
  assert.equal(r.classical.optimum,25);
  assert.equal(r.classical.degeneracy,252);
  assert.equal(r.quantum.outcomes.reduce((a,b)=>a+b.count,0),128);
 });
 it("rejects oversized shot requests and invalid seed rather than executing them",()=>{
  for(const shots of [0,64,127,1025,-5,1.5,Infinity])assert.throws(()=>runIndustrialOptimization(pair,shots,0),/Shots/);
  for(const seed of [-1,2**32,1.5,NaN])assert.throws(()=>runIndustrialOptimization(pair,128,seed),/Seed/);
 });
});
