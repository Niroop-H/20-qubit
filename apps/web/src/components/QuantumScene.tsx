import React, { useRef } from "react";
import { ArrowDownRight, Pause, Play } from "lucide-react";
interface QuantumSceneProps {
  qubits: number;
  gateCount: number;
  isRunning: boolean;
  motion: boolean;
  onToggleMotion: () => void;
}
/** Decorative CSS 3D package; not a visualization of the simulated state. */
export const QuantumScene: React.FC<QuantumSceneProps> = ({
  qubits,
  gateCount,
  isRunning,
  motion,
  onToggleMotion,
}) => {
  const stage = useRef<HTMLDivElement>(null);
  const tilt = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      !motion ||
      event.pointerType === "touch" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const rect = event.currentTarget.getBoundingClientRect();
    stage.current?.style.setProperty(
      "--pointer-x",
      `${((event.clientX - rect.left) / rect.width - 0.5) * 14}deg`,
    );
    stage.current?.style.setProperty(
      "--pointer-y",
      `${((event.clientY - rect.top) / rect.height - 0.5) * -10}deg`,
    );
  };
  const resetTilt = () => {
    stage.current?.style.setProperty("--pointer-x", "0deg");
    stage.current?.style.setProperty("--pointer-y", "0deg");
  };
  return (
    <section
      className={`quantum-hero ${isRunning ? "is-executing" : ""}`}
      aria-labelledby="hero-title"
    >
      <div className="hero-copy">
        <p className="eyebrow">
          <span /> THE NEXT STATE OF POSSIBILITY
        </p>
        <h1 id="hero-title">
          Think beyond
          <br />
          the <em>classical.</em>
        </h1>
        <p className="hero-description">
          Compose quantum circuits. Explore superposition.
          <br className="desktop-break" /> Turn possibility into measurable
          outcomes.
        </p>
        <a className="hero-link" href="#workspace">
          Enter the quantum workspace <ArrowDownRight size={18} />
        </a>
        <div className="hero-specs">
          <div>
            <b>{String(qubits).padStart(2, "0")}</b>
            <span>ACTIVE QUBITS</span>
          </div>
          <div>
            <b>{(2 ** qubits).toLocaleString()}</b>
            <span>BASIS STATES</span>
          </div>
          <div>
            <b>{String(gateCount).padStart(2, "0")}</b>
            <span>CIRCUIT GATES</span>
          </div>
        </div>
      </div>
      <div
        className="quantum-visual"
        onPointerMove={tilt}
        onPointerLeave={resetTilt}
      >
        <div className="visual-grid" aria-hidden="true" />
        <div className="visual-coordinate">
          Q / {String(qubits).padStart(2, "0")}{" "}
          <span>VIRTUAL TRANSMON ARCHITECTURE</span>
        </div>
        <div className="quantum-stage" ref={stage} aria-hidden="true">
          <div className="core-halo" />
          <div className="processor-assembly">
            <div className="processor-layer layer-bottom" />
            <div className="processor-layer layer-middle" />
            <div className="processor-layer layer-top">
              <div className="chip-traces" />
              <div className="chip-die">
                <img src="/mah-quantum-logo.jpg" alt="" />
              </div>
              {Array.from({ length: 20 }, (_, i) => (
                <span
                  key={i}
                  className={`qubit-node ${i < qubits ? "node-active" : ""}`}
                  style={{
                    left: `${14 + (i % 5) * 17}%`,
                    top: `${17 + Math.floor(i / 5) * 21}%`,
                    animationDelay: `${(i % 8) * 0.3}s`,
                  }}
                />
              ))}
              <span className="chip-engraving">MAH / QUANTUM</span>
            </div>
            <div className="quantum-orbit orbit-one" />
            <div className="quantum-orbit orbit-two" />
          </div>
        </div>
        <div className="visual-caption">
          <span className="status-dot" />{" "}
          {isRunning ? "SIMULATION IN PROGRESS" : "QUANTUM CORE / CONCEPT VIEW"}
        </div>
        <button
          className="motion-toggle"
          onClick={onToggleMotion}
          aria-label={
            motion ? "Pause ambient animation" : "Enable ambient animation"
          }
          aria-pressed={!motion}
        >
          {motion ? <Pause size={12} /> : <Play size={12} />}
          <span>{motion ? "Motion on" : "Motion off"}</span>
        </button>
      </div>
    </section>
  );
};
