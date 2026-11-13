import { CircuitStep, NoiseSettings, SimulationResult } from "../types";

const ENGINE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:4000" : "");

export async function runSimulation(
  qubits: number,
  steps: CircuitStep[],
  shots: number,
  noiseSettings: NoiseSettings
): Promise<SimulationResult> {
  const response = await fetch(`${ENGINE_URL}/api/circuit/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      qubits,
      shots,
      steps,
      noiseModel: noiseSettings
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Simulation failed with status ${response.status}`
    );
  }

  return response.json();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${ENGINE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
