import React from "react";
import { GateType, GATE_CATALOG } from "../types";

interface PaletteProps {
  selectedGate: GateType | null;
  onSelectGate: (gate: GateType) => void;
  paramAngle: number;
  onParamAngleChange: (angle: number) => void;
}

/** Color scheme based on gate category */
function getCategoryColor(category: string): string {
  switch (category) {
    case "Superposition":
      return "border-sky-500/50 hover:border-sky-400";
    case "Clifford":
      return "border-violet-500/50 hover:border-violet-400";
    case "Phase":
      return "border-emerald-500/50 hover:border-emerald-400";
    case "Parametric":
      return "border-orange-500/50 hover:border-orange-400";
    case "Entanglement":
      return "border-rose-500/50 hover:border-rose-400";
    case "Multi-Qubit":
      return "border-pink-500/50 hover:border-pink-400";
    case "Operations":
      return "border-neutral-500/50 hover:border-neutral-400";
    default:
      return "border-ibm-gray hover:border-neutral-400";
  }
}

export const Palette: React.FC<PaletteProps> = ({
  selectedGate,
  onSelectGate,
  paramAngle,
  onParamAngleChange,
}) => {
  const isParametricSelected =
    selectedGate === "RX" || selectedGate === "RY" || selectedGate === "RZ";

  return (
    <div className="gate-palette p-4 flex flex-col space-y-4">
      <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
        Gate library
      </h2>

      <div className="grid grid-cols-2 gap-1.5">
        {GATE_CATALOG.map((g) => {
          const isSelected = selectedGate === g.type;
          const catColor = getCategoryColor(g.category);

          return (
            <button
              key={g.type}
              aria-pressed={isSelected}
              onClick={() => onSelectGate(g.type)}
              className={`flex flex-col items-center justify-center py-2.5 px-1 rounded border text-center transition-all duration-100 ${
                isSelected
                  ? "bg-ibm-blue/20 text-white border-ibm-blue ring-1 ring-ibm-blue/60"
                  : `bg-ibm-gray/20 text-neutral-300 ${catColor}`
              }`}
              title={`${g.description} (${g.category})`}
            >
              <span className="text-sm font-bold font-mono leading-none">
                {g.label}
              </span>
              <span className="text-[9px] text-neutral-400 mt-1 leading-tight">
                {g.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Parametric angle slider */}
      {isParametricSelected && (
        <div className="pt-2 border-t border-ibm-gray space-y-2">
          <label className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
            Rotation Angle (θ)
          </label>
          <input
            type="range"
            min={0}
            max={Math.PI * 2}
            step={0.01}
            value={paramAngle}
            onChange={(e) => onParamAngleChange(parseFloat(e.target.value))}
            className="w-full accent-ibm-blue"
          />
          <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
            <span>0</span>
            <span className="text-white font-semibold">
              {paramAngle.toFixed(2)} rad
            </span>
            <span>2π</span>
          </div>
        </div>
      )}

      {/* Selected gate info */}
      {selectedGate && (
        <div className="pt-2 border-t border-ibm-gray text-[10px] text-neutral-500">
          <p>
            Click a cell on the circuit grid to place{" "}
            <span className="text-white font-bold">{selectedGate}</span>.
          </p>
          {GATE_CATALOG.find((g) => g.type === selectedGate)?.isMultiQubit && (
            <p className="mt-1 text-amber-400/80">
              Multi-qubit gate: click the target qubit first, then the
              control(s) will be auto-assigned.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
