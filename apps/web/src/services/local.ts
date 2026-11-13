import type { Program } from "../../../engine/src/studio/model";
import type { StudioResult } from "../../../engine/src/studio/simulate";
import type { NoiseSettings } from "../types";

/** Hard stop for a local computation. This is a work budget, not an SLA. */
export const STUDIO_JOB_TIMEOUT_MS = 120_000;

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
  let settled = false;
  let timer: ReturnType<typeof setTimeout>;
  let resolveJob!: (value: StudioResult) => void;
  let rejectJob!: (reason: Error) => void;
  const finish = (error?: Error, result?: StudioResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    worker.terminate();
    if (error) rejectJob(error);
    else if (result) resolveJob(result);
    else rejectJob(new Error("Simulation ended without a result."));
  };
  const promise = new Promise<StudioResult>((resolve, reject) => {
    resolveJob = resolve;
    rejectJob = reject;
    worker.onmessage = (event) => {
      if (settled) return;
      const message = event.data;
      if (message?.error) {
        finish(new Error(String(message.error)));
      } else if (message?.result) {
        finish(undefined, message.result as StudioResult);
      } else if (Number.isFinite(message?.progress)) {
        progress(Math.max(0, Math.min(100, message.progress)));
      }
    };
    worker.onerror = () =>
      finish(new Error("The simulator encountered a worker error. Reload and retry."));
    worker.onmessageerror = () =>
      finish(new Error("The simulator returned an unreadable response."));
    timer = setTimeout(() =>
      finish(new Error("The computation exceeded the 120-second local execution limit. Simplify the circuit or reduce the number of shots.")),
      STUDIO_JOB_TIMEOUT_MS,
    );
    try { worker.postMessage({ program, shots, seed, noise }); }
    catch { finish(new Error("The circuit could not be transferred to the simulation worker.")); }
  });
  return {
    promise,
    cancel: () => finish(new Error("Simulation cancelled.")),
  };
}
