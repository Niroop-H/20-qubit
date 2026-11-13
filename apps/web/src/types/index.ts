export type GateType =
  | "I" | "H" | "X" | "Y" | "Z" | "S" | "T"
  | "RX" | "RY" | "RZ" | "U"
  | "CX" | "CZ" | "SWAP" | "CCX"
  | "MEASURE" | "BARRIER";

export interface CircuitStep {
  id: string;
  gate: GateType;
  targets: number[];
  controls?: number[];
  params?: Record<string, number>;
}

export interface NoiseSettings {
  enabled: boolean;
  t1: number;
  t2: number;
  gateTime: number;
  readoutError: [number, number];
  depolarizingRate: number;
}

export interface StateVectorEntry {
  state: string;
  real: number;
  imag: number;
  magnitude: number;
  phase: number;
}

export type SimulationResult = import("../../../engine/src/studio/simulate").StudioResult;

/** Gate metadata for the palette UI */
export interface GateInfo {
  type: GateType;
  label: string;
  description: string;
  category: string;
  isParametric: boolean;
  isMultiQubit: boolean;
  requiredQubits: number;
}

export const GATE_CATALOG: GateInfo[] = [
  { type: "I",  label: "I",   description: "Identity",       category: "Clifford",      isParametric: false, isMultiQubit: false, requiredQubits: 1 },
  { type: "H",  label: "H",   description: "Hadamard",       category: "Superposition", isParametric: false, isMultiQubit: false, requiredQubits: 1 },
  { type: "X",  label: "X",   description: "Pauli-X (NOT)",  category: "Clifford",      isParametric: false, isMultiQubit: false, requiredQubits: 1 },
  { type: "Y",  label: "Y",   description: "Pauli-Y",        category: "Clifford",      isParametric: false, isMultiQubit: false, requiredQubits: 1 },
  { type: "Z",  label: "Z",   description: "Pauli-Z",        category: "Clifford",      isParametric: false, isMultiQubit: false, requiredQubits: 1 },
  { type: "S",  label: "S",   description: "Phase (π/2)",    category: "Clifford",      isParametric: false, isMultiQubit: false, requiredQubits: 1 },
  { type: "T",  label: "T",   description: "π/4 Gate",       category: "Phase",         isParametric: false, isMultiQubit: false, requiredQubits: 1 },
  { type: "RX", label: "Rx",  description: "Rotation X",     category: "Parametric",    isParametric: true,  isMultiQubit: false, requiredQubits: 1 },
  { type: "RY", label: "Ry",  description: "Rotation Y",     category: "Parametric",    isParametric: true,  isMultiQubit: false, requiredQubits: 1 },
  { type: "RZ", label: "Rz",  description: "Rotation Z",     category: "Parametric",    isParametric: true,  isMultiQubit: false, requiredQubits: 1 },
  { type: "U",  label: "U",   description: "Arbitrary Unitary", category: "Parametric", isParametric: true,  isMultiQubit: false, requiredQubits: 1 },
  { type: "CX", label: "CX",  description: "CNOT",           category: "Entanglement",  isParametric: false, isMultiQubit: true,  requiredQubits: 2 },
  { type: "CZ", label: "CZ",  description: "Controlled-Z",   category: "Entanglement",  isParametric: false, isMultiQubit: true,  requiredQubits: 2 },
  { type: "SWAP",label: "SWP", description: "Swap Qubits",   category: "Entanglement",  isParametric: false, isMultiQubit: true,  requiredQubits: 2 },
  { type: "CCX", label: "CCX", description: "Toffoli Gate",  category: "Multi-Qubit",   isParametric: false, isMultiQubit: true,  requiredQubits: 3 },
  { type: "MEASURE", label: "M", description: "Measurement",  category: "Operations",    isParametric: false, isMultiQubit: false, requiredQubits: 1 },
  { type: "BARRIER", label: "│", description: "Barrier",      category: "Operations",    isParametric: false, isMultiQubit: false, requiredQubits: 1 },
];
