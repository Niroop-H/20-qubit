import { QuantumCircuit } from "../simulator/QuantumCircuit";
import { GATES } from "../math/gates";
import type { NoiseConfig } from "../types/circuit";
import { Program, validateProgram } from "./model";
export interface Bloch {
  qubit: number;
  x: number;
  y: number;
  z: number;
  purity: number;
}
export interface StudioResult {
  counts: Record<string, number>;
  probabilities: Record<string, number>;
  idealProbabilities: Record<string, number>;
  stateVector: {
    state: string;
    real: number;
    imag: number;
    magnitude: number;
    phase: number;
  }[];
  /** Bounded, largest-magnitude ideal amplitudes, not the entire statevector. */
  stateVectorInfo: {
    totalStates: number;
    nonZeroStates: number;
    shownStates: number;
    truncated: boolean;
  };
  bloch: Bloch[];
  executionTimeMs: number;
  seed: number;
  stateLabel: string;
  backendInfo: {
    qpuSimulated: string;
    qubitCount: number;
    shots: number;
    fidelityEstimated: number | null;
  };
}

/**
 * Select only the strongest basis amplitudes. Never materialize a million JS
 * objects for a 20-qubit state or transfer them across a browser Worker.
 */
export function summarizeState(c: QuantumCircuit, limit = 128) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 512)
    throw new Error("State summary limit must be between 1 and 512.");
  const best: { index: number; probability: number }[] = [];
  let nonZeroStates = 0;
  for (let i = 0; i < c.stateSize; i++) {
    const probability = c.real[i] * c.real[i] + c.imag[i] * c.imag[i];
    if (probability <= 1e-14) continue;
    nonZeroStates++;
    if (best.length === limit && probability <= best[best.length - 1].probability)
      continue;
    let lo = 0, hi = best.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (probability > best[mid].probability) hi = mid;
      else lo = mid + 1;
    }
    best.splice(lo, 0, { index: i, probability });
    if (best.length > limit) best.pop();
  }
  const stateVector = best.map(({ index }) => ({
    state: "|" + index.toString(2).padStart(c.numQubits, "0") + "⟩",
    real: c.real[index],
    imag: c.imag[index],
    magnitude: Math.hypot(c.real[index], c.imag[index]),
    phase: Math.atan2(c.imag[index], c.real[index]),
  }));
  return {
    stateVector,
    stateVectorInfo: {
      totalStates: c.stateSize,
      nonZeroStates,
      shownStates: stateVector.length,
      truncated: nonZeroStates > stateVector.length,
    },
  };
}

export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function idealState(p: Program, through = p.steps.length) {
  validateProgram(p);
  const c = new QuantumCircuit(p.qubits);
  p.steps.slice(0, through).forEach((s) => c.applyStep(s));
  return c;
}
export function blochVectors(c: QuantumCircuit): Bloch[] {
  return Array.from({ length: c.numQubits }, (_, q) => {
    let x = 0,
      y = 0,
      z = 0;
    const bit = 1 << q;
    for (let i = 0; i < c.stateSize; i++) {
      const prob = c.real[i] ** 2 + c.imag[i] ** 2;
      z += i & bit ? -prob : prob;
      if (!(i & bit)) {
        const j = i | bit;
        x += 2 * (c.real[i] * c.real[j] + c.imag[i] * c.imag[j]);
        y += 2 * (c.real[i] * c.imag[j] - c.imag[i] * c.real[j]);
      }
    }
    return {
      qubit: q,
      x,
      y,
      z,
      purity: Math.min(1, (1 + x * x + y * y + z * z) / 2),
    };
  });
}
export function expectation(c: QuantumCircuit, pauli: string): number {
  if (!new RegExp(`^[IXYZ]{${c.numQubits}}$`).test(pauli))
    throw new Error(
      `Use exactly ${c.numQubits} Pauli letters (I, X, Y, Z), highest qubit on the left.`,
    );
  const copy = new QuantumCircuit(c.numQubits);
  copy.real.set(c.real);
  copy.imag.set(c.imag);
  [...pauli]
    .reverse()
    .forEach((op, q) => copy.applySingleQubitGate(q, GATES[op]));
  let v = 0;
  for (let i = 0; i < c.stateSize; i++)
    v += c.real[i] * copy.real[i] + c.imag[i] * copy.imag[i];
  return v;
}
export function validateNoise(n: NoiseConfig) {
  if (
    ![n.t1, n.t2, n.gateTime, n.depolarizingRate, ...n.readoutError].every(
      Number.isFinite,
    ) ||
    n.t1 <= 0 ||
    n.t2 <= 0 ||
    n.gateTime <= 0 ||
    n.t2 > 2 * n.t1 ||
    [n.depolarizingRate, ...n.readoutError].some((v) => v < 0 || v > 1)
  )
    throw new Error(
      "Noise requires positive times, T2 ≤ 2×T1, and error probabilities between 0 and 1.",
    );
}
/** Normalized Monte Carlo Kraus trajectories, independently sampled for each shot. */
function noise(
  c: QuantumCircuit,
  qs: number[],
  n: NoiseConfig,
  rng: () => number,
) {
  const gamma = 1 - Math.exp(-n.gateTime / n.t1);
  const dephase =
    (1 - Math.exp(-n.gateTime * Math.max(0, 1 / n.t2 - 1 / (2 * n.t1)))) / 2;
  for (const q of qs) {
    const bit = 1 << q;
    let excited = 0;
    for (let i = 0; i < c.stateSize; i++)
      if (i & bit) excited += c.real[i] ** 2 + c.imag[i] ** 2;
    const jump = rng() < gamma * excited;
    if (jump) {
      const scale = 1 / Math.sqrt(excited);
      for (let i = 0; i < c.stateSize; i++)
        if (!(i & bit)) {
          c.real[i] = c.real[i | bit] * scale;
          c.imag[i] = c.imag[i | bit] * scale;
          c.real[i | bit] = 0;
          c.imag[i | bit] = 0;
        }
    } else {
      const scale = 1 / Math.sqrt(Math.max(1e-300, 1 - gamma * excited));
      for (let i = 0; i < c.stateSize; i++) {
        const factor = (i & bit ? Math.sqrt(1 - gamma) : 1) * scale;
        c.real[i] *= factor;
        c.imag[i] *= factor;
      }
    }
    if (rng() < dephase) c.applySingleQubitGate(q, GATES.Z);
    if (rng() < n.depolarizingRate)
      c.applySingleQubitGate(q, GATES[["X", "Y", "Z"][Math.floor(rng() * 3)]]);
  }
}
export function simulate(
  p: Program,
  shots: number,
  seed: number,
  n?: NoiseConfig,
  onProgress?: (progress: number) => void,
): StudioResult {
  validateProgram(p);
  if (!Number.isInteger(shots) || shots < 1 || shots > 8192)
    throw new Error("Shots must be an integer between 1 and 8192.");
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295)
    throw new Error("Seed must be an integer from 0 to 4294967295.");
  if (n?.enabled) {
    validateNoise(n);
    if (shots * Math.max(1, p.steps.length) * 2 ** p.qubits > 16000000)
      throw new Error(
        "This noisy job exceeds the browser work limit. Reduce shots, gates or qubits, or run without noise.",
      );
  }
  const start = performance.now(),
    rng = seededRandom(seed),
    ideal = idealState(p),
    probs = ideal.getProbabilities();
  const measures = p.steps.filter((s) => s.gate === "MEASURE");
  const width = measures.length ? p.bits : p.qubits;
  const map = (basis: number, withNoise = false) => {
    const bits = Array(width).fill(0);
    if (measures.length)
      measures.forEach(
        (s) =>
          (bits[s.classical ?? s.targets[0]] = (basis >> s.targets[0]) & 1),
      );
    else bits.forEach((_, q) => (bits[q] = (basis >> q) & 1));
    if (withNoise && n) {
      const destinations = measures.length
        ? measures.map((s) => s.classical ?? s.targets[0])
        : bits.map((_, q) => q);
      for (const q of destinations)
        if (rng() < n.readoutError[bits[q] === 0 ? 0 : 1]) bits[q] ^= 1;
    }
    return bits.reverse().join("");
  };
  // Typed-array marginal distribution avoids allocating up to 2^20 string keys.
  // A non-measurement circuit can directly reuse its exact basis probabilities.
  const idealDistribution = measures.length ? new Float64Array(2 ** width) : probs;
  if (measures.length) {
    const positions = measures.map((s) => [1 << s.targets[0], 1 << (s.classical ?? s.targets[0])]);
    for (let i = 0; i < probs.length; i++) {
      let classical = 0;
      for (const [qMask, cMask] of positions)
        if (i & qMask) classical |= cMask;
      idealDistribution[classical] += probs[i];
    }
  }
  // One CDF build plus O(log 2^n) inverse-CDF samples, rather than
  // O(shots * 2^n) linear scans for ideal executions.
  const cdf = n?.enabled ? null : new Float64Array(probs.length);
  if (cdf) {
    let running = 0;
    for (let i = 0; i < probs.length; i++) {
      running += probs[i];
      cdf[i] = running;
    }
  }
  const counts: Record<string, number> = {};
  const draw = (prob: Float64Array) => {
    if (cdf && prob === probs) {
      const r = rng() * cdf[cdf.length - 1];
      let lo = 0, hi = cdf.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (r < cdf[mid]) hi = mid;
        else lo = mid + 1;
      }
      return lo;
    }
    // Independent noisy Kraus trajectories cannot reuse the ideal CDF.
    const r = rng();
    let sum = 0;
    for (let i = 0; i < prob.length; i++) {
      sum += prob[i];
      if (r < sum) return i;
    }
    return prob.length - 1;
  };
  for (let shot = 0; shot < shots; shot++) {
    let prob = probs;
    if (n?.enabled) {
      const c = new QuantumCircuit(p.qubits);
      for (const s of p.steps) {
        c.applyStep(s);
        if (s.gate !== "MEASURE" && s.gate !== "BARRIER")
          noise(c, [...s.targets, ...(s.controls ?? [])], n, rng);
      }
      prob = c.getProbabilities();
    }
    const label = map(draw(prob), !!n?.enabled);
    counts[label] = (counts[label] ?? 0) + 1;
    if (shot % 128 === 0) onProgress?.(shot / shots);
  }
  // Retain all observed outcomes and up to 64 likely ideal outcomes.
  // Recharts, JSON exports and localStorage must never receive 2^20 entries.
  const ranked: number[] = [];
  for (let i = 0; i < idealDistribution.length; i++) {
    if (idealDistribution[i] <= 1e-15) continue;
    if (ranked.length < 64) {
      ranked.push(i);
      if (ranked.length === 64)
        ranked.sort((a, b) => idealDistribution[a] - idealDistribution[b]);
    } else if (idealDistribution[i] > idealDistribution[ranked[0]]) {
      ranked[0] = i;
      ranked.sort((a, b) => idealDistribution[a] - idealDistribution[b]);
    }
  }
  const keys = new Set<number>(ranked);
  for (const label of Object.keys(counts)) keys.add(parseInt(label, 2));
  const idealProbabilities: Record<string, number> = {};
  const probabilities: Record<string, number> = {};
  for (const index of keys) {
    const label = index.toString(2).padStart(width, "0");
    idealProbabilities[label] = idealDistribution[index];
    probabilities[label] = (counts[label] ?? 0) / shots;
  }
  const { stateVector, stateVectorInfo } = summarizeState(ideal);
  onProgress?.(1);
  return {
    counts,
    probabilities,
    idealProbabilities,
    stateVector,
    stateVectorInfo,
    bloch: blochVectors(ideal),
    seed,
    executionTimeMs: performance.now() - start,
    stateLabel: n?.enabled
      ? "Ideal reference · noise-free, before measurement"
      : "Ideal state · before terminal measurement",
    backendInfo: {
      qpuSimulated: n?.enabled
        ? "Local noisy trajectory simulator"
        : "Local exact statevector simulator",
      qubitCount: p.qubits,
      shots,
      fidelityEstimated: n?.enabled ? null : 1,
    },
  };
}
