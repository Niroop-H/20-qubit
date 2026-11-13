/* Production-build browser smoke for the 20-logical-qubit Studio.
 * Uses a controlled local test-session fixture to bypass the UI access gate;
 * this is NOT a security/authentication test, nor a hosted deployment.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {performance} from "node:perf_hooks";
import {mkdirSync,writeFileSync} from "node:fs";
import {chromium} from "playwright";
const base="http://127.0.0.1:4173", evidence=[],started=performance.now();
let server,browser;
const test=async(name,action)=>{
 const t=performance.now();
 try{const facts=await action();const entry={name,status:"PASS",durationMs:+(performance.now()-t).toFixed(2),...(facts||{})};evidence.push(entry);console.log("BROWSER_GATE "+JSON.stringify(entry));}
 catch(e){const entry={name,status:"FAIL",durationMs:+(performance.now()-t).toFixed(2),error:String(e.stack||e)};evidence.push(entry);console.error("BROWSER_GATE "+JSON.stringify(entry));}
};
async function ready(){
 for(let i=0;i<100;i++){
  if(server.exitCode!==null)throw new Error("Local preview exited");
  try{const r=await fetch(base+"/studio");if(r.ok)return;}catch{}
  await new Promise(r=>setTimeout(r,300));
 }
 throw new Error("Local preview server did not respond");
}
async function main(){
 server=spawn("npm",["run","preview","--workspace=apps/web","--","--host","127.0.0.1","--port","4173","--strictPort"],{stdio:"ignore"});
 await ready();
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const pageErrors=[];page.on("pageerror",e=>pageErrors.push(String(e)));
 // Controlled fixture: does not exercise the access-code system or prove security.
 await page.addInitScript(()=>{
  localStorage.setItem("mah-workspace-access-v1",JSON.stringify({
   version:1,active:"c0",codes:{"c0":{usedMs:0,cooldownUntil:0}},
   owner:null,heartbeat:0
  }));
 });
 await test("Studio renders 20-qubit selector in a real Chromium tab",async()=>{
  const response=await page.goto(base+"/studio",{waitUntil:"domcontentloaded"});
  assert.equal(response?.status(),200);
  await page.getByRole("combobox",{name:"Qubit count"}).waitFor({timeout:30000});
  const select=page.getByRole("combobox",{name:"Qubit count"});
  const options=await select.locator("option").allTextContents();
  assert.equal(options.length,20);
  await select.selectOption("20");
  assert.equal(await select.inputValue(),"20");
  return{qubitOptions:options.length,selected:20};
 });
 await test("20-qubit circuit runs in browser Web Worker",async()=>{
  await page.getByRole("button",{name:"Run circuit"}).click();
  await page.locator(".lab-notice").filter({hasText:"Completed locally"}).waitFor({timeout:60000});
  await page.getByText("Execution Complete").waitFor({timeout:10000});
  const text=await page.locator(".result-telemetry").innerText();
  assert.ok(text.includes("Local exact statevector simulator"));
  return{executionComplete:true,backend:"Local exact statevector simulator"};
 });
 await test("20-qubit Inspector calculates amplitudes in worker",async()=>{
  await page.getByRole("tab",{name:"Inspector"}).click();
  await page.getByText(/Displaying \d+ strongest amplitudes/).waitFor({timeout:60000});
  const data=await page.locator(".amplitude-grid").innerText();
  assert.ok(data.includes("⟩"));
  return{inspectorHasAmplitudes:true};
 });
 await test("QASM code editor declares 20-qubit capability",async()=>{
  await page.getByRole("tab",{name:"Code"}).click();
  await page.getByText(/1–20 logical qubits/).waitFor({timeout:10000});
  return{capabilityLabel:"1–20 logical qubits"};
 });
 await test("20-bit long-range Bell QASM compiles and executes in browser",async()=>{
  const source='OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[20];\ncreg c[20];\nh q[0];\ncx q[0],q[19];\n';
  await page.getByRole("textbox",{name:"Quantum code editor"}).fill(source);
  await page.getByRole("button",{name:"Compile & run"}).click();
  await page.locator(".lab-notice").filter({hasText:"Completed locally"}).waitFor({timeout:60000});
  await page.getByText("Execution Complete").waitFor({timeout:10000});
  assert.equal(await page.getByRole("combobox",{name:"Qubit count"}).inputValue(),"20");
  return{qubits:20,entanglement:"q0->q19",completed:true};
 });
 await test("8192-shot 20-bit simulation completes in browser",async()=>{
  await page.getByRole("combobox",{name:"Shot count"}).selectOption("8192");
  await page.getByRole("button",{name:"Run circuit"}).click();
  await page.locator(".lab-notice").filter({hasText:"8,192 shots"}).waitFor({timeout:60000});
  const text=await page.locator(".result-telemetry").innerText();
  assert.ok(text.includes("8,192"));
  return{shots:8192,completed:true};
 });
 await test("No uncaught browser page exceptions",async()=>{
  assert.deepEqual(pageErrors,[]);
  return{uncaughtExceptions:pageErrors.length};
 });
}
try{await main();}
catch(e){evidence.push({name:"Harness initialization",status:"FAIL",error:String(e.stack||e)});console.error("BROWSER_GATE_FATAL "+String(e.stack||e));}
finally{
 try{await browser?.close();}catch{}
 try{server?.kill("SIGTERM");}catch{}
 const fails=evidence.filter(x=>x.status==="FAIL");
 const result={schema:"MQ-DSQ-BROWSER-RELEASE/v1",dateUtc:new Date().toISOString(),
  sha:process.env.GITHUB_SHA||"local",
  environment:"GitHub Actions Chromium, locally hosted production build; no cloud deployment",
  scope:"20-qubit Studio interface and worker smoke; access control not evaluated",
  durationMs:+(performance.now()-started).toFixed(2),
  counts:{total:evidence.length,passed:evidence.length-fails.length,failed:fails.length},cases:evidence};
 mkdirSync("artifacts",{recursive:true});
 writeFileSync("artifacts/browser-release-gate.json",JSON.stringify(result,null,2)+"\n");
 console.log("BROWSER_GATE_SUMMARY "+JSON.stringify(result.counts));
 if(fails.length)process.exitCode=1;
}
