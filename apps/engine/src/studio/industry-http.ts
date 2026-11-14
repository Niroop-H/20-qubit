/**
 * Fail-closed server-only HTTP adapter. Testable without Vercel or secrets.
 * The old public compatibility endpoint is intentionally not used here.
 */
import {createHash,timingSafeEqual} from "node:crypto";
import {
 IndustryInputError,INDUSTRY_MAX_REQUEST_BYTES,inspectIndustryCapability,
 prepareIndustryJob,executePreparedIndustryJob,executeIndustryBatch
} from "./enterprise";

export interface IndustryHttpRequest{
 method?:string;
 headers?:Record<string,string|string[]|undefined>;
 body?:unknown;
}
export interface IndustryHttpResponse{
 setHeader(name:string,value:string):unknown;
 status(status:number):IndustryHttpResponse;
 json(value:unknown):unknown;
}
function bearerValid(raw:unknown,secret:string):boolean{
 if(typeof raw!=="string"||!raw.startsWith("Bearer ")||raw.length>1200)return false;
 const candidate=raw.slice(7);
 if(candidate.length<1||candidate.length>1024)return false;
 const hash=(s:string)=>createHash("sha256").update(s,"utf8").digest();
 return timingSafeEqual(hash(candidate),hash(secret));
}
const write=(res:IndustryHttpResponse,status:number,value:unknown)=>res.status(status).json(value);
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
  const result=action==="batch"?executeIndustryBatch(body):
   executePreparedIndustryJob(prepareIndustryJob(body));
  return write(res,200,result);
 }catch(error){
  if(error instanceof IndustryInputError)
   return write(res,error.status,{error:"invalid_industry_request",message:error.message});
  return write(res,422,{
   error:"unsupported_or_unavailable_workload",
   message:error instanceof Error?error.message.slice(0,400):"The requested workload is unavailable."
  });
 }
}
