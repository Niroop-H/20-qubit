import React from "react";
export type CodeFormat = "qasm2" | "qasm3" | "qiskit";
export function CodeEditor({
  source,
  format,
  onFormat,
  onChange,
  onApply,
  onRun,
  onExport,
  disabled,
  dirty,
}: {
  source: string;
  format: CodeFormat;
  onFormat: (v: CodeFormat) => void;
  onChange: (v: string) => void;
  onApply: () => void;
  onRun: () => void;
  onExport: () => void;
  disabled: boolean;
  dirty: boolean;
}) {
  return (
    <div className="lab-panel code-panel">
      <div className="code-toolbar">
        <div className="code-formats">
          {(["qasm2", "qasm3", "qiskit"] as const).map((f) => (
            <button
              key={f}
              disabled={disabled}
              aria-pressed={format === f}
              onClick={() => onFormat(f)}
            >
              {f === "qasm2"
                ? "OpenQASM 2"
                : f === "qasm3"
                  ? "OpenQASM 3"
                  : "Qiskit export"}
            </button>
          ))}
        </div>
        <div className="lab-actions">
          <button onClick={onExport}>Download</button>
          {format !== "qiskit" && (
            <>
              <button disabled={disabled || !dirty} onClick={onApply}>
                Apply to circuit
              </button>
              <button
                disabled={disabled}
                className="gold-action"
                onClick={onRun}
              >
                Compile & run
              </button>
            </>
          )}
        </div>
      </div>
      <p className="code-note">
        {format === "qiskit"
          ? "Read-only Python export. Run this with Qiskit in your own Python environment; this website does not execute Python."
          : `${dirty ? "Unapplied code · compiling validates the whole program." : "Circuit and code are synchronized."} Static OpenQASM subset · 1–8 qubits · 256 expanded operations.`}
      </p>
      <div className="code-surface">
        <pre aria-hidden="true">
          {source
            .split("\n")
            .map((_, i) => i + 1)
            .join("\n")}
        </pre>
        <textarea
          aria-label={
            format === "qiskit" ? "Qiskit Python export" : "Quantum code editor"
          }
          spellCheck={false}
          readOnly={format === "qiskit" || disabled}
          value={source}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Tab" && format !== "qiskit") {
              e.preventDefault();
              const t = e.currentTarget;
              const start = t.selectionStart,
                end = t.selectionEnd;
              onChange(source.slice(0, start) + "  " + source.slice(end));
              requestAnimationFrame(() => {
                t.selectionStart = t.selectionEnd = start + 2;
              });
            }
          }}
        />
      </div>
      <div className="code-reference">
        <b>Supported</b>
        <span>
          id · h · x · y · z · s · sdg · t · tdg · sx · sxdg · rx · ry · rz · p
          · u/u3 · u2 · cx · cz · swap · ccx · barrier · terminal measure
        </span>
        <small>
          Angles: numbers, pi, + − × ÷, parentheses. One quantum and one
          classical register. Custom gates, loops, reset, dynamic control and
          pulse instructions are rejected.
        </small>
      </div>
    </div>
  );
}
