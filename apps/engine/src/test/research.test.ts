import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {
 RESEARCH_TEMPLATES,templateQasm,analyzeLargeCircuit,measuredBit,
 pairCorrelation,sampleEntropy,measuredHistogramStats
} from "../studio/research";
import {parseLargeQasm} from "../studio/largeQasm";
import {simulateScalable} from "../studio/scalable";

const near=(a:number,b:number,tol=1e-10)=>assert.ok(Math.abs(a-b)<tol,"Expected "+b+", observed "+a);
describe("1000+ scientific research workbench",()=>{
 it("supplies eight executable scientific circuit families with distinct grounded metadata",()=>{
  assert.equal(RESEARCH_TEMPLATES.length,8);
  assert.equal(new Set(RESEARCH_TEMPLATES.map(x=>x.id)).size,8);
  for(const x of RESEARCH_TEMPLATES){
   assert.ok(x.name&&x.industry&&x.scientificUse);
   assert.match(x.expected,/^(stabilizer-tableau|separable-state|partitioned-statevector)$/);
  }
 });
 for(const n of [1000,1024,1536,2048,4096]){
  it("keeps all eight source templates parseable, budgeted and accurately classified at "+n+" qubits",()=>{
   for(const x of RESEARCH_TEMPLATES){
    const src=templateQasm(n,x.id),diag=analyzeLargeCircuit(src);
    assert.equal(diag.qubits,n,x.id);
    assert.equal(diag.method,x.expected,x.id);
    assert.ok(diag.operations<=8192,x.id+" exceeded gate budget");
    assert.equal(diag.gateCounts.reduce((s,v)=>s+v.count,0),diag.operations);
    assert.equal(diag.bucketTouches.length,32);
    assert.ok(diag.logicalDepth>=1);
    assert.ok(diag.activeQubits<=n);
    assert.equal(parseLargeQasm(src).qubits,n);
   }
  });
 }
 it("reports actual logical connectivity, gate depth and register aggregation",()=>{
  const diag=analyzeLargeCircuit(
   "OPENQASM 2.0; qreg q[1000]; creg c[1000]; h q[0]; cx q[0],q[999]; t q[999];"
  );
  assert.equal(diag.operations,3);
  assert.equal(diag.method,"partitioned-statevector");
  assert.equal(diag.logicalDepth,3);
  assert.equal(diag.activeQubits,2);
  assert.equal(diag.multiQubitGates,1);
  assert.equal(diag.observedMaxComponent,2);
  assert.deepEqual(diag.bucketEdges,[{from:0,to:31,count:1}]);
  assert.equal(diag.gateCounts.find(x=>x.gate==="CX")?.count,1);
 });
 it("properly labels product-state Ramsey simulation and samples p(1)=1/4",()=>{
  const program=parseLargeQasm(templateQasm(1000,"ramsey"));
  const result=simulateScalable(program,1024,17);
  assert.equal(result.method,"separable-state");
  const marginal=measuredBit(result.counts,0);
  assert.ok(Math.abs(marginal.pOne-.25)<.09,"Empirical Ramsey bit probability deviated too far");
  assert.ok(marginal.wilson95[0]<=marginal.pOne&&marginal.wilson95[1]>=marginal.pOne);
 });
 it("Bell-pair outcomes have exact sampled Z0Z1 parity",()=>{
  const result=simulateScalable(parseLargeQasm(templateQasm(1000,"bell")),256,55);
  assert.equal(result.method,"stabilizer-tableau");
  const v=pairCorrelation(result.counts,0,1);
  near(v.zz,1);
  assert.ok(v.connected>=0&&v.connected<=1+1e-12);
  assert.equal(measuredHistogramStats(result.counts).shots,256);
 });
 it("GHZ support and ideal computational basis correlations are not fabricated",()=>{
  const result=simulateScalable(parseLargeQasm(templateQasm(1000,"ghz")),128,45);
  assert.equal(result.supportRank,1);
  near(result.idealProbabilities["0".repeat(1000)],.5);
  near(result.idealProbabilities["1".repeat(1000)],.5);
  near(pairCorrelation(result.counts,0,999).zz,1);
 });
 it("independent three-qubit non-Clifford islands use exact partitioned solver",()=>{
  const result=simulateScalable(parseLargeQasm(templateQasm(1000,"islands")),32,8);
  assert.equal(result.method,"partitioned-statevector");
  assert.equal(result.exact,true);
  assert.equal(Object.values(result.counts).reduce((a,b)=>a+b,0),32);
 });
 it("computes correct observed Z, connected ZZ and entropy from a known histogram",()=>{
  const counts={"00":20,"11":20,"01":10,"10":10};
  const p0=measuredBit(counts,0);
  near(p0.pOne,.5);
  near(p0.zMean,0);
  near(pairCorrelation(counts,0,1).zz,1/3);
  near(pairCorrelation(counts,0,1).connected,1/3);
  const s=sampleEntropy({"00":1,"11":1});
  near(s,1);
  const stats=measuredHistogramStats(counts);
  assert.equal(stats.shots,60);assert.equal(stats.distinct,4);
 });
 it("never silently accepts out-of-range measurement bits or malformed histogram data",()=>{
  assert.throws(()=>measuredBit({"01":3},2),/out of range/);
  assert.throws(()=>pairCorrelation({"01":3},0,0),/distinct/);
  assert.throws(()=>measuredBit({"a1":3},0),/Malformed/);
  assert.throws(()=>measuredBit({"10":-1},0),/Malformed/);
  const boundary=measuredBit({"0":100},0);
  assert.ok(boundary.wilson95[1]>0,"Wilson interval must not claim zero uncertainty after 100 zeros");
  assert.throws(()=>templateQasm(999,"plus"),/1,000/);
  assert.throws(()=>templateQasm(4097,"plus"),/4,096/);
 });
});
