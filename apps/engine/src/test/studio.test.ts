import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseQasm, toQasm, toQiskit, expression } from "../studio/qasm";
import { validateProgram, Program, circuitStats } from "../studio/model";
import {
  simulate,
  idealState,
  blochVectors,
  expectation,
} from "../studio/simulate";
import { transpile, optimize } from "../studio/transform";
import { simulateRequest } from "../studio/request";
const qasm = (body: string, n = 3) =>
  `OPENQASM 2.0; include "qelib1.inc"; qreg q[${n}]; creg c[${n}]; ${body}`;
const near = (actual: number, expected: number, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} != ${expected}`);
function equivalent(a: Program, b: Program) {
  const x = idealState(a),
    y = idealState(b);
  let re = 0,
    im = 0;
  for (let i = 0; i < x.stateSize; i++) {
    re += x.real[i] * y.real[i] + x.imag[i] * y.imag[i];
    im += x.real[i] * y.imag[i] - x.imag[i] * y.real[i];
  }
  near(re * re + im * im, 1);
}
const noise = {
  enabled: true,
  t1: 50,
  t2: 70,
  gateTime: 0.02,
  readoutError: [0, 0] as [number, number],
  depolarizingRate: 0,
};
describe("Studio compiler, execution and transforms", () => {
  it("safely parses arithmetic, precedence, exponents and pi", () => {
    near(expression("-(pi / 2) + 2 * (3 - 1)"), 4 - Math.PI / 2);
    near(expression("1e-3"), 0.001);
    assert.throws(() => expression("process.exit()"));
    assert.throws(() => expression("1/0"));
    assert.throws(() => expression("2**4"));
  });
  it("QASM2 and QASM3 round trips preserve arbitrary angles and measurement maps", () => {
    const p = parseQasm(
      qasm(
        "h q[0]; u3(pi/3, -pi/5, 0.13) q[1]; cx q[0],q[2]; measure q[2] -> c[0]; measure q[0] -> c[2];",
      ),
    );
    for (const v of [2, 3] as const) {
      const back = parseQasm(toQasm(p, v));
      equivalent(p, back);
      assert.deepEqual(
        p.steps.map((s) => s.classical),
        back.steps.map((s) => s.classical),
      );
    }
  });
  it("register-wide operations and comments expand without lost instructions", () => {
    const p = parseQasm(qasm("/*hello*/ h q; // comment\n measure q -> c;"));
    assert.equal(p.steps.length, 6);
    assert.equal(simulate(p, 512, 42).backendInfo.shots, 512);
  });
  it("rejects unsupported language with source line diagnostics", () => {
    assert.throws(() => parseQasm(qasm("\nreset q[0];")), /Line 2/);
    assert.throws(() => parseQasm(qasm("if(c==1) x q[0];")));
    assert.throws(() => parseQasm(qasm("h q[0]")), /semicolon/);
    assert.throws(() => parseQasm(qasm("h q[3];")), /outside/);
    assert.throws(() => parseQasm(qasm("rx(pi,2) q[0];")), /expects 1/);
    assert.throws(() => parseQasm("OPENQASM 3; qreg q[2];"));
  });
  it("rejects malformed operands, nonfinite parameters and excessive circuits", () => {
    assert.throws(() => parseQasm(qasm("cx q[0],q[0];")), /distinct/);
    assert.throws(() => parseQasm(qasm("ccx q[0],q[1],q[0];")), /distinct/);
    assert.throws(() => parseQasm(qasm("x q[0];".repeat(257))), /256/);
    assert.throws(() => validateProgram({ qubits: 101, bits: 101, steps: [] }));
    assert.throws(() =>
      validateProgram({
        qubits: 1,
        bits: 1,
        steps: [{ id: "a", gate: "RX", targets: [0], params: { theta: NaN } }],
      }),
    );
  });
  it("enforces terminal, one-to-one measurements", () => {
    assert.throws(
      () => parseQasm(qasm("measure q[0] -> c[0]; h q[1];")),
      /terminal/,
    );
    assert.throws(
      () => parseQasm(qasm("measure q[0] -> c[0]; measure q[1] -> c[0];")),
      /at most once/,
    );
  });
  it("Bell state probabilities, seed reproducibility and shot conservation", () => {
    const p = parseQasm(qasm("h q[0]; cx q[0],q[1];", 2));
    const a = simulate(p, 8192, 42),
      b = simulate(p, 8192, 42);
    near(a.idealProbabilities["00"], 0.5);
    near(a.idealProbabilities["11"], 0.5);
    assert.deepEqual(a.counts, b.counts);
    assert.equal(
      Object.values(a.counts).reduce((x, y) => x + y, 0),
      8192,
    );
    assert.ok(Math.abs(a.probabilities["00"] - 0.5) < 0.025);
  });
  it("terminal subset measurement maps into classical destinations and preserves zeros", () => {
    const p = parseQasm(
      qasm("x q[2]; measure q[2] -> c[0]; measure q[0] -> c[2];"),
    );
    assert.deepEqual(simulate(p, 128, 4).counts, { "001": 128 });
  });
  it("OpenQASM3 assignment measurement executes identically", () => {
    const p = parseQasm(
      'OPENQASM 3; include "stdgates.inc"; qubit[2] q; bit[2] c; x q[0]; c = measure q;',
    );
    assert.deepEqual(simulate(p, 128, 1).counts, { "01": 128 });
  });
  it("Bloch vectors distinguish pure and entangled reduced states", () => {
    let c = idealState(parseQasm(qasm("h q[0];", 1)));
    near(blochVectors(c)[0].x, 1);
    near(blochVectors(c)[0].purity, 1);
    c = idealState(parseQasm(qasm("h q[0]; s q[0];", 1)));
    near(blochVectors(c)[0].y, 1);
    c = idealState(parseQasm(qasm("h q[0];cx q[0],q[1];", 2)));
    near(blochVectors(c)[0].purity, 0.5);
    near(expectation(c, "ZZ"), 1);
    near(expectation(c, "XX"), 1);
    near(expectation(c, "ZI"), 0);
    assert.throws(() => expectation(c, "Z"));
  });
  it("step inspection is a gate-prefix state", () => {
    const p = parseQasm(qasm("h q[0];h q[0];", 1));
    near(idealState(p, 1).getProbabilities()[0], 0.5);
    near(idealState(p, 2).getProbabilities()[0], 1);
  });
  it("Grover two-qubit example finds 11", () => {
    const p = parseQasm(
      qasm("h q;cz q[0],q[1];h q;x q;cz q[0],q[1];x q;h q;", 2),
    );
    near(simulate(p, 128, 5).idealProbabilities["11"], 1);
  });
  it("all U/CX decompositions preserve every computational basis input", () => {
    const gates = [
      "h q[0];",
      "x q[0];",
      "y q[0];",
      "z q[0];",
      "s q[0];",
      "t q[0];",
      "rx(.731) q[1];",
      "ry(-.2) q[2];",
      "rz(pi/3) q[0];",
      "u3(.3,.8,-.4) q[1];",
      "cx q[0],q[2];",
      "cz q[2],q[0];",
      "swap q[0],q[2];",
      "ccx q[0],q[1],q[2];",
    ];
    for (const gate of gates)
      for (let basis = 0; basis < 8; basis++) {
        let prep = "";
        for (let q = 0; q < 3; q++) if (basis & (1 << q)) prep += `x q[${q}];`;
        const p = parseQasm(qasm(prep + gate));
        equivalent(p, transpile(p));
      }
  });
  it("linear routing preserves phases of entangled superpositions and restores ordering", () => {
    const p = parseQasm(
      qasm(
        "h q;rz(.3) q[1];cx q[0],q[2];u3(.7,.9,.2) q[0];ccx q[2],q[0],q[1];swap q[2],q[0];",
      ),
    );
    const compiled = transpile(p, true);
    equivalent(p, compiled);
    assert.ok(
      compiled.steps.every(
        (s) =>
          s.gate === "U" ||
          (s.gate === "CX" && Math.abs(s.targets[0] - s.controls![0]) === 1),
      ),
    );
  });
  it("optimization preserves global state and respects barriers", () => {
    const p = parseQasm(
      qasm("h q[0];h q[0];rx(.3) q[1];rx(-.3) q[1];x q[2];barrier q; x q[2];"),
    );
    const o = optimize(p);
    equivalent(p, o);
    assert.equal(o.steps.length, 3);
    assert.equal(circuitStats(o).gates, 2);
  });
  it("noise-free trajectories agree with ideal amplitudes", () => {
    const p = parseQasm(qasm("h q[0];cx q[0],q[1];", 2));
    const r = simulate(p, 512, 1, { ...noise, t1: 1e30, t2: 1e30 });
    assert.ok(Object.keys(r.counts).every((x) => x === "00" || x === "11"));
    assert.equal(r.backendInfo.fidelityEstimated, null);
  });
  it("strong T1 damping relaxes an excited state", () => {
    const p = parseQasm(qasm("x q[0];", 1));
    const r = simulate(p, 1024, 6, {
      ...noise,
      t1: 0.001,
      t2: 0.001,
      gateTime: 1,
    });
    assert.deepEqual(r.counts, { "0": 1024 });
  });
  it("dephasing dampens coherence across independent trajectories", () => {
    const p = parseQasm(qasm("h q[0];h q[0];", 1));
    const r = simulate(p, 4096, 8, {
      ...noise,
      t1: 1e20,
      t2: 0.001,
      gateTime: 1,
    });
    assert.ok(Math.abs(r.probabilities["0"] - 0.5) < 0.04);
  });
  it("readout flips only measured classical destinations", () => {
    const p = parseQasm(qasm("measure q[1] -> c[2];"));
    const r = simulate(p, 128, 7, { ...noise, readoutError: [1, 1] });
    assert.deepEqual(r.counts, { "100": 128 });
  });
  it("invalid noise, seed, shots and oversized noisy workloads fail explicitly", () => {
    const p = parseQasm(qasm("h q;"));
    assert.throws(() => simulate(p, 128, 0, { ...noise, t2: 101 }), /T2/);
    assert.throws(() => simulate(p, 0, 0));
    assert.throws(() => simulate(p, 128, -1));
    assert.throws(
      () => simulate(parseQasm(qasm("h q;".repeat(10), 8)), 8192, 0, noise),
      /work limit/,
    );
  });
  it("compatibility API shares validation and measurement behavior", () => {
    const p = parseQasm(qasm("x q[0];", 1));
    assert.deepEqual(simulateRequest({ ...p, shots: 128, seed: 4 }).counts, {
      "1": 128,
    });
    assert.throws(() => simulateRequest({ ...p, qubits: 101 }));
  });
  it("Qiskit exports operands and angles in execution order", () => {
    const p = parseQasm(
      qasm("u3(.1,.2,.3) q[0];cx q[0],q[1];measure q[1] -> c[2];"),
    );
    const code = toQiskit(p);
    assert.match(code, /qc.u\(0.1, 0.2, 0.3, 0\)/);
    assert.match(code, /qc.cx\(0, 1\)/);
    assert.match(code, /qc.measure\(1, 2\)/);
  });
});
