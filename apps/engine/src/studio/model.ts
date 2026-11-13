import type { CircuitStep } from "../types/circuit";
export type Step = CircuitStep & { classical?: number };
export interface Program {
  qubits: number;
  bits: number;
  steps: Step[];
}
export const MAX_QUBITS = 20;
export const MAX_STEPS = 256;
export const gateNames = [
  "I",
  "H",
  "X",
  "Y",
  "Z",
  "S",
  "T",
  "RX",
  "RY",
  "RZ",
  "U",
  "CX",
  "CZ",
  "SWAP",
  "CCX",
  "MEASURE",
  "BARRIER",
];
export function validateProgram(value: unknown): asserts value is Program {
  const p = value as Program;
  if (
    !p ||
    !Number.isInteger(p.qubits) ||
    p.qubits < 1 ||
    p.qubits > MAX_QUBITS
  )
    throw new Error("Use between 1 and " + MAX_QUBITS + " qubits.");
  if (!Number.isInteger(p.bits) || p.bits < 1 || p.bits > MAX_QUBITS)
    throw new Error("Use between 1 and " + MAX_QUBITS + " classical bits.");
  if (!Array.isArray(p.steps) || p.steps.length > MAX_STEPS)
    throw new Error("A circuit may contain at most 256 operations.");
  let measured = false;
  const destinations = new Set<number>();
  const sources = new Set<number>();
  const ids = new Set<string>();
  for (const [index, s] of p.steps.entries()) {
    const fail = (message: string): never => {
      throw new Error(`Operation ${index + 1}: ${message}`);
    };
    if (!s || !gateNames.includes(s.gate)) fail("unsupported gate.");
    if (typeof s.id !== "string" || ids.has(s.id))
      fail("operation IDs must be unique strings.");
    ids.add(s.id);
    if (
      !Array.isArray(s.targets) ||
      (s.controls !== undefined && !Array.isArray(s.controls))
    )
      fail("invalid operands.");
    const operands = [...s.targets, ...(s.controls ?? [])];
    if (operands.some((q) => !Number.isInteger(q) || q < 0 || q >= p.qubits))
      fail("qubit index out of range.");
    if (new Set(operands).size !== operands.length)
      fail("control and target qubits must be distinct.");
    const nc = s.gate === "CCX" ? 2 : ["CX", "CZ"].includes(s.gate) ? 1 : 0;
    const nt =
      s.gate === "SWAP" ? 2 : s.gate === "BARRIER" ? s.targets.length : 1;
    if ((s.controls?.length ?? 0) !== nc || s.targets.length !== nt || !nt)
      fail("incorrect number of operands.");
    if (
      s.params &&
      (typeof s.params !== "object" ||
        Object.values(s.params).some(
          (v) => typeof v !== "number" || !Number.isFinite(v),
        ))
    )
      fail("gate parameters must be finite numbers.");
    const required =
      s.gate === "U"
        ? ["theta", "phi", "lambda"]
        : ["RX", "RY", "RZ"].includes(s.gate)
          ? ["theta"]
          : [];
    if (required.some((k) => !Number.isFinite(s.params?.[k])))
      fail(`requires ${required.join(", ")} in radians.`);
    if (s.gate === "MEASURE") {
      measured = true;
      const c = s.classical ?? s.targets[0];
      if (!Number.isInteger(c) || c < 0 || c >= p.bits)
        fail("classical bit index out of range.");
      if (destinations.has(c) || sources.has(s.targets[0]))
        fail("measure each qubit and destination at most once.");
      destinations.add(c);
      sources.add(s.targets[0]);
    } else if (measured && s.gate !== "BARRIER")
      fail(
        "only terminal measurements are supported; move measurements to the end.",
      );
  }
}
export function circuitStats(p: Program) {
  const levels = Array(p.qubits).fill(0) as number[];
  let twoQubit = 0;
  for (const s of p.steps) {
    const qs = [...s.targets, ...(s.controls ?? [])];
    const level =
      Math.max(...qs.map((q) => levels[q])) + (s.gate === "BARRIER" ? 0 : 1);
    qs.forEach((q) => (levels[q] = level));
    if (qs.length > 1 && s.gate !== "BARRIER") twoQubit++;
  }
  return {
    depth: Math.max(0, ...levels),
    gates: p.steps.filter((s) => !["MEASURE", "BARRIER"].includes(s.gate))
      .length,
    twoQubit,
  };
}
