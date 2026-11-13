import React, { useMemo, useState } from "react";
import { Program } from "../../../engine/src/studio/model";
import {
  idealState,
  blochVectors,
  expectation,
} from "../../../engine/src/studio/simulate";
export function Inspector({ program }: { program: Program }) {
  const [position, setPosition] = useState(program.steps.length),
    [pauli, setPauli] = useState("Z".repeat(program.qubits));
  const through = Math.min(position, program.steps.length);
  const state = useMemo(() => idealState(program, through), [program, through]);
  const vectors = blochVectors(state);
  let observable = "";
  try {
    observable = expectation(state, pauli).toFixed(6);
  } catch (e) {
    observable = (e as Error).message;
  }
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
      <div className="amplitude-grid">
        {Array.from({ length: state.stateSize }, (_, i) => {
          const r = state.real[i],
            im = state.imag[i],
            p = r * r + im * im;
          if (p < 1e-12) return null;
          const phase = Math.atan2(im, r);
          return (
            <div key={i}>
              <span
                className="phase-disk"
                style={{
                  background: `conic-gradient(from ${(phase * 180) / Math.PI}deg, #dfbf7d 0 4deg, #1b2935 4deg)`,
                }}
              />
              <code>|{i.toString(2).padStart(program.qubits, "0")}⟩</code>
              <b>{(100 * p).toFixed(2)}%</b>
              <small>{phase.toFixed(3)} rad</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
