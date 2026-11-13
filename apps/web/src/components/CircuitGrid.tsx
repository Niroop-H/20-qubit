import { newId } from "../services/id";
import React from "react";
import type { CircuitStep, GateType } from "../types";
interface Props {
  qubits: number;
  steps: CircuitStep[];
  selectedGate: GateType | null;
  paramAngle: number;
  onAddStep: (s: CircuitStep) => void;
  onRemoveStep: (id: string) => void;
  onSelectStep?: (id: string) => void;
  selectedId?: string;
}
export const CircuitGrid: React.FC<Props> = ({
  qubits,
  steps,
  selectedGate,
  paramAngle,
  onAddStep,
  onRemoveStep,
  onSelectStep,
  selectedId,
}) => {
  const append = (q: number) => {
    if (!selectedGate) return;
    const available = Array.from({ length: qubits }, (_, i) => i).filter(
      (i) => i !== q,
    );
    const count =
      selectedGate === "CCX"
        ? 2
        : ["CX", "CZ", "SWAP"].includes(selectedGate)
          ? 1
          : 0;
    if (available.length < count) return;
    onAddStep({
      id: newId(),
      gate: selectedGate,
      targets: selectedGate === "SWAP" ? [q, available[0]] : [q],
      controls: ["CX", "CZ", "CCX"].includes(selectedGate)
        ? available.slice(0, count)
        : [],
      params:
        selectedGate === "U"
          ? { theta: paramAngle, phi: 0, lambda: 0 }
          : ["RX", "RY", "RZ"].includes(selectedGate)
            ? { theta: paramAngle }
            : undefined,
    });
  };
  const width = Math.max(780, 100 + (steps.length + 1) * 55),
    height = qubits * 58 + 24;
  return (
    <div className="circuit-grid">
      <div style={{ minWidth: width, position: "relative", height }}>
        <svg
          className="wire-overlay"
          width={width}
          height={height}
          aria-hidden="true"
        >
          {Array.from({ length: qubits }, (_, q) => (
            <line
              key={q}
              x1="76"
              x2={width - 10}
              y1={q * 58 + 30}
              y2={q * 58 + 30}
              stroke="#344557"
            />
          ))}
          {steps.map((s, i) => {
            const qs = [...s.targets, ...(s.controls ?? [])];
            if (qs.length < 2 || s.gate === "BARRIER") return null;
            return (
              <line
                key={s.id}
                x1={100 + i * 55}
                x2={100 + i * 55}
                y1={Math.min(...qs) * 58 + 30}
                y2={Math.max(...qs) * 58 + 30}
                stroke="#a2bdca"
                strokeWidth="2"
              />
            );
          })}
        </svg>
        {Array.from({ length: qubits }, (_, q) => (
          <div className="quantum-wire" key={q} style={{ top: q * 58 }}>
            <span className="wire-label">
              q[{q}] <small>|0⟩</small>
            </span>
            {steps.map((s, i) => (s.targets.includes(q) || s.controls?.includes(q)) ? (
              <div
                key={s.id}
                className="wire-slot"
                style={{ left: 80 + i * 55 }}
              >
                {s.controls?.includes(q) && <span className="control-node" />}
                {s.targets.includes(q) && (
                  <button
                    className={`placed-gate gate-${s.gate.toLowerCase()} ${selectedId === s.id ? "gate-focused" : ""}`}
                    title={`${s.gate} · click to edit`}
                    aria-label={`Edit ${s.gate} operation ${i + 1}`}
                    onClick={() => onSelectStep?.(s.id)}
                  >
                    {s.gate === "CX"
                      ? "⊕"
                      : s.gate === "SWAP"
                        ? "×"
                        : s.gate === "MEASURE"
                          ? "M"
                          : s.gate === "BARRIER"
                            ? "│"
                            : s.gate}
                  </button>
                )}
              </div>
            ) : null)}
            <button
              className="append-slot"
              style={{ left: 80 + steps.length * 55 }}
              disabled={steps.length >= 256}
              aria-label={`Append ${selectedGate} to qubit ${q}`}
              onClick={() => append(q)}
            >
              +
            </button>
          </div>
        ))}
      </div>
      <span className="sr-only">
        Select an operation to edit or remove it in the operation inspector.
      </span>
    </div>
  );
};
