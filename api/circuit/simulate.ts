import { simulateRequest } from "../../apps/engine/src/studio/request";
/** Optional compatibility endpoint. The studio runs in a local Web Worker. */
export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  try {
    res.status(200).json(simulateRequest(req.body));
  } catch (error) {
    res
      .status(400)
      .json({
        error: "Invalid simulation request",
        message: error instanceof Error ? error.message : "Simulation failed.",
      });
  }
}
