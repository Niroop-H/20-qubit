import express from "express";
import cors from "cors";
import { simulateRequest } from "./studio/request";
const app = express(),
  port = process.env.PORT || 4000;
app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.get("/health", (_req, res) =>
  res.json({
    status: "healthy",
    engine: "MAH Quantum Studio engine v2",
    maxQubits: 8,
  }),
);
app.post("/api/circuit/simulate", (req, res) => {
  try {
    res.json(simulateRequest(req.body));
  } catch (e) {
    res
      .status(400)
      .json({
        error: "Invalid simulation request",
        message: e instanceof Error ? e.message : "Simulation failed.",
      });
  }
});
app.listen(port, () =>
  console.log(
    `MAH Quantum compatibility API on ${port}. The studio executes locally in the browser.`,
  ),
);
