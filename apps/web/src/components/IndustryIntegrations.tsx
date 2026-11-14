import {useMemo,useState} from "react";
import type {CircuitDiagnostic} from "../../../engine/src/studio/research";
import {SCENARIOS,type Scenario} from "../services/industrial-research-examples";
import {download} from "../services/projects";

type Mode="execute"|"inspect"|"optimization";
const SCHEMA="MAH-Quantum-Industry-Job/v1";
interface Props{source:string;shots:number;seed:number;analysis:CircuitDiagnostic|null}
type Capability={schema?:string;formats?:{circuit?:{executeMaxLogicalQubits?:number;executeMaxShots?:number};optimization?:{qubits?:{max?:number}}}};
const pythonCode=[
 "from mah_quantum import IndustryClient, verify_result, save_evidence",
 "import json",
 "import os",
 "",
 'client = IndustryClient("https://YOUR-APPROVED-DOMAIN.example",',
 '                        os.environ["MAH_QUANTUM_INDUSTRY_API_KEY"])',
 'with open("research-job.json", encoding="utf-8") as f:',
 "    job = json.load(f)",
 "print(client.capabilities())",
 "result = client.execute(job)",
 "assert verify_result(job, result)",
 'save_evidence("research-evidence.json", result)'
].join("\n");
const curlCode=[
 "curl --fail-with-body -X POST",
 '  "https://YOUR-APPROVED-DOMAIN.example/api/v1/execute"',
 '  -H "Authorization: Bearer $MAH_QUANTUM_INDUSTRY_API_KEY"',
 '  -H "Content-Type: application/json"',
 '  --data-binary @research-job.json'
].join(" \\\n");
export default function IndustryIntegrations({source,shots,seed,analysis}:Props){
 const [mode,setMode]=useState<Mode>("execute");
 const [scenario,setScenario]=useState<Scenario>("manufacturing");
 const [graphText,setGraphText]=useState(JSON.stringify(SCENARIOS.manufacturing,null,2));
 const [jobId,setJobId]=useState("research-001");
 const [capability,setCapability]=useState<Capability|null>(null);
 const [remoteStatus,setRemoteStatus]=useState("Not checked; deployed API status unknown.");
 const [checking,setChecking]=useState(false);
 const [message,setMessage]=useState("");
 const graph=useMemo(()=>{try{return JSON.parse(graphText);}catch{return null;}},[graphText]);
 const sourceBytes=new TextEncoder().encode(source).length;
 const isCircuit=mode!=="optimization";
 const validId=/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(jobId);
 const invalidCircuit=!analysis||sourceBytes>100*1024||
  (mode==="execute"&&(analysis.qubits>2048||analysis.operations>3072||shots>256));
 const invalidGraph=!graph||typeof graph!=="object"||!Array.isArray(graph.nodes)||
  !Array.isArray(graph.edges)||graph.nodes.length<2||graph.nodes.length>10;
 const valid=validId&&(isCircuit?!invalidCircuit:!invalidGraph);
 const payload=useMemo(()=>{
  if(isCircuit)return mode==="inspect"?
   {schema:SCHEMA,jobId,kind:"circuit",operation:"inspect",source}:
   {schema:SCHEMA,jobId,kind:"circuit",operation:"execute",source,shots,seed};
  return{schema:SCHEMA,jobId,kind:"optimization",operation:"execute",graph,shots:256,seed};
 },[mode,jobId,source,shots,seed,isCircuit,graph]);
 const copy=async(text:string)=>{
  try{await navigator.clipboard.writeText(text);setMessage("Copied.");}
  catch{setMessage("Clipboard permission denied. Use Download instead.");}
 };
 const probe=async()=>{
  if(checking)return;setChecking(true);
  try{
   const response=await fetch("/api/v1/capabilities",{cache:"no-store",credentials:"omit",headers:{Accept:"application/json"}});
   if(!response.ok)throw Error("HTTP "+response.status);
   const data=(await response.json()) as Capability;
   if(data.schema!=="MAH-Quantum-Industry-Capability/v1")throw Error("Unexpected capability response.");
   setCapability(data);
   setRemoteStatus("Versioned capabilities endpoint verified. Authentication and computation have not been tested against this deployment.");
  }catch(e){
   setCapability(null);
   setRemoteStatus("Capability endpoint not verified: "+(e instanceof Error?e.message:"network failure")+
    ". Local static previews may not serve API functions.");
  }finally{setChecking(false);}
 };
 return <div className="rq-integration" aria-label="Industrial scientific API integration bridge">
  <div className="rq-heading"><span>ENTERPRISE / RESEARCH SOFTWARE INTEGRATION</span><h2>Connect engineering systems with the quantum simulator</h2>
   <p>Generate a portable versioned job from your current QASM or a bounded industrial graph. Submit it from a server-side Python client or HTTPS application. Never enter API secrets into this browser.</p></div>
  <div className="rq-integration-stats">
   <div><strong>HTTPS + JSON</strong><span>Versioned REST contract</span></div>
   <div><strong>OpenQASM</strong><span>Supported language subset only</span></div>
   <div><strong>2–10 variables</strong><span>MaxCut industrial optimization</span></div>
   <div><strong>Server key</strong><span>Authentication disabled by default</span></div>
  </div>
  <section className="rq-panel">
   <div className="rq-panel-head"><div><span>00 · API HEALTH &amp; CAPABILITY</span><h3>Read the deployed API contract</h3></div>
    <button type="button" disabled={checking} onClick={()=>{void probe();}}>{checking?"Checking…":"Check deployed API"}</button></div>
   <p role="status" className="rq-note">{remoteStatus}</p>
   {capability&&<p className="rq-note">Execution ceiling: {capability.formats?.circuit?.executeMaxLogicalQubits} circuit qubits, {capability.formats?.circuit?.executeMaxShots} circuit shots; {capability.formats?.optimization?.qubits?.max} optimization variables.</p>}
  </section>
  <div className="rq-integration-grid">
   <section className="rq-panel">
    <div className="rq-panel-head"><div><span>01 · SCIENTIFIC JOB BUILDER</span><h3>Create an integration request</h3></div></div>
    <label className="rq-integration-label">Job type
     <select aria-label="Integration operation" value={mode} onChange={e=>setMode(e.target.value as Mode)}>
      <option value="execute">Execute current QASM circuit</option>
      <option value="inspect">Inspect current QASM without execution</option>
      <option value="optimization">Execute weighted MaxCut optimization</option>
     </select></label>
    <label className="rq-integration-label">Customer job identifier
     <input aria-label="Integration job ID" maxLength={64} value={jobId} onChange={e=>setJobId(e.target.value)}/></label>
    {isCircuit?<div className="rq-integration-metrics">
     <span>Actual QASM register: <strong>{analysis?.qubits??"invalid"}</strong></span>
     <span>Expanded gates: <strong>{analysis?.operations??"invalid"}</strong></span>
     <span>Requested shots: <strong>{mode==="inspect"?"not applicable":shots}</strong></span>
     <p>Remote execution permits up to 2,048 qubits, 3,072 gates and 256 shots. Inspect-only mode supports up to 4,096 qubits. Larger executable circuits remain local-browser research workloads when supported.</p>
    </div>:<>
     <label className="rq-integration-label">Synthetic industry graph
      <select aria-label="Integration graph example" value={scenario} onChange={e=>{
       const next=e.target.value as Scenario;setScenario(next);setGraphText(JSON.stringify(SCENARIOS[next],null,2));}}>
       <option value="manufacturing">Manufacturing conflicts</option>
       <option value="energy">Energy segmentation</option>
       <option value="computing">Compute interference</option>
      </select></label>
     <label className="rq-integration-label">Weighted graph JSON
      <textarea aria-label="Integration weighted graph" spellCheck={false} value={graphText} onChange={e=>setGraphText(e.target.value)}/></label>
    </>}
    {!valid&&<p role="status" className="rq-integration-error">The job ID, circuit size, shot budget or graph is outside the API contract. Fix the input before exporting.</p>}
    <div className="rq-integration-buttons">
     <button disabled={!valid} onClick={()=>download("research-job.json",JSON.stringify(payload,null,2),"application/json")}>Download API request</button>
     <button disabled={!valid} onClick={()=>{void copy(JSON.stringify(payload,null,2));}}>Copy API request</button>
    </div>
    {message&&<p role="status" className="rq-note">{message}</p>}
    <p className="rq-note">The downloaded request is an interoperable document, not evidence of a completed quantum job. For proof of execution, submit it through the authenticated API and verify its actual response.</p>
   </section>
   <section className="rq-panel">
    <div className="rq-panel-head"><div><span>02 · CONNECT YOUR BACKEND</span><h3>Python SDK and REST examples</h3></div></div>
    <div className="rq-integration-code-title"><strong>Server-to-server REST</strong><button onClick={()=>{void copy(curlCode);}}>Copy</button></div>
    <pre className="rq-integration-code"><code>{curlCode}</code></pre>
    <div className="rq-integration-code-title"><strong>Python research client</strong><button onClick={()=>{void copy(pythonCode);}}>Copy</button></div>
    <pre className="rq-integration-code"><code>{pythonCode}</code></pre>
    <p className="rq-note">Install the included dependency-free Python SDK from the repository. Configure MAH_QUANTUM_INDUSTRY_API_KEY on the approved customer server. Avoid embedding reusable tokens in webpages or mobile apps.</p>
   </section>
  </div>
  <section className="rq-panel rq-integration-boundary">
   <div className="rq-panel-head"><div><span>03 · SCIENTIFIC AND INDUSTRIAL QUALIFICATION</span><h3>Execution boundaries and operating controls</h3></div></div>
   <p>These APIs are synchronous and computationally bounded. They do not provide durable cloud jobs, organization identity, tenant isolation, per-customer rate limits, billing, guaranteed latency, live equipment drivers, calibrated quantum noise, industrial safety interlocks, or universal 4096-qubit non-Clifford computation. Independent industrial acceptance remains necessary.</p>
  </section>
 </div>;
}
