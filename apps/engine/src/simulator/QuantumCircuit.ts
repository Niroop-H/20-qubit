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
  private checkQubit(q:number):void {
    if(!Number.isInteger(q)||q<0||q>=this.numQubits)
      throw new RangeError("Qubit index "+q+" is outside the "+this.numQubits+"-qubit register.");
  }
  public normSquared():number {
    let total=0;
    for(let i=0;i<this.stateSize;i++){
      const p=this.real[i]*this.real[i]+this.imag[i]*this.imag[i];
      if(!Number.isFinite(p))throw Error("Quantum state contains non-finite amplitudes.");
      total+=p;
    }
    return total;
  }
  public applyStep(step: CircuitStep): void {
    if(!step||!Array.isArray(step.targets)||!Array.isArray(step.controls??[])||
       !["I","H","X","Y","Z","S","T","RX","RY","RZ","U","CX","CZ","SWAP","CCX","BARRIER","MEASURE"].includes(step.gate))
      throw Error("Invalid or unsupported quantum circuit step.");
    const controls=step.controls??[],operands=[...step.targets,...controls];
    for(const q of operands)this.checkQubit(q);
    if(!operands.length||new Set(operands).size!==operands.length)
      throw Error("Circuit gate requires nonempty, distinct control and target qubits.");
    const arity=step.gate==="CCX"?3:["CX","CZ","SWAP"].includes(step.gate)?2:
      step.gate==="BARRIER"?operands.length:1;
    if(operands.length!==arity||(["CX","CZ"].includes(step.gate)&&
       !(step.targets.length===2&&controls.length===0||step.targets.length===1&&controls.length===1))||
       (step.gate==="CCX"&&!(step.targets.length===3&&controls.length===0||
         step.targets.length===1&&controls.length===2))||
       (step.gate==="SWAP"&&(step.targets.length!==2||controls.length!==0)))
      throw Error("Circuit gate has incorrect operand arity.");
    const parameters=step.gate==="U"?["theta","phi","lambda"]:
      ["RX","RY","RZ"].includes(step.gate)?["theta"]:[];
    if(parameters.some(k=>!Number.isFinite(step.params?.[k]))||
       Object.values(step.params??{}).some(v=>!Number.isFinite(v)))
      throw Error("Circuit gate requires finite parameters.");
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
    this.checkQubit(target);
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
    this.checkQubit(control);this.checkQubit(target);
    if(control===target)throw Error("Controlled gate requires distinct qubits.");
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
    this.checkQubit(c1);this.checkQubit(c2);this.checkQubit(target);
    if(new Set([c1,c2,target]).size!==3)throw Error("Toffoli requires three distinct qubits.");
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
    this.checkQubit(q0);this.checkQubit(q1);
    if(q0===q1)throw Error("SWAP requires distinct qubits.");
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

  /** Return probabilities only for numerically normalized finite states. */
  public getProbabilities(): Float64Array {
    const norm=this.normSquared();
    if(!Number.isFinite(norm)||Math.abs(norm-1)>1e-8)
      throw new Error("Quantum state normalization failed ("+norm+").");
    const probs=new Float64Array(this.stateSize);
    for(let i=0;i<this.stateSize;i++)
      probs[i]=this.real[i]*this.real[i]+this.imag[i]*this.imag[i];
    return probs;
  }

}
