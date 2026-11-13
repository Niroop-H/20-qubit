import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QuantumCircuit } from "../simulator/QuantumCircuit";
import { parseQasm } from "../studio/qasm";
import { simulate, summarizeState } from "../studio/simulate";
import { simulateRequest } from "../studio/request";

const program = (body: string, n = 20) =>
  parseQasm('OPENQASM 2.0; include "qelib1.inc"; qreg q[' + n + ']; creg c[' + n + ']; ' + body);

describe("20-qubit statevector and bounded result pipeline", () => {
  it("rejects noninteger or out-of-range physical register widths", () => {
    assert.throws(() => new QuantumCircuit(20.5));
    assert.throws(() => new QuantumCircuit(21));
    assert.equal(new QuantumCircuit(20).stateSize, 1048576);
    assert.throws(() => program("h q[0];", 101));
  });
  it("executes distant two-qubit entanglement at the actual 20-qubit width", () => {
    const p = program("h q[0]; cx q[0],q[19];");
    const out = simulate(p, 4096, 42);
    const zeros = "0".repeat(20), ones = "1" + "0".repeat(18) + "1";
    assert.ok(Math.abs(out.idealProbabilities[zeros] - .5) < 1e-12);
    assert.ok(Math.abs(out.idealProbabilities[ones] - .5) < 1e-12);
    assert.equal(out.stateVectorInfo.totalStates, 1048576);
    assert.equal(out.stateVector.length, 2);
    assert.equal(Object.values(out.counts).reduce((a,b) => a+b,0),4096);
    assert.deepEqual(out.counts, simulate(p,4096,42).counts);
  });
  it("samples a 20-qubit dense superposition without returning a million records", () => {
    const out = simulate(program("h q;"), 512, 9);
    assert.equal(out.stateVectorInfo.nonZeroStates, 1048576);
    assert.equal(out.stateVector.length, 128);
    assert.equal(out.stateVectorInfo.truncated, true);
    assert.ok(Object.keys(out.probabilities).length <= 576);
    assert.equal(Object.values(out.counts).reduce((a,b) => a+b,0),512);
    assert.ok(Object.values(out.idealProbabilities).every(v => Math.abs(v - 1/1048576) < 1e-10));
  });
  it("maps subset measurement into high-index classical bits", () => {
    const out = simulate(program("h q[0]; measure q[0] -> c[19];"),1024,2);
    assert.ok(Math.abs(out.idealProbabilities["0".repeat(20)]-.5)<1e-12);
    assert.ok(Math.abs(out.idealProbabilities["1"+"0".repeat(19)]-.5)<1e-12);
    assert.equal(Object.values(out.counts).reduce((a,b) => a+b,0),1024);
  });
  it("uses the full 20-bit execution request schema", () => {
    assert.equal(simulateRequest({...program("x q[19];"),shots:10,seed:1}).counts["1"+"0".repeat(19)],10);
  });
  it("never overflows the state summary at maximum register width", () => {
    const c = new QuantumCircuit(20);
    const summary = summarizeState(c);
    assert.equal(summary.stateVector.length,1);
    assert.equal(summary.stateVectorInfo.nonZeroStates,1);
  });
  it("rejects computationally prohibitive noisy jobs explicitly", () => {
    assert.throws(() => simulate(program("h q;"),8192,1,{
      enabled:true,t1:50,t2:70,gateTime:.02,readoutError:[.01,.01],depolarizingRate:.001
    }),/work limit/);
  });
});
