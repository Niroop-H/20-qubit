/**
 * Reproducible 20-qubit acceptance harness, independent Python oracle + analytic tests.
 * Run after npm run build:engine: node scripts/verify-20.mjs
 * Writes machine-readable evidence to artifacts/quantum-20-validation.json.
 * Timing is descriptive, not a pass/fail guarantee across different CPUs.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import process from "node:process";

const require = createRequire(import.meta.url);
const { simulate, idealState } = require("../apps/engine/dist/studio/simulate.js");
const { parseQasm } = require("../apps/engine/dist/studio/qasm.js");
const { transpile } = require("../apps/engine/dist/studio/transform.js");
const { validateProgram, MAX_QUBITS } = require("../apps/engine/dist/studio/model.js");

const events = [];
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) < tolerance, label + ": expected " + expected + ", got " + actual);
const report = (name, fn) => {
  const begin = performance.now();
  const evidence = fn();
  const entry = {
    name,
    passed: true,
    durationMs: Number((performance.now() - begin).toFixed(3)),
    rssMiB: Number((process.memoryUsage().rss / 1048576).toFixed(2)),
    ...evidence,
  };
  events.push(entry);
  console.log(JSON.stringify(entry));
};
const qasm20 = (body) =>
  parseQasm('OPENQASM 2.0; include "qelib1.inc"; qreg q[20]; creg c[20]; ' + body);
const sum = (values) => Object.values(values).reduce((a, b) => a + b, 0);
const ampNorm = (circuit) => {
  let norm = 0;
  for (let i = 0; i < circuit.stateSize; i++)
    norm += circuit.real[i] ** 2 + circuit.imag[i] ** 2;
  return norm;
};
assert.equal(MAX_QUBITS, 20);

report("independent five-qubit gate-matrix crosscheck", () => {
  const gates = [
    ["H",[0]], ["H",[4]], ["RX",[1],[],{theta:.48}],
    ["RY",[3],[],{theta:-1.12}], ["RZ",[4],[],{theta:.89}],
    ["U",[2],[],{theta:1.03,phi:-.41,lambda:.95}],
    ["CX",[3],[0]], ["CZ",[1],[4]], ["SWAP",[0,2]],
    ["CCX",[4],[1,3]], ["Y",[2]], ["S",[1]], ["T",[4]],
    ["H",[1]], ["RX",[4],[],{theta:-.25}], ["RY",[0],[],{theta:.71}],
    ["CX",[0],[2]], ["CZ",[3],[1]], ["U",[4],[],{theta:.35,phi:.2,lambda:-.7}],
    ["Z",[0]], ["X",[2]], ["I",[4]], ["RZ",[2],[],{theta:-1.51}],
    ["SWAP",[1,3]], ["CCX",[2],[0,4]], ["H",[3]], ["T",[3]],
  ];
  const program = {
    qubits: 5, bits: 5,
    steps: gates.map(([gate, targets, controls=[], params={}], i) =>
      ({ id: "oracle-" + i, gate, targets, controls, params }))
  };
  validateProgram(program);
  const ref = spawnSync("python", ["scripts/independent_reference.py"], {
    input: JSON.stringify(program),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  assert.equal(ref.status, 0, "Python reference failed: " + (ref.stderr || ref.error?.message));
  const expected = JSON.parse(ref.stdout);
  const c = idealState(program);
  let maxComponentError = 0;
  for (let i = 0; i < c.stateSize; i++) {
    maxComponentError = Math.max(maxComponentError,
      Math.abs(c.real[i] - expected[i][0]),
      Math.abs(c.imag[i] - expected[i][1]));
  }
  near(maxComponentError, 0, 5e-12, "Independent complex amplitude agreement");
  near(ampNorm(c), 1, 1e-11, "Independent circuit norm");
  return { operations: gates.length, reference: "Python stdlib complex matrix oracle",
    maxComponentError, amplitudeTolerance: 5e-12 };
});

report("20-qubit GHZ exact amplitudes and sampling", () => {
  let body = "h q[0]; ";
  for (let i = 0; i < 19; i++) body += `cx q[${i}],q[${i+1}]; `;
  const program = qasm20(body);
  const result = simulate(program, 4096, 42);
  const zero = "0".repeat(20), one = "1".repeat(20);
  near(result.idealProbabilities[zero], .5, 1e-12, "GHZ all-zero outcome");
  near(result.idealProbabilities[one], .5, 1e-12, "GHZ all-one outcome");
  assert.deepEqual(Object.keys(result.counts).sort(), [zero,one].sort());
  assert.equal(sum(result.counts),4096);
  near(result.distributionInfo.omittedIdealProbabilityMass,0,1e-12,"GHZ distribution coverage");
  const state = idealState(program);
  near(ampNorm(state),1,1e-11,"GHZ state norm");
  near(state.real[0],Math.SQRT1_2,1e-12,"GHZ |0...0> real amplitude");
  near(state.real[1048575],Math.SQRT1_2,1e-12,"GHZ |1...1> real amplitude");
  return { qubits:20, basisStates:result.stateVectorInfo.totalStates,
    shots:4096, operations:program.steps.length,
    idealProbabilityError: Math.max(Math.abs(result.idealProbabilities[zero]-.5),
      Math.abs(result.idealProbabilities[one]-.5)),
    normError:Math.abs(ampNorm(state)-1),
    observedZero:result.counts[zero],observedOne:result.counts[one] };
});

report("20-qubit dense uniform superposition", () => {
  const result = simulate(qasm20("h q;"),512,9);
  assert.equal(result.stateVectorInfo.totalStates,1048576);
  assert.equal(result.stateVectorInfo.nonZeroStates,1048576);
  assert.equal(result.stateVectorInfo.shownStates,128);
  assert.equal(sum(result.counts),512);
  const target=1/1048576;
  const maxError = Math.max(...Object.values(result.idealProbabilities).map(x=>Math.abs(x-target)));
  near(maxError,0,1e-10,"Dense ideal probabilities");
  near(result.stateVectorInfo.retainedProbabilityMass,128/1048576,1e-10,
    "State summary probability coverage");
  near(result.distributionInfo.omittedIdealProbabilityMass,
    1-result.distributionInfo.shownOutcomes/1048576,1e-9,
    "Ideal histogram tail mass");
  return { qubits:20, basisStates:1048576, shots:512,
    shownAmplitudes:result.stateVector.length,
    observedOutcomes:Object.keys(result.counts).length,
    maxIdealProbabilityError:maxError,
    stateRetainedMass:result.stateVectorInfo.retainedProbabilityMass,
    histogramOmittedMass:result.distributionInfo.omittedIdealProbabilityMass };
});

report("20-qubit Ramsey phase interference", () => {
  const angle=.731;
  const result = simulate(qasm20(
    `h q[0]; cx q[0],q[19]; rz(${angle}) q[19]; cx q[0],q[19]; h q[0];`
  ),1024,4);
  const expected=Math.sin(angle/2)**2;
  const observed=result.idealProbabilities["0".repeat(19)+"1"];
  near(observed,expected,2e-12,"Phase fringe");
  near(result.idealProbabilities["0".repeat(20)],1-expected,2e-12,"Complement");
  return {angleRad:angle,probabilityExpected:expected,
    probabilityMeasuredExact:observed,absoluteError:Math.abs(observed-expected)};
});

report("20-qubit long-range linear transpiler", () => {
  const program=qasm20("h q[0]; cx q[0],q[19];");
  const compiled=transpile(program,true);
  assert.ok(compiled.steps.length<=256,"Compiled program must fit the Studio cap");
  assert.ok(compiled.steps.every(step=>step.gate==="U" ||
    (step.gate==="CX" && Math.abs(step.targets[0]-step.controls[0])===1)),
    "Compiled CX must be nearest-neighbor");
  const a=idealState(program), b=idealState(compiled);
  let re=0,im=0;
  for(let i=0;i<a.stateSize;i++){
    re+=a.real[i]*b.real[i]+a.imag[i]*b.imag[i];
    im+=a.real[i]*b.imag[i]-a.imag[i]*b.real[i];
  }
  const stateFidelity=re*re+im*im;
  near(stateFidelity,1,1e-11,"Compiled state overlap");
  return {qubits:20,originalOperations:program.steps.length,
    compiledOperations:compiled.steps.length,stateFidelity,
    infidelity:Math.abs(1-stateFidelity)};
});

report("20-bit measurement mapping and deterministic seed", () => {
  const program=qasm20("x q[19]; measure q[19] -> c[0];");
  const first=simulate(program,128,5),again=simulate(program,128,5);
  assert.deepEqual(first.counts,again.counts);
  assert.equal(first.counts["0".repeat(19)+"1"],128);
  assert.equal(sum(first.counts),128);
  return {qubits:20,shots:128,deterministic:true,highBitMappedToLowClassical:true};
});

const evidence={
  status:"PASS",
  executionDateUtc:new Date().toISOString(),
  gitSha:process.env.GITHUB_SHA || "local",
  node:process.version,platform:process.platform,architecture:process.arch,
  statement:"Verified exact ideal statevector simulation over 20 logical qubits; not a calibrated physical QPU or certified industrial product.",
  cases:events,
  limitations:[
    "No hardware QPU validation or calibration",
    "Noisy Monte Carlo trajectories retain explicit browser work limits",
    "No mid-circuit measurement, reset, or general OpenQASM control flow",
    "Result tables intentionally report probability mass omitted by truncation",
    "Run times and memory vary with target device and workload"
  ]
};
mkdirSync("artifacts",{recursive:true});
writeFileSync("artifacts/quantum-20-validation.json",JSON.stringify(evidence,null,2)+"\n");
console.log("20-QUBIT VALIDATION: PASS — " + events.length + " independent/analytical acceptance scenarios");
