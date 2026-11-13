import React from "react";
import { SimulationResult } from "../types";
import { HistogramView } from "./HistogramView";
import { StateVectorView } from "./StateVectorView";
import { Activity, Zap, CheckCircle2, BarChart3, Braces } from "lucide-react";

interface ExecutionPanelProps {
  result: SimulationResult | null;
  shots: number;
  isRunning: boolean;
}

export const ExecutionPanel: React.FC<ExecutionPanelProps> = ({
  result,
  shots,
  isRunning,
}) => {
  const [activeTab, setActiveTab] = React.useState<"histogram" | "statevector">(
    "histogram",
  );

  if (isRunning) {
    return (
      <div className="result-panel results-loading" role="status">
        <div className="w-8 h-8 border-2 border-ibm-blue border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">
          Simulating quantum circuit…
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="result-panel results-empty">
        <div className="empty-spectrum" aria-hidden="true">
          {[12, 23, 42, 64, 48, 31, 18, 9].map((height, i) => (
            <i key={i} style={{ height }} />
          ))}
        </div>
        <div className="empty-copy">
          <h3>Your next discovery starts here.</h3>
          <p>
            Build a circuit or load a Bell state, then select{" "}
            <span className="text-ibm-blue">Run circuit</span> to explore
            measurement probabilities and state amplitudes.
          </p>
          <small>NO MEASUREMENT DATA YET</small>
        </div>
      </div>
    );
  }

  return (
    <div className="result-panel h-80 flex flex-col">
      {/* Telemetry status bar */}
      <div className="result-telemetry flex items-center justify-between px-5 py-1.5 bg-ibm-darker border-b border-ibm-gray text-[10px]">
        <div className="flex items-center space-x-4">
          <span className="flex items-center text-emerald-400 space-x-1 font-semibold">
            <CheckCircle2 className="w-3 h-3" />
            <span>Execution Complete</span>
          </span>
          <span className="text-neutral-500">
            Backend:{" "}
            <span className="text-neutral-300">
              {result.backendInfo.qpuSimulated}
            </span>
          </span>
          <span className="text-neutral-500">
            Shots:{" "}
            <span className="text-neutral-300">
              {result.backendInfo.shots.toLocaleString()}
            </span>
          </span>
        </div>
        <div className="flex items-center space-x-4 text-neutral-500">
          <span className="flex items-center space-x-1">
            <Zap className="w-3 h-3 text-yellow-500" />
            <span>{result.executionTimeMs.toFixed(2)} ms</span>
          </span>
          <span>
            Counts:{" "}
            <span className="text-neutral-300">
              {Object.values(result.counts)
                .reduce((a, b) => a + b, 0)
                .toLocaleString()}
            </span>
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="flex border-b border-ibm-gray px-4"
        role="tablist"
        aria-label="Result view"
      >
        <button
          role="tab"
          id="histogram-tab"
          aria-selected={activeTab === "histogram"}
          aria-controls="result-content"
          onClick={() => setActiveTab("histogram")}
          className={`flex items-center space-x-1.5 px-4 py-2 text-[10px] uppercase tracking-wider font-semibold border-b-2 transition ${
            activeTab === "histogram"
              ? "border-ibm-blue text-white"
              : "border-transparent text-neutral-500 hover:text-neutral-300"
          }`}
        >
          <BarChart3 className="w-3 h-3" />
          <span>Histogram</span>
        </button>
        <button
          role="tab"
          id="statevector-tab"
          aria-selected={activeTab === "statevector"}
          aria-controls="result-content"
          onClick={() => setActiveTab("statevector")}
          className={`flex items-center space-x-1.5 px-4 py-2 text-[10px] uppercase tracking-wider font-semibold border-b-2 transition ${
            activeTab === "statevector"
              ? "border-ibm-blue text-white"
              : "border-transparent text-neutral-500 hover:text-neutral-300"
          }`}
        >
          <Braces className="w-3 h-3" />
          <span>State Vector</span>
        </button>
      </div>

      <p className="result-state-label">
        {result.stateLabel} · seed {result.seed}
      </p>
      {/* Tab content */}
      <div
        id="result-content"
        role="tabpanel"
        aria-labelledby={`${activeTab}-tab`}
        className="flex-1 p-4 overflow-hidden"
      >
        {activeTab === "histogram" ? (
          <HistogramView
            probabilities={result.probabilities}
            idealProbabilities={result.idealProbabilities}
            counts={result.counts}
            shots={shots}
          />
        ) : (
          <StateVectorView stateVector={result.stateVector} />
        )}
      </div>
    </div>
  );
};
