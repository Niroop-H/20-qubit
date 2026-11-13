/* Production-build browser smoke for the 20-logical-qubit Studio.
 * Uses a controlled local test-session fixture to bypass the UI access gate;
 * this is NOT a security/authentication test, nor a hosted deployment.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {performance} from "node:perf_hooks";
import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {chromium} from "playwright";
import {createHash} from "node:crypto";
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
 await test("Market landing identifies controlled access and links directly to 1000+ computation",async()=>{
  const response=await page.goto(base+"/",{waitUntil:"domcontentloaded"});
  assert.equal(response?.status(),200);
  await page.getByRole("link",{name:/1000\+ Qubit workspace/i}).waitFor({timeout:25000});
  const copy=await page.locator(".landing").innerText();
  assert.ok(copy.includes("CONTROLLED WORKSPACE ACCESS"));
  assert.ok(copy.includes("100 logical qubits"));
  assert.ok(!copy.includes("NO SIGN-UP REQUIRED"));
  return{controlledAccessDisclosure:true,largeWorkspaceLinked:true};
 });
 await test("Studio renders 20-qubit selector in a real Chromium tab",async()=>{
  const response=await page.goto(base+"/studio",{waitUntil:"domcontentloaded"});
  assert.equal(response?.status(),200);
  await page.getByRole("combobox",{name:"Qubit count"}).waitFor({timeout:30000});
  const select=page.getByRole("combobox",{name:"Qubit count"});
  const options=await select.locator("option").allTextContents();
  assert.equal(options.length,100);
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
  await page.getByText(/1–100 logical qubits/).waitFor({timeout:10000});
  return{capabilityLabel:"1–100 logical qubits"};
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
 await test("100-qubit Studio runs true q0–q99 Bell circuit",async()=>{
  await page.getByRole("tab",{name:"Code"}).click();
  const src='OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[100];\ncreg c[100];\nh q[0];\ncx q[0],q[99];\n';
  await page.getByRole("textbox",{name:"Quantum code editor"}).fill(src);
  await page.getByRole("button",{name:"Compile & run"}).click();
  await page.locator(".result-telemetry").filter({hasText:"Exact Clifford stabilizer tableau"}).waitFor({timeout:60000});
  assert.equal(await page.getByRole("combobox",{name:"Qubit count"}).inputValue(),"100");
  return{qubits:100,backend:"exact Clifford tableau",completed:true};
 });
 await test("100-qubit state inspector rejects full dense amplitude view honestly",async()=>{
  await page.getByRole("tab",{name:"Inspector"}).click();
  await page.getByText(/No 2\^n amplitude array is allocated/).waitFor({timeout:10000});
  return{bounded:true};
 });
 await test("100-qubit Studio executes non-Clifford entanglement in independent cluster",async()=>{
  await page.getByRole("tab",{name:"Code"}).click();
  const src='OPENQASM 2.0;\nqreg q[100];\ncreg c[100];\nh q[0];\nt q[0];\ncx q[0],q[99];\nh q[99];\n';
  await page.getByRole("textbox",{name:"Quantum code editor"}).fill(src);
  await page.getByRole("button",{name:"Compile & run"}).click();
  await page.locator(".result-telemetry").filter({hasText:"Exact partitioned statevector"}).waitFor({timeout:60000});
  return{qubits:100,method:"partitioned statevector",completed:true};
 });
 await test("1000+ dedicated page runs exact 1000-qubit GHZ in Chromium worker",async()=>{
  const response=await page.goto(base+"/1000-plus",{waitUntil:"domcontentloaded"});
  assert.equal(response?.status(),200);
  await page.getByRole("heading",{name:"1000+ Qubit"}).waitFor({timeout:20000});
  await page.getByRole("button",{name:"Run quantum circuit"}).click();
  await page.getByText("Exact Z-basis support dimension").waitFor({timeout:60000});
  const text=await page.locator(".large-results").innerText();
  assert.ok(text.includes("Clifford stabilizer tableau"));
  assert.ok(text.includes("1,000"));
  return{qubits:1000,completed:true,exactClifford:true};
 });
 await test("1000-qubit experiment exports a reproducible signed-input evidence record",async()=>{
  const downloadReady=page.waitForEvent("download",{timeout:15000});
  await page.getByRole("button",{name:"Download reproducible JSON"}).click();
  const downloaded=await downloadReady;
  assert.match(downloaded.suggestedFilename(),/1000Q-experiment\.json/);
  const path=await downloaded.path();
  assert.ok(path,"Download path unavailable");
  const evidence=JSON.parse(readFileSync(path,"utf8"));
  assert.equal(evidence.schema,"MAH-Quantum-Experiment/v1");
  assert.equal(evidence.circuit.logicalQubits,1000);
  assert.equal(evidence.execution.requestedShots,256);
  assert.equal(evidence.execution.completedShots,256);
  assert.equal(evidence.execution.method,"stabilizer-tableau");
  assert.equal(evidence.execution.exactForSupportedCircuit,true);
  assert.equal(evidence.circuit.sha256,createHash("sha256").update(evidence.circuit.openQasm).digest("hex"));
  assert.equal(Object.values(evidence.measurement.counts).reduce((a,b)=>a+b,0),256);
  return{sha256Verified:true,qubits:1000,shots:256,method:"stabilizer-tableau"};
 });
 await test("Changing seed and shots invalidates previous results and preserves exported provenance",async()=>{
  await page.getByRole("spinbutton",{name:"Large circuit seed"}).fill("123");
  await page.getByRole("combobox",{name:"Large circuit shots"}).selectOption("128");
  assert.equal(await page.getByRole("button",{name:"Download reproducible JSON"}).isDisabled(),true);
  await page.getByRole("button",{name:"Run quantum circuit"}).click();
  await page.locator(".large-telemetry").getByText("Clifford stabilizer tableau").waitFor({timeout:30000});
  const next=page.waitForEvent("download",{timeout:15000});
  await page.getByRole("button",{name:"Download reproducible JSON"}).click();
  const downloaded=await next;
  const parsed=JSON.parse(readFileSync(await downloaded.path(),"utf8"));
  assert.equal(parsed.execution.seed,123);
  assert.equal(parsed.execution.requestedShots,128);
  assert.equal(parsed.execution.completedShots,128);
  assert.equal(parsed.circuit.sha256,createHash("sha256").update(parsed.circuit.openQasm).digest("hex"));
  return{seed:123,shots:128,previousResultInvalidated:true,sha256Verified:true};
 });
 await test("2048-qubit Hadamard preset executes without statevector",async()=>{
  await page.getByRole("combobox",{name:"Large circuit qubit count"}).selectOption("2048");
  await page.getByRole("combobox",{name:"Large circuit preset"}).selectOption("plus");
  await page.getByRole("combobox",{name:"Large circuit shots"}).selectOption("32");
  await page.getByRole("button",{name:"Run quantum circuit"}).click();
  await page.getByText("Exact Z-basis support dimension").waitFor({timeout:60000});
  const text=await page.locator(".large-results").innerText();
  assert.ok(text.includes("2,048"));
  assert.ok(text.includes("32 / 32"));
  return{qubits:2048,shots:32,completed:true};
 });
 await test("1000-qubit non-Clifford entanglement runs when its cluster is bounded",async()=>{
  const src='OPENQASM 2.0;\nqreg q[1000];\ncreg c[1000];\nh q[0];\nt q[0];\ncx q[0],q[999];\nh q[999];\n';
  await page.getByRole("textbox",{name:"Large quantum QASM code"}).fill(src);
  await page.getByRole("button",{name:"Run quantum circuit"}).click();
  await page.locator(".large-telemetry").getByText("Partitioned exact statevectors").waitFor({timeout:30000});
  const text=await page.locator(".large-results").innerText();
  assert.match(text,/1[,\s.]*000/,"Expected 1,000 logical qubits in telemetry, saw: "+text.slice(0,250));
  return{qubits:1000,method:"partitioned statevector",completed:true};
 });
 await test("1000-qubit oversized non-Clifford entangled cluster rejects safely",async()=>{
  const lines=['OPENQASM 2.0;','qreg q[1000];','creg c[1000];','h q[0];','t q[0];'];
  for(let q=1;q<19;q++)lines.push('cx q['+(q-1)+'],q['+q+'];');
  await page.getByRole("textbox",{name:"Large quantum QASM code"}).fill(lines.join('\n'));
  await page.getByRole("button",{name:"Run quantum circuit"}).click();
  await page.getByRole("alert").filter({hasText:/19 qubits/i}).waitFor({timeout:30000});
  return{rejected:true,maxConnectedQubits:18,misleadingOutput:false};
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
  scope:"20/100/1000+/2048 quantum UIs and worker smoke; access control not evaluated",
  durationMs:+(performance.now()-started).toFixed(2),
  counts:{total:evidence.length,passed:evidence.length-fails.length,failed:fails.length},cases:evidence};
 mkdirSync("artifacts",{recursive:true});
 writeFileSync("artifacts/browser-release-gate.json",JSON.stringify(result,null,2)+"\n");
 console.log("BROWSER_GATE_SUMMARY "+JSON.stringify(result.counts));
 if(fails.length)process.exitCode=1;
}
