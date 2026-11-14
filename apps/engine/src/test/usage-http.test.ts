import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {serveBrowserUsage} from "../studio/usage-http";
const check=(method:string,secret:string,ip:string,origin="https://quantum.example",host="quantum.example")=>{
 let status=0,value:any;const headers:Record<string,string>={};
 const res={setHeader(k:string,v:string){headers[k]=v;return this;},
 status(c:number){status=c;return this;},json(v:unknown){value=v;return this;}};
 serveBrowserUsage({method,headers:{host,origin},socket:{remoteAddress:ip}},res,secret);
 return{status,value,headers};
};
describe("Same-origin network-backed workspace allowances",()=>{
 it("permits twenty same-network jobs, then 429; GET inspection never spends",()=>{
  const secret="workspace-server-quota-secret-0123456789abcdef";
  const ip="192.0.2.61";
  assert.equal(check("GET",secret,ip).value.remaining,20);
  for(let i=0;i<20;i++){
   const r=check("POST",secret,ip);
   assert.equal(r.status,200);
   assert.equal(r.value.remaining,19-i);
  }
  assert.equal(check("GET",secret,ip).status,429);
  const denied=check("POST",secret,ip);
  assert.equal(denied.status,429);
  assert.equal(denied.value.error,"execution_quota_exhausted");
  assert.ok(Number(denied.headers["Retry-After"])>0);
  assert.equal(check("POST",secret,"192.0.2.62").status,200);
 });
 it("rejects cross-origin consumption and missing server secret",()=>{
  const secret="workspace-cors-quota-secret-0123456789abcdef";
  assert.equal(check("POST",secret,"192.0.2.71","https://evil.example").status,403);
  assert.equal(check("POST",secret,"192.0.2.71","https://quantum.example").value.remaining,19);
  assert.equal(check("POST","","192.0.2.71").status,503);
  assert.equal(check("DELETE",secret,"192.0.2.71").status,405);
 });
});
