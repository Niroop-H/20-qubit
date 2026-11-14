/** Privacy-preserving, process-local network credit limiter for authenticated APIs.
 * Keeps only HMAC digests of client network addresses in volatile memory.
 * This is NOT a distributed or persistent quota: multi-instance deployments need
 * a shared short-lived counter backend before quotas are marketed as guaranteed.
 */
import {createHmac} from "node:crypto";
import {isIP} from "node:net";

export const COMPUTE_CREDITS=20;
export const COMPUTE_COOLDOWN_MS=5*60*60*1000;
export interface QuotaResult{ok:boolean;remaining:number;retryAfterSeconds:number;resetAt:number}
interface Bucket{remaining:number;cooldownUntil:number;lastSeen:number}
export class NetworkComputeQuota{
 private entries=new Map<string,Bucket>();
 constructor(private readonly secret:string,private readonly now:()=>number=Date.now){
  if(secret.length<32)throw Error("Quota signing secret must be at least 32 characters.");
 }
 get activeBuckets(){return this.entries.size;}
 private digest(rawAddress:string){
  const address=isIP(rawAddress)?rawAddress:"unknown";
  return createHmac("sha256",this.secret).update("mah-quantum-network-v1:"+address).digest("hex");
 }
 inspect(rawAddress:string):QuotaResult{
  const bucket=this.entries.get(this.digest(rawAddress)),now=this.now();
  if(!bucket||(bucket.cooldownUntil>0&&now>=bucket.cooldownUntil))
   return{ok:true,remaining:COMPUTE_CREDITS,resetAt:0,retryAfterSeconds:0};
  return{ok:bucket.cooldownUntil===0,remaining:bucket.remaining,
   resetAt:bucket.cooldownUntil,
   retryAfterSeconds:bucket.cooldownUntil>now?Math.ceil((bucket.cooldownUntil-now)/1000):0};
 }
 consume(rawAddress:string,credits=1):QuotaResult{
  if(!Number.isInteger(credits)||credits<1||credits>COMPUTE_CREDITS)
   throw Error("Execution credits must be a positive integer within the plan.");
  // Vercel rewrites its trusted X-Forwarded-For; ignore user supplied headers elsewhere.
  // A missing/malformed address shares the same conservative 'unknown' bucket.
  const digest=this.digest(rawAddress);
  const now=this.now();
  // Discard expired counters and bound memory growth; never persist identifiers.
  if(this.entries.size>=4096){
   for(const [key,bucket] of this.entries)
    if(bucket.cooldownUntil>0&&bucket.cooldownUntil<=now) this.entries.delete(key);
   if(this.entries.size>=4096&&!this.entries.has(digest))
    return {ok:false,remaining:0,retryAfterSeconds:300,resetAt:now+300000};
  }
  let bucket=this.entries.get(digest);
  if(!bucket||(bucket.cooldownUntil>0&&now>=bucket.cooldownUntil)){
   bucket={remaining:COMPUTE_CREDITS,cooldownUntil:0,lastSeen:now};
   this.entries.set(digest,bucket);
  }
  bucket.lastSeen=now;
  if(bucket.cooldownUntil>now){
   return {ok:false,remaining:0,resetAt:bucket.cooldownUntil,
    retryAfterSeconds:Math.max(1,Math.ceil((bucket.cooldownUntil-now)/1000))};
  }
  if(bucket.remaining<credits)
   return {ok:false,remaining:bucket.remaining,resetAt:0,retryAfterSeconds:0};
  bucket.remaining-=credits;
  if(bucket.remaining===0)bucket.cooldownUntil=now+COMPUTE_COOLDOWN_MS;
  return {ok:true,remaining:bucket.remaining,resetAt:bucket.cooldownUntil,retryAfterSeconds:0};
 }
}
