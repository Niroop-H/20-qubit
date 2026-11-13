import { simulate } from "../../../engine/src/studio/simulate";
import { simulateScalable } from "../../../engine/src/studio/scalable";
self.onmessage = (event) => {
  const { program, shots, seed, noise } = event.data;
  try {
    const result = program.qubits > 20
      ? simulateScalable(program, shots, seed, noise)
      : simulate(program, shots, seed, noise, (progress) => self.postMessage({ progress }));
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Simulation failed.",
    });
  }
};
