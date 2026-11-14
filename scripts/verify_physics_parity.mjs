/**
 * Cross-runtime physics parity. The browser/TS and optional Python backend
 * intentionally remain independent implementations; fail CI when their
 * numerical contracts drift. This does not certify underlying physical models.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";
import {performance} from "node:perf_hooks";
const require=createRequire(import.meta.url);
const physics=require("../apps/engine/dist/lab/physics.js");
const sensing=require("../apps/engine/dist/lab/sensing.js");
const cryo=require("../apps/engine/dist/lab/cryogenics.js");

const cases=[
 {kind:"transmon",args:{ejGHz:20,ecGHz:.3,ng:0}},
 {kind:"transmon",args:{ejGHz:8.5,ecGHz:.47,ng:.13}},
 {kind:"rabi",args:{omegaMHz:10,detuningMHz:0,durationNs:50,phaseDeg:90,t2us:100}},
 {kind:"rabi",args:{omegaMHz:7.5,detuningMHz:3.2,durationNs:84,phaseDeg:-45,t2us:13}},
 {kind:"rabi",args:{omegaMHz:0,detuningMHz:0,durationNs:0,phaseDeg:0,t2us:100}},
 {kind:"sensing",args:{kind:"magnetic",signal:1.5,timeMS:.7,t2MS:6,contrast:.95,shots:1024,seed:42,analysisPhase:90}},
 {kind:"sensing",args:{kind:"clock",signal:10,timeMS:8,t2MS:150,contrast:.82,shots:2048,seed:17,analysisPhase:0}},
 {kind:"sensing",args:{kind:"gravity",signal:25,timeMS:1.3,t2MS:13,contrast:.74,shots:512,seed:5,analysisPhase:-90}},
 {kind:"cryogenics",args:{lines:24,heatUW:.2,flowUMol:400,valve:50}},
 {kind:"cryogenics",args:{lines:0,heatUW:0,flowUMol:0,valve:0}},
 {kind:"cryogenics",args:{lines:128,heatUW:6.5,flowUMol:750,valve:70}},
 {kind:"environment",args:{vibrationNM:5,frequencyHz:20,damping:.2,rfVM:1,shieldDB:60,magNT:10,magShield:100}},
 {kind:"environment",args:{vibrationNM:150,frequencyHz:2.9,damping:.12,rfVM:30,shieldDB:18,magNT:250,magShield:15}}
];
const python=String.raw`
import json, os, sys
sys.path.insert(0,os.path.join(os.getcwd(),"backend"))
from physics import MODELS
cases=json.load(sys.stdin)
result=[MODELS[case["kind"]](case["args"]) for case in cases]
json.dump(result,sys.stdout,allow_nan=False)
`;
const begin=performance.now();
const process=spawnSync("python3",["-c",python],{input:JSON.stringify(cases),encoding:"utf8",maxBuffer:4*1024*1024,timeout:15000});
if(process.status!==0)throw Error("Python physics parity subprocess failed: "+(process.stderr||process.error||process.status));
const expected=JSON.parse(process.stdout);
const actual=cases.map(({kind,args:a})=>{
 switch(kind){
  case"transmon":return physics.transmon(a.ejGHz,a.ecGHz,a.ng);
  case"rabi":return physics.rabi(a.omegaMHz,a.detuningMHz,a.durationNs,a.phaseDeg,a.t2us);
  case"sensing":return sensing.sensing(a.kind,a.signal,a.timeMS,a.t2MS,a.contrast,a.shots,a.seed,a.analysisPhase);
  case"cryogenics":return cryo.heatBalance({...cryo.defaultCryo,...a});
  case"environment":return physics.environment(a.vibrationNM,a.frequencyHz,a.damping,a.rfVM,a.shieldDB,a.magNT,a.magShield);
  default:throw Error("Unknown model "+kind);
 }
});
const select={
 transmon:["ratio","levels","f01GHz","anharmonicityGHz","matrix"],
 rabi:["idealP1","p1","piNs","angleRad","unitary"],
 sensing:["phase","contrast","p1","quadratureUncertainty"],
 cryogenics:["heatUW","conductionUW","flowMolS","equilibriumK","coolingAt20mKUW"],
 environment:["transfer","residualNM","alignmentUM","phaseRMS","contrast","rfResidualVM","magResidualNT"]
};
function same(x,y,path){
 if(typeof x==="number"&&typeof y==="number"){
  const bound=1e-9*Math.max(1,Math.abs(x),Math.abs(y));
  assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x-y)<=bound,
    "Cross-language physics mismatch at "+path+": "+x+" != "+y);
  return;
 }
 if(Array.isArray(x)&&Array.isArray(y)){
  assert.equal(x.length,y.length,"Physics array length: "+path);
  x.forEach((z,i)=>same(z,y[i],path+"["+i+"]"));return;
 }
 assert.deepEqual(x,y,"Physics mismatch at "+path);
}
assert.equal(actual.length,expected.length);
for(let i=0;i<cases.length;i++)for(const key of select[cases[i].kind]){
 assert.ok(key in actual[i]&&key in expected[i],cases[i].kind+" missing "+key);
 same(actual[i][key],expected[i][key],cases[i].kind+"["+i+"]."+key);
}
console.log("PHYSICS_PARITY_PASS "+JSON.stringify({
 scenarios:cases.length,models:[...new Set(cases.map(x=>x.kind))],
 durationMs:Math.round(performance.now()-begin),
 limitations:"Independent reduced-order ideal models; parity is not physical calibration"
}));
