import { NoiseConfig } from "../types/circuit";
import { QuantumCircuit } from "./QuantumCircuit";
import { GATES } from "../math/gates";

/**
 * NoiseEngine implements classical approximations of real quantum hardware noise:
 *
 * 1. Thermal Relaxation (T1 / Amplitude Damping):
 *    Probability of spontaneous decay |1⟩ → |0⟩: γ = 1 - exp(-t_gate / T1)
 *
 * 2. Pure Dephasing (T2):
 *    Probability of random phase flip: λ = 1 - exp(-t_gate / T_φ)
 *    where 1/T_φ = 1/T2 - 1/(2*T1)
 *
 * 3. Depolarizing Channel:
 *    With probability p, randomly apply one of {X, Y, Z} with probability p/3 each.
 *
 * 4. Readout / SPAM Errors:
 *    Apply a classical confusion matrix to measured bitstrings.
 */
export class NoiseEngine {
  /**
   * Apply gate-level noise to qubits that participated in a gate operation.
   * Called after each circuit step when noise is enabled.
   */
  public static applyStepNoise(
    circuit: QuantumCircuit,
    targetQubits: number[],
    config: NoiseConfig
  ): void {
    if (!config.enabled) return;

    const tGate = config.gateTime;

    // Compute decay and dephasing probabilities
    const gammaT1 = 1.0 - Math.exp(-tGate / config.t1);

    // T_phi: pure dephasing rate (1/T_phi = 1/T2 - 1/(2*T1))
    const tPhiInv = (1.0 / config.t2) - (1.0 / (2.0 * config.t1));
    const tPhi = tPhiInv > 0 ? 1.0 / tPhiInv : Infinity;
    const gammaDephase = tPhi === Infinity ? 0 : 1.0 - Math.exp(-tGate / tPhi);

    for (const q of targetQubits) {
      if (q < 0 || q >= circuit.numQubits) continue;

      // 1. Amplitude Damping (T1 relaxation: |1⟩ → |0⟩ decay)
      if (Math.random() < gammaT1) {
        const bit = 1 << q;
        for (let i = 0; i < circuit.stateSize; i++) {
          if ((i & bit) !== 0) {
            const j = i & ~bit; // corresponding |0⟩ state
            // Transfer amplitude with decay factor
            const decayFactor = Math.sqrt(gammaT1);
            const surviveFactor = Math.sqrt(1.0 - gammaT1);
            const r1 = circuit.real[i];
            const m1 = circuit.imag[i];
            circuit.real[j] += r1 * decayFactor;
            circuit.imag[j] += m1 * decayFactor;
            circuit.real[i] *= surviveFactor;
            circuit.imag[i] *= surviveFactor;
          }
        }
      }

      // 2. Pure Dephasing (T2: random Z gate)
      if (Math.random() < gammaDephase) {
        circuit.applySingleQubitGate(q, GATES.Z);
      }

      // 3. Depolarizing Channel: with probability p, apply random Pauli
      if (Math.random() < config.depolarizingRate) {
        const roll = Math.random();
        if (roll < 1.0 / 3.0) {
          circuit.applySingleQubitGate(q, GATES.X);
        } else if (roll < 2.0 / 3.0) {
          circuit.applySingleQubitGate(q, GATES.Y);
        } else {
          circuit.applySingleQubitGate(q, GATES.Z);
        }
      }
    }
  }

  /**
   * Apply classical readout confusion to a measured bitstring.
   * Models SPAM (State Preparation and Measurement) errors:
   *   P(1|0) = readoutError[0]  (false positive)
   *   P(0|1) = readoutError[1]  (false negative)
   */
  public static applyReadoutConfusion(
    bitstring: string,
    readoutError: [number, number]
  ): string {
    const [p10, p01] = readoutError;
    let noisyBits = "";
    for (let i = 0; i < bitstring.length; i++) {
      const bit = bitstring[i];
      if (bit === "0") {
        noisyBits += Math.random() < p10 ? "1" : "0";
      } else {
        noisyBits += Math.random() < p01 ? "0" : "1";
      }
    }
    return noisyBits;
  }
}
