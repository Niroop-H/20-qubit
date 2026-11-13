import { ExecutionRequestSchema } from "../types/circuit";
import { simulate } from "./simulate";
export function simulateRequest(body: unknown) {
  const parsed = ExecutionRequestSchema.safeParse(body);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    );
  const { qubits, bits, steps, shots, seed, noiseModel } = parsed.data;
  return simulate(
    { qubits, bits: bits ?? qubits, steps },
    shots,
    seed,
    noiseModel,
  );
}
