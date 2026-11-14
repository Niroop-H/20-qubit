import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {parseQasm} from "../studio/qasm";
import {parseLargeQasm} from "../studio/largeQasm";
import {idealState} from "../studio/simulate";
import {methodFor,simulateScalable} from "../studio/scalable";

const src=(body:string,n=3,v=2)=>
 v===2?`OPENQASM 2.0; include "qelib1.inc"; qreg q[${n}]; creg c[${n}]; ${body}`:
 `OPENQASM 3; include "stdgates.inc"; qubit[${n}] q; bit[${n}] c; ${body}`;
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
const amplitude=(body:string,n:number,k:number)=>{
 const state=idealState(parseQasm(src(body,n)));
 return[state.real[k],state.imag[k]];
};
describe("Shared standard QASM composite gate lowering",()=>{
 it("accepts 11 additional library gates in both dense and large parsers, QASM2/3",()=>{
  const instructions=["cp(pi/3) q[0],q[1]","cu1(pi/3) q[0],q[1]",
   "crz(pi/3) q[0],q[1]","cry(pi/3) q[0],q[1]","crx(pi/3) q[0],q[1]",
   "rzz(pi/3) q[0],q[1]","cy q[0],q[1]","ch q[0],q[1]",
   "cswap q[0],q[1],q[2]","ccz q[0],q[1],q[2]","iswap q[0],q[1]"];
  for(const instruction of instructions)for(const version of [2,3]){
   assert.ok(parseQasm(src(instruction+";",3,version)).steps.length>0);
   assert.ok(parseLargeQasm(src(instruction+";",1000,version)).steps.length>0);
  }
 });
 it("controlled phase has correct complex phase on |11> and none on |10>",()=>{
  const theta=.73;
  for(const g of ["cp","cu1"]){
   let a=amplitude(`x q[0]; x q[1]; ${g}(${theta}) q[0],q[1];`,2,3);
   close(a[0],Math.cos(theta));close(a[1],Math.sin(theta));
   a=amplitude(`x q[0]; ${g}(${theta}) q[0],q[1];`,2,1);
   close(a[0],1);close(a[1],0);
  }
 });
 it("controlled RZ/RY/RX act only for control one",()=>{
  for(const g of ["crz","cry","crx"]){
   const withControl=idealState(parseQasm(src(`x q[0]; ${g}(0.61) q[0],q[1];`,2)));
   const single={crz:"rz",cry:"ry",crx:"rx"}[g];
   const reference=idealState(parseQasm(src(`x q[0]; ${single}(0.61) q[1];`,2)));
   for(let i=0;i<4;i++){close(withControl.real[i],reference.real[i]);close(withControl.imag[i],reference.imag[i]);}
   const off=amplitude(`${g}(0.61) q[0],q[1];`,2,0);
   close(off[0],1);close(off[1],0);
  }
 });
 it("RZZ parity phases and CY/CH controls are exact",()=>{
  const theta=.73;
  for(let x=0;x<4;x++){
   const prep=(x&1?"x q[0];":"")+(x&2?"x q[1];":"");
   const a=amplitude(prep+`rzz(${theta}) q[0],q[1];`,2,x);
   const parity=((x&1)!==0)===((x&2)!==0)?1:-1;
   close(a[0],Math.cos(-parity*theta/2));close(a[1],Math.sin(-parity*theta/2));
  }
  const cy=amplitude("x q[0]; cy q[0],q[1];",2,3);
  close(cy[0],0);close(cy[1],1);
  const ch=idealState(parseQasm(src("x q[0]; ch q[0],q[1];",2)));
  close(ch.real[1],Math.SQRT1_2);close(ch.real[3],Math.SQRT1_2);
 });
 it("CCZ, CSWAP and iSWAP preserve relative phases and permutations",()=>{
  const ccz=amplitude("x q[0]; x q[1]; x q[2]; ccz q[0],q[1],q[2];",3,7);
  close(ccz[0],-1);close(ccz[1],0);
  const cswap=amplitude("x q[0]; x q[1]; cswap q[0],q[1],q[2];",3,5);
  close(cswap[0],1);
  const iswap=amplitude("x q[0]; iswap q[0],q[1];",2,2);
  close(iswap[0],0);close(iswap[1],1);
  const stay=amplitude("x q[0]; x q[1]; iswap q[0],q[1];",2,3);
  close(stay[0],1);close(stay[1],0);
 });
 it("register expansion is bounded after lowering, and large compatible jobs execute",()=>{
  assert.throws(()=>parseQasm(src("cp(.2) q,q;",100)),/256|distinct/i);
  assert.throws(()=>parseLargeQasm(src("cp(.2) q,q;",4096)),/8192|distinct/i);
  const p=parseLargeQasm(src("x q[0]; x q[1]; cp(pi) q[0],q[1];",1000));
  assert.equal(methodFor(p),"partitioned-statevector");
  const r=simulateScalable(p,32,3);
  assert.equal(Object.values(r.counts).reduce((a,b)=>a+b,0),32);
  assert.equal(r.counts["0".repeat(998)+"11"],32);
 });
});
