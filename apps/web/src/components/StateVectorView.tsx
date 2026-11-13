import React from "react";
import { SimulationResult } from "../types";

interface StateVectorViewProps {
  stateVector: SimulationResult["stateVector"];
}

export const StateVectorView: React.FC<StateVectorViewProps> = ({
  stateVector
}) => {
  if (!stateVector || stateVector.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-600 text-xs">
        No state vector data
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      <table className="w-full text-left text-[11px] font-mono">
        <thead>
          <tr className="border-b border-ibm-gray text-neutral-500 uppercase text-[9px] tracking-wider">
            <th className="pb-2 pr-3">Basis</th>
            <th className="pb-2 pr-3">Amplitude</th>
            <th className="pb-2 pr-3">|c|²</th>
            <th className="pb-2">Phase</th>
          </tr>
        </thead>
        <tbody>
          {stateVector.map((sv) => {
            const prob = sv.magnitude * sv.magnitude;
            // Phase bar width as percentage of π
            const phasePercent = Math.abs(sv.phase) / Math.PI;

            return (
              <tr
                key={sv.state}
                className="border-b border-neutral-800/50 hover:bg-neutral-800/30"
              >
                <td className="py-1.5 pr-3 text-ibm-cyan font-bold whitespace-nowrap">
                  {sv.state}
                </td>
                <td className="py-1.5 pr-3 text-neutral-300 whitespace-nowrap">
                  {sv.real >= 0 ? "+" : ""}
                  {sv.real.toFixed(4)}
                  {sv.imag >= 0 ? " + " : " − "}
                  {Math.abs(sv.imag).toFixed(4)}i
                </td>
                <td className="py-1.5 pr-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-16 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-ibm-blue rounded-full transition-all"
                        style={{ width: `${prob * 100}%` }}
                      />
                    </div>
                    <span className="text-white text-[10px]">
                      {(prob * 100).toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="py-1.5 text-neutral-400 whitespace-nowrap">
                  {sv.phase.toFixed(3)} rad
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
