/** Optional network-backed browser allowance route (same-origin only).
 * Uses a keyed digest of a trusted edge/client network IP in volatile memory.
 * Never stores a raw IP, device fingerprint, or browser identifier.
 */
import {isIP} from "node:net";
import {NetworkComputeQuota,COMPUTE_CREDITS} from "./execution-quota";

type Request={method?:string;headers?:Record<string,string|string[]|undefined>;
 socket?:{remoteAddress?:string}};
type Response={setHeader(name:string,value:string):unknown;
 status(code:number):Response;json(value:unknown):unknown};
let store:NetworkComputeQuota|null=null,storeSecret:string|null=null;
function networkFrom(req:Request){
 if(process.env.VERCEL==="1"){
  const value=req.headers?.["x-forwarded-for"];
  const first=typeof value==="string"?value.split(",")[0].trim():"";
  return isIP(first)?first:"unknown";
 }
 const socket=req.socket?.remoteAddress?.replace(/^::ffff:/,"")||"";
 return isIP(socket)?socket:"unknown";
}
export function serveBrowserUsage(req:Request,res:Response,
 secret=process.env.MAH_QUANTUM_QUOTA_SECRET||process.env.MAH_QUANTUM_INDUSTRY_API_KEY){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 res.setHeader("Allow","GET, POST");
 const write=(code:number,body:unknown)=>res.status(code).json(body);
 if(req.method!=="GET"&&req.method!=="POST")
  return write(405,{error:"method_not_allowed"});
 if(!secret||secret.length<32)
  return write(503,{error:"quota_service_not_configured",
   message:"Configure MAH_QUANTUM_QUOTA_SECRET on the server."});
 // A browser POST must be same-origin. API service authentication is separate.
 if(req.method==="POST"){
  const origin=req.headers?.origin,host=req.headers?.host;
  let sameOrigin=false;
  if(typeof origin==="string"&&typeof host==="string")
   try{const url=new URL(origin);sameOrigin=url.host===host&&
    (url.protocol==="https:"||url.hostname==="localhost"||url.hostname==="127.0.0.1");}
   catch{/* Reject malformed origin. */}
  if(!sameOrigin)return write(403,{error:"same_origin_required"});
 }
 if(!store||storeSecret!==secret){
  store=new NetworkComputeQuota(secret);storeSecret=secret;
 }
 const quota=req.method==="POST"?store.consume(networkFrom(req)):store.inspect(networkFrom(req));
 res.setHeader("X-Compute-Limit",String(COMPUTE_CREDITS));
 res.setHeader("X-Compute-Remaining",String(quota.remaining));
 if(!quota.ok&&quota.retryAfterSeconds)
  res.setHeader("Retry-After",String(quota.retryAfterSeconds));
 return write(quota.ok?200:429,{
  schema:"MAH-Quantum-Workspace-Credits/v1",
  allowed:quota.ok,limit:COMPUTE_CREDITS,remaining:quota.remaining,
  retryAt:quota.resetAt,source:"network-compute-budget",
  ...(quota.ok?{}:{error:"execution_quota_exhausted"})
 });
}
