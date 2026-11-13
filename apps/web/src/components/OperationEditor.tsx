import React, { useState } from "react";
import { Program, Step } from "../../../engine/src/studio/model";
export function OperationEditor({
  program,
  selected,
  onChange,
  onDelete,
  onMove,
  onSelect,
  disabled,
}: {
  program: Program;
  selected: string | null;
  onChange: (s: Step) => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  const s = program.steps.find((x) => x.id === selected);
  const [draft, setDraft] = useState<Step | null>(null);
  const d = draft?.id === s?.id ? draft : s;
  if (!s || !d)
    return (
      <div className="operation-inspector">
        <span>
          Select a gate on the canvas to edit its operands, angles, order or
          measurement destination.
        </span>
        {program.steps.length > 0 && (
          <button onClick={() => onSelect(program.steps[0].id)}>
            Inspect first operation
          </button>
        )}
      </div>
    );
  const set = (patch: Partial<Step>) => setDraft({ ...d, ...patch });
  const select = (
    label: string,
    value: number,
    change: (n: number) => void,
    count = program.qubits,
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => change(Number(e.target.value))}
      >
        {Array.from({ length: count }, (_, i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <fieldset className="operation-inspector" disabled={disabled}>
      <b>
        {program.steps.findIndex((x) => x.id === s.id) + 1}. {s.gate}
      </b>
      {d.targets.map((q, i) =>
        select(`Target ${i + 1}`, q, (n) =>
          set({ targets: d.targets.map((v, j) => (j === i ? n : v)) }),
        ),
      )}
      {d.controls?.map((q, i) =>
        select(`Control ${i + 1}`, q, (n) =>
          set({ controls: d.controls!.map((v, j) => (j === i ? n : v)) }),
        ),
      )}
      {s.gate === "MEASURE" &&
        select(
          "Classical bit",
          d.classical ?? d.targets[0],
          (n) => set({ classical: n }),
          program.bits,
        )}
      {(s.gate === "U"
        ? ["theta", "phi", "lambda"]
        : ["RX", "RY", "RZ"].includes(s.gate)
          ? ["theta"]
          : []
      ).map((k) => (
        <label key={k}>
          {k} (rad)
          <input
            aria-label={`${k} angle`}
            type="number"
            step="0.01"
            value={d.params?.[k] ?? 0}
            onChange={(e) =>
              set({ params: { ...d.params, [k]: Number(e.target.value) } })
            }
          />
        </label>
      ))}
      <button
        onClick={() => {
          onChange(d);
          setDraft(null);
        }}
      >
        Apply gate
      </button>
      <button
        onClick={() => onMove(-1)}
        disabled={disabled || program.steps[0].id === s.id}
      >
        ← Earlier
      </button>
      <button
        onClick={() => onMove(1)}
        disabled={
          disabled || program.steps[program.steps.length - 1].id === s.id
        }
      >
        Later →
      </button>
      <button className="danger-text" onClick={onDelete}>
        Remove
      </button>
    </fieldset>
  );
}
