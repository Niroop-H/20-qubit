import { ComplexMatrix2x2 } from "../math/complex";
import { GATES, createRxGate, createRyGate, createRzGate, createUGate } from "../math/gates";
import { CircuitStep } from "../types/circuit";

export class QuantumCircuit {
  public readonly numQubits: number;
  public readonly stateSize: number;
  public real: Float64Array;
  public imag: Float64Array;

  constructor(numQubits: number) {
    if (!Number.isInteger(numQubits) || numQubits < 1 || numQubits > 20) {
      throw new Error("Simulator supports between 1 and 20 qubits.");
    }
    this.numQubits = numQubits;
    this.stateSize = 1 << numQubits;
    this.real = new Float64Array(this.stateSize);
    this.imag = new Float64Array(this.stateSize);
    this.reset();
  }

  /** Initialize to ground state |00...0⟩ */
  public reset(): void {
    this.real.fill(0);
    this.imag.fill(0);
    this.real[0] = 1.0;
  }

  /**
   * Execute a single circuit step (gate application).
   * Routes to the appropriate low-level transform based on gate type.
   */
  public applyStep(step: CircuitStep): void {
    switch (step.gate) {
      case "H":
      case "X":
      case "Y":
      case "Z":
      case "S":
      case "T":
      case "I": {
        const u = GATES[step.gate];
        if (!u) break;
        for (const target of step.targets) {
          this.applySingleQubitGate(target, u);
        }
        break;
      }

      case "RX": {
        const theta = step.params?.theta ?? 0;
        const u = createRxGate(theta);
        for (const target of step.targets) {
          this.applySingleQubitGate(target, u);
        }
        break;
      }

      case "RY": {
        const theta = step.params?.theta ?? 0;
        const u = createRyGate(theta);
        for (const target of step.targets) {
          this.applySingleQubitGate(target, u);
        }
        break;
      }

      case "RZ": {
        const lambda = step.params?.lambda ?? step.params?.theta ?? 0;
        const u = createRzGate(lambda);
        for (const target of step.targets) {
          this.applySingleQubitGate(target, u);
        }
        break;
      }

      case "U": {
        const theta = step.params?.theta ?? 0;
        const phi = step.params?.phi ?? 0;
        const lambda = step.params?.lambda ?? 0;
        const u = createUGate(theta, phi, lambda);
        for (const target of step.targets) {
          this.applySingleQubitGate(target, u);
        }
        break;
      }

      case "CX": {
        const control = (step.controls && step.controls.length > 0) ? step.controls[0] : step.targets[0];
        const target = (step.controls && step.controls.length > 0) ? step.targets[0] : step.targets[1];
        this.applyControlledGate(control, target, GATES.X);
        break;
      }

      case "CZ": {
        const control = (step.controls && step.controls.length > 0) ? step.controls[0] : step.targets[0];
        const target = (step.controls && step.controls.length > 0) ? step.targets[0] : step.targets[1];
        this.applyControlledGate(control, target, GATES.Z);
        break;
      }

      case "SWAP": {
        const q0 = step.targets[0];
        const q1 = step.targets[1];
        this.applySwap(q0, q1);
        break;
      }

      case "CCX": {
        // Toffoli: two controls, one target
        let c1: number, c2: number, target: number;
        if (step.controls && step.controls.length >= 2) {
          c1 = step.controls[0];
          c2 = step.controls[1];
          target = step.targets[0];
        } else {
          c1 = step.targets[0];
          c2 = step.targets[1];
          target = step.targets[2];
        }
        this.applyDoubleControlledGate(c1, c2, target, GATES.X);
        break;
      }

      case "BARRIER":
      case "MEASURE":
        // Measurement is handled at the sampling stage; barrier is a no-op
        break;
    }
  }

  /**
   * Apply a single-qubit unitary U to qubit `target` using bit-stride optimization.
   * Avoids materializing the full 2^n × 2^n matrix.
   *
   * For each pair of basis state indices whose binary representations differ
   * only at bit position `target`, compute:
   *   [c_{i0}']   [u00 u01] [c_{i0}]
   *   [c_{i1}'] = [u10 u11] [c_{i1}]
   */
  public applySingleQubitGate(target: number, u: ComplexMatrix2x2): void {
    const bit = 1 << target;
    const uR = u.real;
    const uI = u.imag;

    for (let i = 0; i < this.stateSize; i += 2 * bit) {
      for (let j = 0; j < bit; j++) {
        const i0 = i + j;
        const i1 = i0 + bit;

        const r0 = this.real[i0];
        const m0 = this.imag[i0];
        const r1 = this.real[i1];
        const m1 = this.imag[i1];

        // Complex matrix-vector multiplication
        this.real[i0] = (uR[0][0] * r0 - uI[0][0] * m0) + (uR[0][1] * r1 - uI[0][1] * m1);
        this.imag[i0] = (uR[0][0] * m0 + uI[0][0] * r0) + (uR[0][1] * m1 + uI[0][1] * r1);

        this.real[i1] = (uR[1][0] * r0 - uI[1][0] * m0) + (uR[1][1] * r1 - uI[1][1] * m1);
        this.imag[i1] = (uR[1][0] * m0 + uI[1][0] * r0) + (uR[1][1] * m1 + uI[1][1] * r1);
      }
    }
  }

  /**
   * Apply controlled-U gate: apply unitary U to `target` qubit only when
   * `control` qubit is |1⟩. Iterates only over states where control bit is set.
   */
  public applyControlledGate(control: number, target: number, u: ComplexMatrix2x2): void {
    const cBit = 1 << control;
    const tBit = 1 << target;
    const uR = u.real;
    const uI = u.imag;

    for (let i = 0; i < this.stateSize; i++) {
      // Only process pairs where control is 1 and target is 0
      if ((i & cBit) !== 0 && (i & tBit) === 0) {
        const i0 = i;
        const i1 = i | tBit;

        const r0 = this.real[i0];
        const m0 = this.imag[i0];
        const r1 = this.real[i1];
        const m1 = this.imag[i1];

        this.real[i0] = (uR[0][0] * r0 - uI[0][0] * m0) + (uR[0][1] * r1 - uI[0][1] * m1);
        this.imag[i0] = (uR[0][0] * m0 + uI[0][0] * r0) + (uR[0][1] * m1 + uI[0][1] * r1);

        this.real[i1] = (uR[1][0] * r0 - uI[1][0] * m0) + (uR[1][1] * r1 - uI[1][1] * m1);
        this.imag[i1] = (uR[1][0] * m0 + uI[1][0] * r0) + (uR[1][1] * m1 + uI[1][1] * r1);
      }
    }
  }

  /**
   * Apply double-controlled-U gate (e.g., Toffoli): apply U to `target` only
   * when both `c1` and `c2` control qubits are |1⟩.
   */
  public applyDoubleControlledGate(
    c1: number,
    c2: number,
    target: number,
    u: ComplexMatrix2x2
  ): void {
    const c1Bit = 1 << c1;
    const c2Bit = 1 << c2;
    const tBit = 1 << target;
    const uR = u.real;
    const uI = u.imag;

    for (let i = 0; i < this.stateSize; i++) {
      if ((i & c1Bit) !== 0 && (i & c2Bit) !== 0 && (i & tBit) === 0) {
        const i0 = i;
        const i1 = i | tBit;

        const r0 = this.real[i0];
        const m0 = this.imag[i0];
        const r1 = this.real[i1];
        const m1 = this.imag[i1];

        this.real[i0] = (uR[0][0] * r0 - uI[0][0] * m0) + (uR[0][1] * r1 - uI[0][1] * m1);
        this.imag[i0] = (uR[0][0] * m0 + uI[0][0] * r0) + (uR[0][1] * m1 + uI[0][1] * r1);

        this.real[i1] = (uR[1][0] * r0 - uI[1][0] * m0) + (uR[1][1] * r1 - uI[1][1] * m1);
        this.imag[i1] = (uR[1][0] * m0 + uI[1][0] * r0) + (uR[1][1] * m1 + uI[1][1] * r1);
      }
    }
  }

  /**
   * SWAP gate: exchanges amplitudes of two qubits.
   * For each state where q0 and q1 differ, swap the amplitudes.
   */
  public applySwap(q0: number, q1: number): void {
    const b0 = 1 << q0;
    const b1 = 1 << q1;

    for (let i = 0; i < this.stateSize; i++) {
      // Swap when exactly one of the two bits is set (q0=0,q1=1 case)
      if ((i & b0) === 0 && (i & b1) !== 0) {
        const j = (i | b0) & ~b1;

        const tmpR = this.real[i];
        const tmpI = this.imag[i];
        this.real[i] = this.real[j];
        this.imag[i] = this.imag[j];
        this.real[j] = tmpR;
        this.imag[j] = tmpI;
      }
    }
  }

  /**
   * Compute measurement probabilities P(i) = |c_i|² for all basis states.
   * Re-normalizes if floating-point drift causes sum to deviate from 1.0.
   */
  public getProbabilities(): Float64Array {
    const probs = new Float64Array(this.stateSize);
    let total = 0.0;
    for (let i = 0; i < this.stateSize; i++) {
      const p = this.real[i] * this.real[i] + this.imag[i] * this.imag[i];
      probs[i] = p;
      total += p;
    }
    // Re-normalize to counteract floating-point drift
    if (total > 0 && Math.abs(total - 1.0) > 1e-9) {
      for (let i = 0; i < this.stateSize; i++) {
        probs[i] /= total;
      }
    }
    return probs;
  }
}
