import { ExecutionRequestSchema } from "../types/circuit";
import { simulate } from "./simulate";
import { simulateScalable } from "./scalable";
export function simulateRequest(body: unknown) {
  const parsed = ExecutionRequestSchema.safeParse(body);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    );
  const { qubits, bits, steps, shots, seed, noiseModel } = parsed.data;
  const program = { qubits, bits: bits ?? qubits, steps };
  return qubits > 20
    ? simulateScalable(program, shots, seed, noiseModel)
    : simulate(program, shots, seed, noiseModel);
}
