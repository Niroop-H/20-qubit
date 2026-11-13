import React, { useEffect, useRef } from "react";
import type { NoiseSettings } from "../types";
export function NoiseDialog({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: NoiseSettings;
  onChange: (n: NoiseSettings) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="noise-dialog"
      aria-labelledby="noise-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="noise-dialog-content p-6 space-y-4">
        <h3 id="noise-title">Local noise model</h3>
        <p className="lab-muted">
          Independent Monte Carlo trajectories with amplitude damping,
          dephasing, Pauli errors and readout confusion. Generic noise, not IBM
          device calibration.
        </p>
        <label className="noise-enable">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          />{" "}
          Enable noise
        </label>
        <div className="noise-fields">
          {(["t1", "t2", "gateTime", "depolarizingRate"] as const).map(
            (key) => (
              <label key={key}>
                {
                  {
                    t1: "T1 relaxation (µs)",
                    t2: "T2 coherence (µs)",
                    gateTime: "Gate time (µs)",
                    depolarizingRate: "Pauli error probability",
                  }[key]
                }
                <input
                  type="number"
                  step="any"
                  value={value[key]}
                  onChange={(e) =>
                    onChange({ ...value, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ),
          )}
          {[0, 1].map((i) => (
            <label key={i}>
              Readout P({1 - i}|{i})
              <input
                type="number"
                min="0"
                max="1"
                step=".001"
                value={value.readoutError[i]}
                onChange={(e) =>
                  onChange({
                    ...value,
                    readoutError: value.readoutError.map((v, j) =>
                      i === j ? Number(e.target.value) : v,
                    ) as [number, number],
                  })
                }
              />
            </label>
          ))}
        </div>
        <p className="lab-muted">
          T2 must be ≤ 2×T1. Large noisy jobs are bounded to keep your browser
          responsive. The state inspector always shows the ideal reference.
        </p>
        <button className="gold-action" onClick={onClose}>
          Apply & close
        </button>
      </div>
    </dialog>
  );
}
