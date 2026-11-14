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
  assert.match(copy,/100\s+logical qubits/i);
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
 await test("Mobile-width 1000+ workspace remains usable with no page-level horizontal overflow",async()=>{
  const mobileContext=await browser.newContext({viewport:{width:390,height:844}});
  await mobileContext.addInitScript(()=>{
   localStorage.setItem("mah-workspace-access-v1",JSON.stringify({
    version:1,active:"c0",codes:{"c0":{usedMs:0,cooldownUntil:0}},owner:null,heartbeat:0
   }));
  });
  const mobile=await mobileContext.newPage();
  try{
   await mobile.goto(base+"/1000-plus",{waitUntil:"domcontentloaded"});
   await mobile.getByRole("heading",{name:"1000+ Qubit"}).waitFor({timeout:25000});
   const widths=await mobile.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));
   assert.ok(widths.page<=widths.viewport+8,
    "Mobile page overflows: "+JSON.stringify(widths));
   await mobile.getByRole("button",{name:"Run quantum circuit"}).click();
   await mobile.locator(".large-telemetry").getByText("Clifford stabilizer tableau").waitFor({timeout:60000});
   return{viewportPx:widths.viewport,pagePx:widths.page,executed:true};
  }finally{await mobileContext.close();}
 });
 await test("Research console exposes eight executable large-qubit models and selects exact Ramsey circuit",async()=>{
  await page.goto(base+"/1000-plus",{waitUntil:"domcontentloaded"});
  await page.getByRole("heading",{name:"1000+ Qubit"}).waitFor({timeout:25000});
  await page.locator(".rq-rail>button").filter({hasText:"Research Models"}).click();
  assert.equal(await page.locator(".rq-model-card").count(),8);
  await page.locator(".rq-model-card").filter({hasText:"Ideal Ramsey interference array"}).getByRole("button",{name:"Load executable model"}).click();
  assert.equal(await page.getByRole("combobox",{name:"Large circuit preset"}).inputValue(),"ramsey");
  const qasm=await page.getByRole("textbox",{name:"Large quantum QASM code"}).inputValue();
  assert.ok(qasm.includes("rz(pi/3) q[0];"));
  assert.ok(qasm.includes("qreg q[1000];"));
  return{modelCount:8,selected:"ramsey",generatedQasm:true};
 });
 await test("Real scientific Ramsey run produces separable-state backend and sampled Z observables",async()=>{
  await page.getByRole("combobox",{name:"Large circuit shots"}).selectOption("1024");
  await page.getByRole("button",{name:"Run quantum circuit"}).click();
  await page.locator(".large-telemetry").getByText("Separable pure-state").waitFor({timeout:60000});
  await page.locator(".rq-rail>button").filter({hasText:"Scientific Graphs"}).click();
  await page.getByRole("heading",{name:"Bit marginals & ZZ correlation"}).waitFor({timeout:10000});
  const numeric=await page.locator(".rq-graph-grid").innerText();
  assert.match(numeric,/Sample Shannon entropy/);
  assert.match(numeric,/Gate population/);
  const marginal=await page.locator(".rq-panel").filter({hasText:"Bit marginals & ZZ correlation"}).innerText();
  assert.match(marginal,/P\(c0=1\)/);
  assert.match(marginal,/Sample/);
  const csv=page.waitForEvent("download",{timeout:15000});
  await page.getByRole("button",{name:"Export CSV"}).click();
  const file=await csv,rows=readFileSync(await file.path(),"utf8").trim().split("\n");
  assert.equal(rows[0],"bitstring,shots,relative_frequency");
  assert.ok(rows.length>=2);
  assert.equal(rows.slice(1).reduce((sum,line)=>sum+Number(line.split(",")[1]),0),1024);
  return{backend:"separable-state",shots:1024,graphComputed:true,completeCsvDistribution:true};
 });
 await test("Quantum industrial atlas filters real reference categories without claiming hardware connection",async()=>{
  await page.locator(".rq-rail>button").filter({hasText:"Equipment Atlas"}).click();
  assert.ok(await page.locator(".rq-equipment-card").count()>=30);
  await page.getByRole("combobox",{name:"Equipment technology platform"}).selectOption("Superconducting");
  const platformCount=await page.locator(".rq-equipment-card").count();
  assert.ok(platformCount>=6&&platformCount<30);
  await page.getByRole("searchbox",{name:"Search quantum equipment"}).fill("refrigerator");
  assert.equal(await page.locator(".rq-equipment-card").count(),1);
  await page.locator(".rq-equipment-card summary").first().click();
  const detail=await page.locator(".rq-equipment-card").first().innerText();
  assert.match(detail,/No live instrument API|Not connected/i);
  await page.getByRole("button",{name:/Industrial models/}).click();
  assert.equal(await page.locator(".rq-app-card").count(),10);
  return{instrumentReferenceMinimum:30,platformFiltered:platformCount,models:10,hardwareConnected:false};
 });
 await test("Research QASM snapshots are autosaved and recovered after browser reload",async()=>{
  await page.locator(".rq-rail>button").filter({hasText:"Circuit Workbench"}).click();
  await page.getByRole("textbox",{name:"Research experiment name"}).fill("Research validation session");
  await page.getByRole("button",{name:"Save experiment"}).click();
  await page.waitForFunction(()=>{
   const raw=localStorage.getItem("mah-quantum-1000-research-v1");
   if(!raw)return false;
   try{
    const doc=JSON.parse(raw);
    return doc.draft.name==="Research validation session"&&
      doc.saved.some(x=>x.name==="Research validation session");
   }catch{return false;}
  },null,{timeout:12000});
  await page.reload({waitUntil:"domcontentloaded"});
  await page.getByRole("heading",{name:"1000+ Qubit"}).waitFor({timeout:20000});
  assert.equal(await page.getByRole("textbox",{name:"Research experiment name"}).inputValue(),"Research validation session");
  await page.locator(".rq-rail>button").filter({hasText:"Experiment Library"}).click();
  await page.getByRole("searchbox",{name:"Search saved quantum experiments"}).fill("Research validation session");
  await page.getByText("Research validation session").waitFor({timeout:10000});
  assert.ok((await page.locator(".rq-run-log").innerText()).includes("completed"));
  return{draftRestored:true,namedSnapshot:true,runMetadataPersisted:true};
 });
 await test("Industrial QAOA module executes synthetic manufacturing optimization with verifiable classical optimum",async()=>{
  await page.goto(base+"/1000-plus",{waitUntil:"domcontentloaded"});
  await page.getByRole("heading",{name:"1000+ Qubit"}).waitFor({timeout:30000});
  await page.locator(".rq-rail>button").filter({hasText:"Industrial Optimization"}).click();
  await page.getByRole("heading",{name:"Weighted graph optimization · quantum versus classical"}).waitFor({timeout:20000});
  assert.ok((await page.locator(".rq-opt").innerText()).includes("2–10 qubits"));
  await page.getByRole("button",{name:"Run QAOA and classical reference"}).click();
  await page.getByRole("heading",{name:"Quantum/classical benchmark and reproducibility"}).waitFor({timeout:35000});
  await page.locator(".rq-opt-metrics").getByText("QAOA expectation / exact optimum").waitFor({timeout:35000});
  const metrics=await page.locator(".rq-opt-results").innerText();
  assert.match(metrics,/Classical global optimum/);
  assert.match(metrics,/Classical greedy/);
  assert.match(metrics,/QAOA exact expectation/);
  assert.match(metrics,/Best QAOA sample/);
  assert.equal(await page.getByRole("button",{name:"Download evidence JSON"}).isDisabled(),false);
  return{completed:true,quantumAlgorithm:"p=1 QAOA",classicalExhaustive:true};
 });
 await test("Industrial QAOA evidence export reconciles every shot and graph SHA-256 digest",async()=>{
  const next=page.waitForEvent("download",{timeout:20000});
  await page.getByRole("button",{name:"Download evidence JSON"}).click();
  const file=await next;
  const evidence=JSON.parse(readFileSync(await file.path(),"utf8"));
  assert.equal(evidence.schema,"MAH-Quantum-Industrial-Optimization-Evidence/v1");
  assert.equal(evidence.report.schema,"MAH-Quantum-Industrial-QAOA-MaxCut/v1");
  assert.equal(evidence.report.execution.physicalHardware,false);
  assert.equal(evidence.report.execution.completedShots,512);
  assert.equal(evidence.report.settings.seed,2026);
  assert.equal(evidence.report.settings.shots,512);
  const digest=createHash("sha256").update(JSON.stringify(evidence.report.graph)).digest("hex");
  assert.equal(evidence.inputSha256,digest);
  assert.equal(evidence.report.quantum.outcomes.reduce((a,o)=>a+o.count,0),512);
  assert.ok(evidence.report.quantum.expectedScore<=evidence.report.classical.optimum+1e-9);
  assert.ok(evidence.report.quantum.bestSampleScore<=evidence.report.classical.optimum+1e-9);
  return{shotCount:512,sourceHashVerified:true,optimalityVerified:true};
 });
 await test("Industrial QAOA rejects invalid customer graph and invalidates stale output",async()=>{
  const editor=page.getByRole("textbox",{name:"Industrial optimization graph JSON"});
  await editor.fill(JSON.stringify({name:"Invalid",nodes:["A","B"],edges:[{source:0,target:1,weight:-2}]}));
  assert.equal(await page.getByRole("button",{name:"Download evidence JSON"}).isDisabled(),true);
  assert.equal(await page.getByRole("button",{name:"Run QAOA and classical reference"}).isDisabled(),true);
  await page.getByText(/weight must be a finite positive/i).waitFor({timeout:15000});
  return{unsafeModelRejected:true,previousResultInvalidated:true};
 });
 await test("Industrial QAOA and scientific graphs render and remain usable at mobile viewport width",async()=>{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(()=>{
   localStorage.setItem("mah-workspace-access-v1",JSON.stringify({
    version:1,active:"c0",codes:{"c0":{usedMs:0,cooldownUntil:0}},owner:null,heartbeat:0
   }));
  });
  const mobile=await context.newPage();
  try{
   await mobile.goto(base+"/1000-plus",{waitUntil:"domcontentloaded"});
   await mobile.getByRole("heading",{name:"1000+ Qubit"}).waitFor({timeout:20000});
   await mobile.locator(".rq-rail>button").filter({hasText:"Industrial Optimization"}).click();
   const widths=await mobile.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));
   assert.ok(widths.page<=widths.viewport+8,"Industrial mobile overflow: "+JSON.stringify(widths));
   await mobile.getByRole("button",{name:"Run QAOA and classical reference"}).click();
   await mobile.locator(".rq-opt-metrics").getByText("QAOA expectation / exact optimum").waitFor({timeout:40000});
   await mobile.locator(".rq-rail>button").filter({hasText:"Scientific Graphs"}).click();
   const after=await mobile.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));
   assert.ok(after.page<=after.viewport+8,"Scientific graphs mobile overflow: "+JSON.stringify(after));
   return{viewportPx:390,industrialPagePx:widths.page,graphsPagePx:after.page,ranOptimization:true};
  }finally{await context.close();}
 });
 await test("Scientific module navigation resets long-document scroll to the new module's beginning",async()=>{
  await page.goto(base+"/1000-plus",{waitUntil:"domcontentloaded"});
  await page.getByRole("heading",{name:"1000+ Qubit"}).waitFor({timeout:20000});
  await page.locator(".rq-rail>button").filter({hasText:"Research Models"}).click();
  await page.locator(".rq-model-card").first().waitFor({timeout:10000});
  await page.evaluate(()=>{
   document.documentElement.style.scrollBehavior="auto";
   document.body.style.scrollBehavior="auto";
   window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"});
  });
  await page.waitForFunction(()=>window.scrollY>100,null,{timeout:10000});
  const before=await page.evaluate(()=>window.scrollY);
  await page.locator(".rq-rail>button").filter({hasText:"Industrial Optimization"}).click();
  await page.waitForFunction(()=>window.scrollY<5,null,{timeout:10000});
  assert.equal(await page.locator(".rq-rail>button[aria-current=page]").count(),1);
  return{scrollBeforePx:Math.round(before),scrollAfterPx:0,activeNavigation:true};
 });
 await test("Capture reproducible scientific workbench and industrial interface visual evidence",async()=>{
  mkdirSync("artifacts",{recursive:true});
  await page.goto(base+"/1000-plus",{waitUntil:"domcontentloaded"});
  await page.getByRole("heading",{name:"1000+ Qubit"}).waitFor({timeout:20000});
  await page.screenshot({path:"artifacts/research-console-desktop.png",fullPage:true});
  await page.locator(".rq-rail>button").filter({hasText:"Research Models"}).click();
  await page.locator(".rq-model-card").first().waitFor({timeout:12000});
  await page.screenshot({path:"artifacts/research-models-desktop.png",fullPage:true});
  await page.locator(".rq-rail>button").filter({hasText:"Scientific Graphs"}).click();
  await page.locator(".rq-graph-grid").waitFor({timeout:12000});
  await page.screenshot({path:"artifacts/research-graphs-desktop.png",fullPage:true});
  await page.locator(".rq-rail>button").filter({hasText:"Industrial Optimization"}).click();
  await page.getByRole("button",{name:"Run QAOA and classical reference"}).click();
  await page.locator(".rq-opt-metrics").waitFor({timeout:30000});
  await page.screenshot({path:"artifacts/industrial-optimization-desktop.png",fullPage:true});
  return{visuals:["research-console-desktop.png","research-models-desktop.png",
   "research-graphs-desktop.png","industrial-optimization-desktop.png"],
   source:"actual production-build Chromium"};
 });
 await test("Scientific research console compares repeated sampled quantum runs using actual finite-shot counts",async()=>{
  await page.goto(base+"/1000-plus",{waitUntil:"domcontentloaded"});
  await page.getByRole("heading",{name:"1000+ Qubit"}).waitFor({timeout:20000});
  await page.getByRole("combobox",{name:"Large circuit qubit count"}).selectOption("1000");
  await page.getByRole("combobox",{name:"Large circuit preset"}).selectOption("ghz");
  await page.getByRole("combobox",{name:"Large circuit shots"}).selectOption("128");
  await page.getByRole("spinbutton",{name:"Large circuit seed"}).fill("21");
  await page.getByRole("button",{name:"Run quantum circuit"}).click();
  await page.locator(".large-telemetry").getByText("Clifford stabilizer tableau").waitFor({timeout:45000});
  await page.getByRole("button",{name:"Run quantum circuit"}).click();
  await page.locator(".large-telemetry").getByText("Clifford stabilizer tableau").waitFor({timeout:45000});
  await page.locator(".rq-rail>button").filter({hasText:"Scientific Graphs"}).click();
  await page.getByRole("heading",{name:"Sampled run comparison"}).waitFor({timeout:10000});
  const text=await page.locator(".rq-comparison").innerText();
  assert.ok(text.includes("Empirical total-variation distance"));
  assert.ok(text.includes("0.00000"));
  assert.ok(text.includes("Sampled"));
  return{repeatedSeed:21,sameInput:true,sampleTvd:0,visualComparison:true};
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
  scope:"20/100/1000+/2048 quantum UI, 8 scientific models, equipment atlas and bounded industrial QAOA; access control not evaluated",
  durationMs:+(performance.now()-started).toFixed(2),
  counts:{total:evidence.length,passed:evidence.length-fails.length,failed:fails.length},cases:evidence};
 mkdirSync("artifacts",{recursive:true});
 writeFileSync("artifacts/browser-release-gate.json",JSON.stringify(result,null,2)+"\n");
 console.log("BROWSER_GATE_SUMMARY "+JSON.stringify(result.counts));
 if(fails.length)process.exitCode=1;
}
