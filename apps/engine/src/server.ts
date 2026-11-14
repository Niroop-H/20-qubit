import express from "express";
import type {ErrorRequestHandler} from "express";
import {serveIndustryHttp} from "./studio/industry-http";
import {serveBrowserUsage} from "./studio/usage-http";

const app=express(),port=process.env.PORT||4000;
// Deliberately no browser CORS; enterprise Bearer credentials remain server-side.
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
// Process-local throttle. Deployments must additionally enforce shared
// edge rate limits and concurrency caps; untrusted X-Forwarded-For is ignored.
const limits=new Map<string,{start:number;count:number}>();
app.use(["/api/v1","/api/usage"],(req,res,next)=>{
 const now=Date.now(),ip=req.ip||req.socket.remoteAddress||"unknown";
 if(limits.size>4000)for(const [key,value] of limits)if(now-value.start>60000)limits.delete(key);
 const previous=limits.get(ip);
 const v=!previous||now-previous.start>=60000?{start:now,count:0}:previous;
 v.count++;limits.set(ip,v);
 if(v.count>60){
  res.setHeader("Retry-After",String(Math.ceil((60000-(now-v.start))/1000)));
  res.status(429).json({error:"rate_limited",message:"Maximum 60 API requests per client per minute."});
  return;
 }
 next();
});
app.get("/health",(_req,res)=>{
 res.setHeader("Cache-Control","no-store");
 res.json({status:"healthy",engine:"MAH Quantum classical scientific simulator",
  denseStatevectorMaxQubits:20,
  selectedLargeCircuitFamiliesMaxQubits:4096,
  authenticatedRemoteExecuteMaxQubits:2048,
  capabilityUrl:"/api/v1/capabilities",apiAuthenticationRequired:true,
  physicalQuantumProcessor:false,physicalInstrumentControl:false,
  timestamp:new Date().toISOString()});
});
app.get("/api/usage",(req,res)=>{serveBrowserUsage(req,res);});
app.post("/api/usage",(req,res)=>{serveBrowserUsage(req,res);});
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
