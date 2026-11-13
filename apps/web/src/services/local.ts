import type { Program } from "../../../engine/src/studio/model";
import type { StudioResult } from "../../../engine/src/studio/simulate";
import type { NoiseSettings } from "../types";
export function startLocalJob(
  program: Program,
  shots: number,
  seed: number,
  noise: NoiseSettings,
  progress: (p: number) => void,
) {
  const worker = new Worker(new URL("./simulator.worker.ts", import.meta.url), {
    type: "module",
  });
  let rejectJob: (reason: Error) => void;
  const promise = new Promise<StudioResult>((resolve, reject) => {
    rejectJob = reject;
    worker.onmessage = (e) => {
      if (e.data.error) {
        worker.terminate();
        reject(new Error(e.data.error));
      } else if (e.data.result) {
        worker.terminate();
        resolve(e.data.result);
      } else progress(e.data.progress);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(
        new Error(
          "The local simulator could not start. Reload the page and try again.",
        ),
      );
    };
    worker.postMessage({ program, shots, seed, noise });
  });
  return {
    promise,
    cancel: () => {
      worker.terminate();
      rejectJob(new Error("Simulation cancelled."));
    },
  };
}
