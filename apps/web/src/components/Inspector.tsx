import React, { useEffect, useRef, useState } from "react";
import { Program } from "../../../engine/src/studio/model";
import type { Bloch, StudioResult } from "../../../engine/src/studio/simulate";
export function Inspector({ program }: { program: Program }) {
  const [position, setPosition] = useState(program.steps.length),
    [pauli, setPauli] = useState("Z".repeat(program.qubits));
  const through = Math.min(position, program.steps.length);
  type Snapshot = {
    vectors: Bloch[];
    amplitudes: StudioResult["stateVector"];
    info: StudioResult["stateVectorInfo"];
  };
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [observable, setObservable] = useState("Calculating…");
  const [error, setError] = useState("");
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => {
    if (program.qubits > 20) {
      setSnapshot(null);
      setError("");
      setObservable("Not available for this mathematical representation.");
      return;
    }
    const worker = new Worker(new URL("../services/inspector.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    setSnapshot(null);
    setError("");
    setObservable("Calculating…");
    worker.onmessage = (event) => {
      const data = event.data;
      if (data.kind === "snapshot")
        setSnapshot({ vectors: data.vectors, amplitudes: data.amplitudes, info: data.info });
      else if (data.kind === "expectation")
        setObservable(data.value);
      else if (data.kind === "error")
        setError(data.error);
    };
    worker.onerror = () => setError("State inspection failed. Try reloading the studio.");
    worker.postMessage({ kind: "initialize", program, through, pauli });
    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [program, through]);
  // Reuse the computed state when changing Pauli operators.
  useEffect(() => {
    workerRef.current?.postMessage({ kind: "expectation", pauli });
  }, [pauli, program, through]);
  const vectors = snapshot?.vectors ?? [];
  if (program.qubits > 20) return (
    <div className="lab-panel inspector">
      <div className="panel-intro"><div><h3>Exact scalable-state inspector</h3>
      <p>The current circuit has {program.qubits} logical qubits. No 2^n amplitude array is allocated.</p></div>
      <span className="lab-tag">SCALABLE EXECUTION</span></div>
      <p className="text-xs text-neutral-400">Run the circuit to inspect exact measurement probabilities and sampled outcomes. Full amplitude views and Bloch diagnostics remain available for the ≤20-qubit dense backend. Above 20 qubits, supported circuits use stabilizer, separable-state or bounded partitioned representations, which are not fully displayed as a dense statevector.</p>
    </div>
  );
  return (
    <div className="lab-panel inspector">
      <div className="panel-intro">
        <div>
          <h3>Inspect the quantum state</h3>
          <p>
            Exact, noise-free state before measurement. Scrub through gates to
            see how amplitudes evolve.
          </p>
        </div>
        <span className="lab-tag">IDEAL REFERENCE</span>
      </div>
      {error && <p role="alert" className="text-red-400 text-xs">{error}</p>}
      {!snapshot && !error && <p role="status" className="text-xs text-neutral-400">Computing the ideal state in a background worker…</p>}
      <label className="step-scrubber">
        After operation{" "}
        <b>
          {through} / {program.steps.length}
        </b>
        <input
          aria-label="Inspection step"
          type="range"
          min="0"
          max={program.steps.length}
          value={through}
          onChange={(e) => setPosition(Number(e.target.value))}
        />
        <span>
          {through === 0
            ? "Initial |0…0⟩ state"
            : program.steps[through - 1]?.gate}
        </span>
      </label>
      <div className="bloch-grid">
        {vectors.map((v) => (
          <div className="bloch-card" key={v.qubit}>
            <div>
              <b>q[{v.qubit}]</b>
              <span>Purity {v.purity.toFixed(3)}</span>
            </div>
            <svg
              viewBox="0 0 180 150"
              role="img"
              aria-label={`Qubit ${v.qubit} Bloch vector X ${v.x.toFixed(3)}, Y ${v.y.toFixed(3)}, Z ${v.z.toFixed(3)}`}
            >
              <defs>
                <radialGradient id={`sphere-${v.qubit}`}>
                  <stop stopColor="#557b8b" stopOpacity=".25" />
                  <stop offset="1" stopColor="#10202d" stopOpacity=".3" />
                </radialGradient>
              </defs>
              <circle
                cx="90"
                cy="75"
                r="55"
                fill={`url(#sphere-${v.qubit})`}
                stroke="#536777"
              />
              <ellipse
                cx="90"
                cy="75"
                rx="55"
                ry="17"
                fill="none"
                stroke="#425263"
              />
              <ellipse
                cx="90"
                cy="75"
                rx="18"
                ry="55"
                fill="none"
                stroke="#425263"
              />
              <path
                d="M90 15V135M30 75H150M52 103L128 47"
                stroke="#536777"
                strokeDasharray="3 4"
              />
              <text x="94" y="15">
                Z
              </text>
              <text x="153" y="78">
                X
              </text>
              <text x="130" y="45">
                Y
              </text>
              <line
                x1="90"
                y1="75"
                x2={90 + v.x * 50 + v.y * 22}
                y2={75 - v.z * 50 - v.y * 12}
                stroke="#dfbf7d"
                strokeWidth="3"
              />
              <circle
                cx={90 + v.x * 50 + v.y * 22}
                cy={75 - v.z * 50 - v.y * 12}
                r="4"
                fill="#f6d897"
              />
            </svg>
            <code>
              X {v.x.toFixed(3)} · Y {v.y.toFixed(3)} · Z {v.z.toFixed(3)}
            </code>
            <small>
              {v.purity < 0.999
                ? "Entangled reduced state"
                : "Pure single-qubit state"}
            </small>
          </div>
        ))}
      </div>
      <div className="observable">
        <label>
          Pauli observable{" "}
          <input
            aria-label="Pauli observable"
            value={pauli}
            maxLength={program.qubits}
            onChange={(e) => setPauli(e.target.value.toUpperCase())}
          />
        </label>
        <output>⟨P⟩ = {observable}</output>
        <small>
          Order: q[{program.qubits - 1}] … q[0]. This is an exact expectation,
          not a shot estimate.
        </small>
      </div>
      {snapshot && <p className="text-xs text-neutral-400">
        Displaying {snapshot.info.shownStates} strongest amplitudes from {snapshot.info.nonZeroStates.toLocaleString()} non-zero basis states
        {snapshot.info.truncated
          ? ` (ranked summary; ${(100 * snapshot.info.omittedProbabilityMass).toPrecision(4)}% of probability mass omitted)`
          : ""}.
      </p>}
      <div className="amplitude-grid">
        {snapshot?.amplitudes.map((entry) => {
          const r = entry.real,
            im = entry.imag,
            p = r * r + im * im;
          if (p < 1e-12) return null;
          const phase = Math.atan2(im, r);
          return (
            <div key={entry.state}>
              <span
                className="phase-disk"
                style={{
                  background: `conic-gradient(from ${(phase * 180) / Math.PI}deg, #dfbf7d 0 4deg, #1b2935 4deg)`,
                }}
              />
              <code>{entry.state}</code>
              <b>{100 * p < 0.01 ? (100 * p).toExponential(2) : (100 * p).toFixed(2)}%</b>
              <small>{phase.toFixed(3)} rad</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
