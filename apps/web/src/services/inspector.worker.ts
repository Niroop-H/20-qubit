import type { Program } from "../../../engine/src/studio/model";
import type { QuantumCircuit } from "../../../engine/src/simulator/QuantumCircuit";
import { idealState, blochVectors, expectation, summarizeState } from "../../../engine/src/studio/simulate";

let state: QuantumCircuit | null = null;
self.onmessage = (event: MessageEvent) => {
  const data = event.data as {
    kind: "initialize" | "expectation";
    program?: Program;
    through?: number;
    pauli?: string;
  };
  try {
    if (data.kind === "initialize") {
      if (!data.program) throw new Error("Missing circuit.");
      const through = data.through ?? data.program.steps.length;
      state = idealState(data.program, through);
      const summary = summarizeState(state);
      self.postMessage({
        kind: "snapshot",
        vectors: blochVectors(state),
        amplitudes: summary.stateVector,
        info: summary.stateVectorInfo,
      });
    }
    if (state && data.pauli !== undefined) {
      let value: string;
      try { value = expectation(state, data.pauli).toFixed(6); }
      catch (err) { value = (err as Error).message; }
      self.postMessage({ kind: "expectation", value });
    }
  } catch (err) {
    self.postMessage({ kind: "error", error: (err as Error).message });
  }
};
