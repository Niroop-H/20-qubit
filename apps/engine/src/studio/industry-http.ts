/**
 * Fail-closed server-only HTTP adapter. Testable without Vercel or secrets.
 * The old public compatibility endpoint is intentionally not used here.
 */
import {createHash,timingSafeEqual} from "node:crypto";
import {isIP} from "node:net";
import {NetworkComputeQuota,COMPUTE_CREDITS} from "./execution-quota";
import {
 IndustryInputError,INDUSTRY_MAX_REQUEST_BYTES,inspectIndustryCapability,
 prepareIndustryJob,prepareIndustryBatch,executePreparedIndustryJob,executePreparedIndustryBatch
} from "./enterprise";

export interface IndustryHttpRequest{
 method?:string;
 headers?:Record<string,string|string[]|undefined>;
 body?:unknown;
 socket?:{remoteAddress?:string};
}
export interface IndustryHttpResponse{
 setHeader(name:string,value:string):unknown;
 status(status:number):IndustryHttpResponse;
 json(value:unknown):unknown;
}
function bearerValid(raw:unknown,secret:string):boolean{
 if(typeof raw!=="string"||raw.length>1200)return false;
 const match=/^Bearer[ \t]+([^\s]+)[ \t]*$/i.exec(raw);
 if(!match)return false;
 const candidate=match[1];
 if(candidate.length<1||candidate.length>1024)return false;
 const hash=(s:string)=>createHash("sha256").update(s,"utf8").digest();
 return timingSafeEqual(hash(candidate),hash(secret));
}
const write=(res:IndustryHttpResponse,status:number,value:unknown)=>res.status(status).json(value);
let quota:NetworkComputeQuota|null=null,quotaSecret:string|null=null;
function clientNetwork(req:IndustryHttpRequest):string{
 // Vercel overwrites X-Forwarded-For on requests arriving through its edge.
 // Do not trust forwarded values on Express/Render, where clients may spoof them.
 if(process.env.VERCEL==="1"){
  const forwarded=req.headers?.["x-forwarded-for"];
  const candidate=typeof forwarded==="string"?forwarded.split(",")[0].trim():"";
  return isIP(candidate)?candidate:"unknown";
 }
 const socket=req.socket?.remoteAddress?.replace(/^::ffff:/,"")??"";
 return isIP(socket)?socket:"unknown";
}
function localQuota(secret:string){
 if(!quota||quotaSecret!==secret){
  quotaSecret=secret;quota=new NetworkComputeQuota(secret);
 }
 return quota;
}
const incoming=(raw:unknown)=>{
 if(typeof raw==="string"){
  if(Buffer.byteLength(raw,"utf8")>INDUSTRY_MAX_REQUEST_BYTES)
   throw new IndustryInputError("Request exceeds 128 KiB.",413);
  try{return JSON.parse(raw);}
  catch{throw new IndustryInputError("Malformed JSON request body.",400);}
 }
 return raw;
};
export function serveIndustryHttp(
 req:IndustryHttpRequest,res:IndustryHttpResponse,action:"execute"|"batch"|"capabilities",
 secret=process.env.MAH_QUANTUM_INDUSTRY_API_KEY
){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 res.setHeader("Vary","Authorization");
 res.setHeader("Allow",action==="capabilities"?"GET":"POST");
 if(action==="capabilities"){
  if(req.method!=="GET")return write(res,405,{error:"method_not_allowed",message:"Use GET."});
  return write(res,200,inspectIndustryCapability());
 }
 if(req.method!=="POST")return write(res,405,{error:"method_not_allowed",message:"Use POST."});
 if(!secret||secret.length<32)return write(res,503,{error:"service_disabled",
  message:"Industrial API is disabled; configure a strong server-only MAH_QUANTUM_INDUSTRY_API_KEY."});
 if(!bearerValid(req.headers?.authorization,secret))
  return write(res,401,{error:"unauthorized",message:"Valid bearer credential required."});
 const contentType=req.headers?.["content-type"];
 if(typeof contentType!=="string"||!/^application\/json(?:\s*;|$)/i.test(contentType))
  return write(res,415,{error:"unsupported_content_type",message:"Use application/json."});
 const declared=req.headers?.["content-length"];
 if(declared!==undefined){
  const num=Number(declared);
  if(!Number.isFinite(num)||num<0)return write(res,400,{error:"bad_content_length"});
  if(num>INDUSTRY_MAX_REQUEST_BYTES)
   return write(res,413,{error:"payload_too_large",message:"Maximum request size is 128 KiB."});
 }
 try{
  const body=incoming(req.body);
  const bytes=Buffer.byteLength(JSON.stringify(body)??"","utf8");
  if(bytes>INDUSTRY_MAX_REQUEST_BYTES)
   throw new IndustryInputError("Request exceeds 128 KiB.",413);
  // Validate each job and its real work budget BEFORE spending compute credits.
  const prepared=action==="batch"?prepareIndustryBatch(body):prepareIndustryJob(body);
  const credits=Array.isArray(prepared)?
   prepared.filter(job=>job.job.operation==="execute").length:
   prepared.job.operation==="execute"?1:0;
  if(credits){
   const allowed=localQuota(secret).consume(clientNetwork(req),credits);
   res.setHeader("X-Compute-Limit",String(COMPUTE_CREDITS));
   res.setHeader("X-Compute-Remaining",String(allowed.remaining));
   if(!allowed.ok){
    if(allowed.retryAfterSeconds)res.setHeader("Retry-After",String(allowed.retryAfterSeconds));
    return write(res,429,{error:"execution_quota_exhausted",
     message:allowed.resetAt?
      "Execution allowance exhausted. Retry after the five-hour cooldown.":
      "Not enough credits for this batch. Submit fewer execution jobs.",
     remaining:allowed.remaining,retryAt:allowed.resetAt?new Date(allowed.resetAt).toISOString():null});
   }
  }
  const result=Array.isArray(prepared)?executePreparedIndustryBatch(prepared):
   executePreparedIndustryJob(prepared);
  return write(res,200,result);
 }catch(error){
  if(error instanceof IndustryInputError)
   return write(res,error.status,{error:"invalid_industry_request",message:error.message});
  return write(res,500,{error:"internal_execution_failure",message:"The operation failed internally; consult server logs."});
 }
}
