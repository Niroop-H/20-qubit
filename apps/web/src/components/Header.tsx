import React from "react";
import {
  Play,
  Settings2,
  RotateCcw,
  Loader2,
} from "lucide-react";
interface HeaderProps {
  onRun: () => void;
  onReset: () => void;
  isRunning: boolean;
  shots: number;
  setShots: (s: number) => void;
  qubits: number;
  setQubits: (q: number) => void;
  toggleNoiseModal: () => void;
  noiseEnabled: boolean;
}
export const CircuitControls: React.FC<HeaderProps> = ({
  onRun,
  onReset,
  isRunning,
  shots,
  setShots,
  qubits,
  setQubits,
  toggleNoiseModal,
  noiseEnabled,
}) => (
  <section className="studio-run-controls" aria-label="Circuit execution controls">
    <div className="control-row">
      <div className="workspace-label">
        <span className="status-dot" /> Circuit controls{" "}
        <span className="workspace-version">/ 01</span>
      </div>
      <div className="studio-controls">
        <label className="select-control">
          Qubits{" "}
          <select
            aria-label="Qubit count"
            value={qubits}
            onChange={(e) => setQubits(Number(e.target.value))}
            disabled={isRunning}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n.toString().padStart(2, "0")}
              </option>
            ))}
          </select>
        </label>
        <label className="select-control">
          Shots{" "}
          <select
            aria-label="Shot count"
            value={shots}
            onChange={(e) => setShots(Number(e.target.value))}
            disabled={isRunning}
          >
            {[128, 256, 512, 1024, 2048, 4096, 8192].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <button
          className={`noise-button ${noiseEnabled ? "enabled" : ""}`}
          onClick={toggleNoiseModal}
          disabled={isRunning}
        >
          <Settings2 size={15} /> Noise{" "}
          <span>{noiseEnabled ? "ON" : "OFF"}</span>
        </button>
        <button
          className="reset-button"
          onClick={onReset}
          disabled={isRunning}
          title="Reset circuit"
          aria-label="Reset circuit"
        >
          <RotateCcw size={16} />
        </button>
        <button className="run-button" onClick={onRun} disabled={isRunning}>
          {isRunning ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Play size={14} fill="currentColor" />
          )}
          {isRunning ? "Running…" : "Run circuit"}
        </button>
      </div>
    </div>
  </section>
);
