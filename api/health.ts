export default function handler(req: any, res: any) {
  res.status(200).json({
    status: "healthy",
    engine: "Q-Sim Classical Statevector Engine (Vercel Serverless)",
    maxQubits: 16,
    timestamp: new Date().toISOString()
  });
}
