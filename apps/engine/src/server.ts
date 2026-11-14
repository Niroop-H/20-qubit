import express from "express";
import type {ErrorRequestHandler} from "express";
import {serveIndustryHttp} from "./studio/industry-http";

const app=express(),port=process.env.PORT||4000;
app.disable("x-powered-by");
app.use(express.json({limit:"128kb"}));
const handleJsonErrors:ErrorRequestHandler=(error,req,res,next)=>{
 if(error?.type==="entity.parse.failed")
  {res.status(400).json({error:"malformed_json"});return;}
 if(error?.type==="entity.too.large")
  {res.status(413).json({error:"payload_too_large"});return;}
 next(error);
};
app.use(handleJsonErrors);
app.get("/health",(_req,res)=>{
 res.setHeader("Cache-Control","no-store");
 res.json({status:"healthy",engine:"MAH Quantum classical simulator",
  denseStatevectorMaxQubits:20,
  selectedLargeCircuitFamiliesMaxQubits:4096,
  authenticatedRemoteExecuteMaxQubits:2048,
  capabilities:"/api/v1/capabilities",physicalQuantumProcessor:false});
});
app.get("/api/v1/capabilities",(req,res)=>{serveIndustryHttp(req,res,"capabilities");});
app.post("/api/v1/execute",(req,res)=>{serveIndustryHttp(req,res,"execute");});
app.post("/api/v1/batch",(req,res)=>{serveIndustryHttp(req,res,"batch");});
app.post("/api/circuit/simulate",(_req,res)=>{
 res.setHeader("Cache-Control","no-store");
 res.status(410).json({error:"legacy_route_retired",
  message:"Use the authenticated /api/v1/execute API instead."});
});
app.listen(port,()=>{
 console.log("MAH Quantum industry integration API available locally on port "+port+
  "; execution remains disabled until server-only MAH_QUANTUM_INDUSTRY_API_KEY is configured.");
});
