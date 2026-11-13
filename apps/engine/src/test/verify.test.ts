import { test, describe } from "node:test";
import assert from "node:assert";
import { QuantumCircuit } from "../simulator/QuantumCircuit";
import { Sampler } from "../simulator/Sampler";
import { NoiseEngine } from "../simulator/NoiseEngine";
import { GATES } from "../math/gates";
import { CircuitStep, NoiseConfig } from "../types/circuit";

describe("Quantum Circuit Mathematical Foundations", () => {
  test("1. Ground State Initialization (|00...0⟩)", () => {
    const circuit = new QuantumCircuit(3);
    assert.strictEqual(circuit.numQubits, 3);
    assert.strictEqual(circuit.stateSize, 8);
    assert.strictEqual(circuit.real[0], 1.0);
    assert.strictEqual(circuit.imag[0], 0.0);

    for (let i = 1; i < circuit.stateSize; i++) {
      assert.strictEqual(circuit.real[i], 0.0);
      assert.strictEqual(circuit.imag[i], 0.0);
    }

    const probs = circuit.getProbabilities();
    assert.strictEqual(probs[0], 1.0);
    assert.strictEqual(probs[1], 0.0);
  });

  test("2. Single-Qubit Pauli-X Gate (Bit-flip |0⟩ -> |1⟩)", () => {
    const circuit = new QuantumCircuit(1);
    circuit.applyStep({ id: "1", gate: "X", targets: [0] });
    const probs = circuit.getProbabilities();

    assert.strictEqual(Math.round(probs[0]), 0);
    assert.strictEqual(Math.round(probs[1]), 1);
  });

  test("3. Single-Qubit Hadamard Gate (Equal Superposition)", () => {
    const circuit = new QuantumCircuit(1);
    circuit.applyStep({ id: "1", gate: "H", targets: [0] });
    const probs = circuit.getProbabilities();

    assert.ok(Math.abs(probs[0] - 0.5) < 1e-6, `P(|0⟩) expected 0.5, got ${probs[0]}`);
    assert.ok(Math.abs(probs[1] - 0.5) < 1e-6, `P(|1⟩) expected 0.5, got ${probs[1]}`);
  });

  test("4. Bell State Verification: [H(0), CX(0, 1)] -> ~50% |00⟩ and ~50% |11⟩", () => {
    const circuit = new QuantumCircuit(2);
    circuit.applyStep({ id: "1", gate: "H", targets: [0] });
    circuit.applyStep({ id: "2", gate: "CX", targets: [1], controls: [0] });

    const probs = circuit.getProbabilities();

    // Exact theoretical probabilities:
    // |00⟩ = 0.5, |01⟩ = 0.0, |10⟩ = 0.0, |11⟩ = 0.5
    assert.ok(Math.abs(probs[0] - 0.5) < 1e-6, `P(|00⟩) expected 0.5, got ${probs[0]}`);
    assert.strictEqual(probs[1], 0.0, `P(|01⟩) should be exactly 0`);
    assert.strictEqual(probs[2], 0.0, `P(|10⟩) should be exactly 0`);
    assert.ok(Math.abs(probs[3] - 0.5) < 1e-6, `P(|11⟩) expected 0.5, got ${probs[3]}`);

    // Monte Carlo measurement sampling over 4096 shots
    const shots = 4096;
    const { counts, measuredProbs } = Sampler.sample(probs, 2, shots);

    const count00 = counts["00"] || 0;
    const count11 = counts["11"] || 0;
    const count01 = counts["01"] || 0;
    const count10 = counts["10"] || 0;

    assert.strictEqual(count01, 0, "|01⟩ count must be 0 for ideal Bell state");
    assert.strictEqual(count10, 0, "|10⟩ count must be 0 for ideal Bell state");
    assert.strictEqual(count00 + count11, shots, "Total shots must sum to 4096");

    const ratio00 = count00 / shots;
    const ratio11 = count11 / shots;

    // With 4096 shots, binomial std dev is sqrt(4096 * 0.25) ≈ 32 shots (0.0078).
    // Within 4 sigma (0.035), probability must be in [0.45, 0.55]
    assert.ok(
      ratio00 >= 0.45 && ratio00 <= 0.55,
      `|00⟩ ratio ${ratio00} is within expected ~50% range`
    );
    assert.ok(
      ratio11 >= 0.45 && ratio11 <= 0.55,
      `|11⟩ ratio ${ratio11} is within expected ~50% range`
    );
  });

  test("5. GHZ State Verification: [H(0), CX(0, 1), CX(1, 2)] -> ~50% |000⟩ and ~50% |111⟩", () => {
    const circuit = new QuantumCircuit(3);
    circuit.applyStep({ id: "1", gate: "H", targets: [0] });
    circuit.applyStep({ id: "2", gate: "CX", targets: [1], controls: [0] });
    circuit.applyStep({ id: "3", gate: "CX", targets: [2], controls: [1] });

    const probs = circuit.getProbabilities();

    // Theoretical probabilities:
    // |000⟩ (index 0) = 0.5, |111⟩ (index 7) = 0.5, all others = 0
    assert.ok(Math.abs(probs[0] - 0.5) < 1e-6, `P(|000⟩) expected 0.5, got ${probs[0]}`);
    assert.ok(Math.abs(probs[7] - 0.5) < 1e-6, `P(|111⟩) expected 0.5, got ${probs[7]}`);

    for (let i = 1; i < 7; i++) {
      assert.strictEqual(probs[i], 0.0, `Basis state ${i} probability must be 0`);
    }

    // Monte Carlo measurement sampling over 4096 shots
    const shots = 4096;
    const { counts } = Sampler.sample(probs, 3, shots);

    const count000 = counts["000"] || 0;
    const count111 = counts["111"] || 0;

    assert.strictEqual(count000 + count111, shots, "Only |000⟩ and |111⟩ states exist");

    const ratio000 = count000 / shots;
    const ratio111 = count111 / shots;

    assert.ok(
      ratio000 >= 0.45 && ratio000 <= 0.55,
      `|000⟩ ratio ${ratio000} is within expected ~50% range`
    );
    assert.ok(
      ratio111 >= 0.45 && ratio111 <= 0.55,
      `|111⟩ ratio ${ratio111} is within expected ~50% range`
    );
  });

  test("6. Toffoli Gate (CCX): Double-controlled NOT", () => {
    const circuit = new QuantumCircuit(3);
    // Prepare |110⟩ (q0=1, q1=1, q2=0)
    circuit.applyStep({ id: "1", gate: "X", targets: [0] });
    circuit.applyStep({ id: "2", gate: "X", targets: [1] });

    // Apply CCX with controls [0, 1] and target [2] -> should yield |111⟩
    circuit.applyStep({ id: "3", gate: "CCX", targets: [2], controls: [0, 1] });

    const probs = circuit.getProbabilities();
    // Basis state 7 = binary 111
    assert.ok(Math.abs(probs[7] - 1.0) < 1e-6, `State must be |111⟩ with probability 1.0`);

    // If only one control is 1, target should NOT flip
    const circuit2 = new QuantumCircuit(3);
    circuit2.applyStep({ id: "1", gate: "X", targets: [0] }); // |100⟩
    circuit2.applyStep({ id: "2", gate: "CCX", targets: [2], controls: [0, 1] });

    const probs2 = circuit2.getProbabilities();
    // Basis state 1 = binary 001 (qubit 0 is 1)
    assert.ok(Math.abs(probs2[1] - 1.0) < 1e-6, `State must remain |001⟩`);
  });

  test("7. SWAP Gate", () => {
    const circuit = new QuantumCircuit(2);
    // Prepare |01⟩ (q0=1, q1=0)
    circuit.applyStep({ id: "1", gate: "X", targets: [0] });
    // Swap q0 and q1 -> |10⟩ (q0=0, q1=1)
    circuit.applyStep({ id: "2", gate: "SWAP", targets: [0, 1] });

    const probs = circuit.getProbabilities();
    // index 2 is binary 10 (q1=1, q0=0)
    assert.ok(Math.abs(probs[2] - 1.0) < 1e-6, `State must be |10⟩ after SWAP`);
  });

  test("8. Parametric Rotation Gates (Rx, Ry, Rz)", () => {
    const circuit = new QuantumCircuit(1);
    // Rx(π) should act as an X gate (up to global phase)
    circuit.applyStep({ id: "1", gate: "RX", targets: [0], params: { theta: Math.PI } });
    const probs = circuit.getProbabilities();
    assert.ok(Math.abs(probs[1] - 1.0) < 1e-6, `Rx(π)|0⟩ should be |1⟩`);
  });

  test("9. SPAM / Readout Confusion Error Model", () => {
    const cleanBitstring = "000";
    const readoutError: [number, number] = [0.1, 0.1]; // 10% flip rate

    let flippedCount = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      const noisy = NoiseEngine.applyReadoutConfusion(cleanBitstring, readoutError);
      if (noisy !== cleanBitstring) {
        flippedCount++;
      }
    }

    // Probability that at least one of 3 bits flips: 1 - (0.9)^3 = 0.271
    const flipRate = flippedCount / trials;
    assert.ok(
      flipRate > 0.20 && flipRate < 0.35,
      `Expected ~27% flip rate with SPAM noise, got ${(flipRate * 100).toFixed(1)}%`
    );
  });

  test("10. Cumulative Distribution Sampling Normalization", () => {
    const probs = new Float64Array([0.25, 0.25, 0.25, 0.25]);
    const { counts, measuredProbs } = Sampler.sample(probs, 2, 10000);

    let total = 0;
    for (const key of ["00", "01", "10", "11"]) {
      total += counts[key] || 0;
      const p = measuredProbs[key] || 0;
      assert.ok(Math.abs(p - 0.25) < 0.02, `State ${key} measured prob ${p} near 0.25`);
    }
    assert.strictEqual(total, 10000);
  });
});
