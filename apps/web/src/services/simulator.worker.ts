import { simulate } from "../../../engine/src/studio/simulate";
self.onmessage = (event) => {
  const { program, shots, seed, noise } = event.data;
  try {
    const result = simulate(program, shots, seed, noise, (progress) =>
      self.postMessage({ progress }),
    );
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Simulation failed.",
    });
  }
};
