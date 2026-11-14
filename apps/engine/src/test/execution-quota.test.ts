import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {COMPUTE_CREDITS,COMPUTE_COOLDOWN_MS,NetworkComputeQuota} from "../studio/execution-quota";
describe("Privacy-preserving five-hour network API execution budget",()=>{
 it("runs 20 requests, denies the next one, and restores all credits after exactly five hours",()=>{
  let now=1700000000000;
  const quota=new NetworkComputeQuota("example-strong-quota-key-0123456789abcd",()=>now);
  for(let i=0;i<COMPUTE_CREDITS;i++){
   const r=quota.consume("198.51.100.47");
   assert.equal(r.ok,true);
   assert.equal(r.remaining,COMPUTE_CREDITS-i-1);
  }
  const denied=quota.consume("198.51.100.47");
  assert.equal(denied.ok,false);
  assert.equal(denied.retryAfterSeconds,5*3600);
  assert.equal(denied.resetAt,now+COMPUTE_COOLDOWN_MS);
  now+=COMPUTE_COOLDOWN_MS-1;
  assert.equal(quota.consume("198.51.100.47").ok,false);
  now+=1;
  const again=quota.consume("198.51.100.47");
  assert.equal(again.ok,true);assert.equal(again.remaining,COMPUTE_CREDITS-1);
 });
 it("charges batch costs atomically, independently limits other networks",()=>{
  const quota=new NetworkComputeQuota("example-strong-quota-key-0123456789abcd",()=>1000);
  assert.equal(quota.consume("203.0.113.1",18).remaining,2);
  const rejected=quota.consume("203.0.113.1",3);
  assert.equal(rejected.ok,false);assert.equal(rejected.remaining,2);
  assert.equal(rejected.retryAfterSeconds,0);
  assert.equal(quota.consume("203.0.113.1",2).remaining,0);
  assert.equal(quota.consume("203.0.113.2").remaining,19);
  assert.equal(quota.activeBuckets,2);
 });
 it("treats malformed/unknown addresses conservatively; does not store raw addresses",()=>{
  const quota=new NetworkComputeQuota("example-strong-quota-key-0123456789abcd",()=>1000);
  assert.equal(quota.consume("spoofed").remaining,19);
  assert.equal(quota.consume("also-spoofed").remaining,18);
  assert.equal(quota.consume("198.51.100.1").remaining,19);
  assert.equal(quota.activeBuckets,2);
  assert.equal(JSON.stringify(quota).includes("198.51.100.1"),false);
  assert.throws(()=>quota.consume("198.51.100.1",0));
  assert.throws(()=>new NetworkComputeQuota("short"));
 });
});
