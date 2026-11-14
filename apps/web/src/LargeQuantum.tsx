import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import type {ChangeEvent,KeyboardEvent as KeyEvent} from "react";
import {Page} from "./lab/Shared";
import {download} from "./services/projects";
import {analyzeLargeCircuit,measuredHistogramStats,RESEARCH_TEMPLATES,RESEARCH_WIDTHS,templateQasm,type ResearchModel,type CircuitDiagnostic} from "../../engine/src/studio/research";
import type {ScalableResult} from "../../engine/src/studio/scalable";
import {compareScientificRuns,type ComparisonSample} from "../../engine/src/studio/research-comparison";
import {QuantumResearchGraphs} from "./components/QuantumResearchGraphs";
import QuantumIndustrialCatalog from "./components/QuantumIndustrialCatalog";
import IndustrialQaoaWorkbench from "./components/IndustrialQaoaWorkbench";
import IndustryIntegrations from "./components/IndustryIntegrations";
import HardwareResearchBridge from "./components/HardwareResearchBridge";
import HamiltonianWorkbench from "./components/HamiltonianWorkbench";
import "./large-quantum.css";

type Tab="workbench"|"models"|"graphs"|"hamiltonian"|"equipment"|"optimization"|"integrations"|"hardware"|"experiments";
type Log={date:string;message:string;level:"info"|"error"|"success"};
type Saved={id:string;name:string;source:string;n:number;shots:number;seed:number;model:ResearchModel|"custom";updated:string};
type RunRecord={id:string;name:string;date:string;qubits:number;shots:number;method:string;duration:number;status:"completed"|"failed"|"cancelled"};
type Stored={version:1;draft:Saved;saved:Saved[];history:RunRecord[]};
const LOCAL_KEY="mah-quantum-1000-research-v1",STORAGE_SOURCE_MAX=120000,MAX_EXPERIMENTS=12;
const jobLimitMs=120000;
const initialDraft=():Saved=>({id:"draft",name:"GHZ correlation experiment",source:templateQasm(1000,"ghz"),n:1000,shots:256,seed:42,model:"ghz",updated:new Date().toISOString()});
function readStored():Stored{
 const empty:Stored={version:1,draft:initialDraft(),saved:[],history:[]};
 try{
  const raw=localStorage.getItem(LOCAL_KEY);
  if(!raw||raw.length>2000000)return empty;
  const v=JSON.parse(raw);
  if(v?.version!==1)return empty;
  const valid=(x:any):x is Saved=>x&&typeof x.name==="string"&&typeof x.source==="string"&&x.source.length<=STORAGE_SOURCE_MAX&&
   Number.isInteger(x.n)&&x.n>=1000&&x.n<=4096&&Number.isInteger(x.shots)&&x.shots>=1&&x.shots<=1024&&
   Number.isInteger(x.seed)&&x.seed>=0&&x.seed<=4294967295&&typeof x.model==="string";
  return{version:1,draft:valid(v.draft)?v.draft:empty.draft,
   saved:Array.isArray(v.saved)?v.saved.filter(valid).slice(0,MAX_EXPERIMENTS):[],
   history:Array.isArray(v.history)?v.history.filter((x:any)=>x&&typeof x.name==="string"&&typeof x.date==="string"&&
    Number.isFinite(x.duration)&&["completed","failed","cancelled"].includes(x.status)).slice(0,24):[]};
 }catch{return empty;}
}
const dateLabel=(s:string)=>new Date(s).toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
const methodLabel=(s:string)=>s==="stabilizer-tableau"?"Clifford stabilizer tableau":s==="separable-state"?"Separable pure-state":"Partitioned exact statevectors";
const concise=(s:string)=>s.length<=65?s:s.slice(0,24)+" ··· "+s.slice(-24);
const iso=()=>new Date().toISOString();
export default function LargeQuantum(){
 const [initial]=useState(readStored);
 const [draft,setDraft]=useState<Saved>(initial.draft);
 const [saved,setSaved]=useState<Saved[]>(initial.saved);
 const [history,setHistory]=useState<RunRecord[]>(initial.history);
 const [tab,setTab]=useState<Tab>("workbench");
 const [result,setResult]=useState<ScalableResult|null>(null);
 const [executed,setExecuted]=useState<Saved|null>(null);
 const [previousRun,setPreviousRun]=useState<ComparisonSample|null>(null);
 const [error,setError]=useState("");
 const [running,setRunning]=useState(false),[elapsed,setElapsed]=useState(0);
 const [stage,setStage]=useState("Idle");
 const [storage,setStorage]=useState("Local draft active");
 const [query,setQuery]=useState("");
 const [focus,setFocus]=useState(false);
 const [lineTarget,setLineTarget]=useState(1);
 const [selectedOutcome,setSelectedOutcome]=useState<string|null>(null);
 const [logs,setLogs]=useState<Log[]>([{date:iso(),level:"info",message:"Research console initialized. No physical hardware connected."}]);
 const workerRef=useRef<Worker|null>(null),deadlineRef=useRef<ReturnType<typeof setTimeout>|null>(null);
 const codeRef=useRef<HTMLTextAreaElement|null>(null),gutterRef=useRef<HTMLPreElement|null>(null),fileRef=useRef<HTMLInputElement|null>(null);
 const log=useCallback((message:string,level:Log["level"]="info")=>
  setLogs(s=>[...s,{date:iso(),message,level}].slice(-60)),[]);
 useEffect(()=>()=>{workerRef.current?.terminate();if(deadlineRef.current!==null)clearTimeout(deadlineRef.current);},[]);
 useEffect(()=>{
  const t=setTimeout(()=>{
   if(draft.source.length>STORAGE_SOURCE_MAX){setStorage("Source exceeds local snapshot limit — export QASM");return;}
   try{
    localStorage.setItem(LOCAL_KEY,JSON.stringify({version:1,draft,saved,history}));
    setStorage("Autosaved locally · not cloud-synced");
   }catch{setStorage("Local storage unavailable · export QASM to preserve your work");}
  },450);
  return()=>clearTimeout(t);
 },[draft,saved,history]);
 const analysis=useMemo<{data:CircuitDiagnostic|null;error:string}>(()=>{
  try{
   const data=analyzeLargeCircuit(draft.source);
   if(data.qubits<1000)return{data:null,error:"Large workspace requires at least 1,000 logical qubits."};
   return{data,error:""};
  }catch(e){return{data:null,error:e instanceof Error?e.message:String(e)};}
 },[draft.source]);
 const stats=useMemo(()=>result?measuredHistogramStats(result.counts):null,[result]);
 const runComparison=useMemo(()=>{
  if(!previousRun||!result||!executed)return null;
  try{return compareScientificRuns(previousRun,{source:executed.source,method:result.method,
   qubits:result.backendInfo.qubitCount,shots:result.backendInfo.shots,seed:result.seed,counts:result.counts});}
  catch{return null;}
 },[previousRun,result,executed]);
 const cleanResult=()=>{setResult(null);setExecuted(null);setError("");setSelectedOutcome(null);};
 const edit=(patch:Partial<Saved>)=>{setStorage("Saving changes…");setDraft(s=>({...s,...patch,updated:iso()}));cleanResult();};
 const loadModel=(id:ResearchModel,width=draft.n)=>{
  const item=RESEARCH_TEMPLATES.find(x=>x.id===id);
  if(!item||running)return;
  edit({source:templateQasm(width,id),model:id,n:width,name:item.name});
  setTab("workbench");log("Loaded "+item.name+" ("+width+" logical qubits).");
 };
 const saveExperiment=()=>{
  if(running)return;
  if(draft.source.length>STORAGE_SOURCE_MAX){setError("Source is too large for local experiment storage. Export the QASM file instead.");return;}
  const id=iso(),record={...draft,id,name:draft.name.slice(0,85),updated:id};
  const next=[record,...saved].slice(0,MAX_EXPERIMENTS);
  try{
   localStorage.setItem(LOCAL_KEY,JSON.stringify({version:1,draft,saved:next,history}));
   setSaved(next);setStorage("Named experiment saved locally");
   log('Saved local experiment "'+record.name+'".',"success");
  }catch{
   setStorage("Local snapshot failed — export QASM");
   setError("Local browser storage rejected this experiment. Export its QASM file to preserve the work.");
  }
 };
 const loadSaved=(record:Saved)=>{
  if(running)return;
  setDraft({...record,id:"draft",updated:iso()});cleanResult();setTab("workbench");
  log('Loaded saved experiment "'+record.name+'".');
 };
 const importQasm=async(e:ChangeEvent<HTMLInputElement>)=>{
  const file=e.target.files?.[0];e.target.value="";
  if(!file||running)return;
  if(file.size>750000){setError("QASM input exceeds 750 KB.");return;}
  try{
   const source=await file.text(),parsed=analyzeLargeCircuit(source);
   if(parsed.qubits<1000)throw Error("Import needs 1,000 or more logical qubits.");
   edit({source,n:parsed.qubits,name:file.name.slice(0,85),model:"custom"});
   setTab("workbench");log("Imported "+file.name+"; "+parsed.operations+" expanded operations.","success");
  }catch(ex){setError("QASM import rejected: "+(ex instanceof Error?ex.message:String(ex)));log("QASM import rejected.","error");}
 };
 const run=useCallback(()=>{
  if(running||workerRef.current)return;
  if(!analysis.data){setError("Scientific preflight: "+analysis.error);return;}
  if(!Number.isInteger(draft.seed)||draft.seed<0||draft.seed>4294967295){setError("Seed must be an unsigned 32-bit integer.");return;}
  if(!Number.isInteger(draft.shots)||draft.shots<1||draft.shots>1024){setError("Shots must be 1–1,024.");return;}
  setError("");setResult(null);setExecuted(null);setElapsed(0);setStage("Starting worker");setRunning(true);
  const current={...draft},start=performance.now(),width=analysis.data.qubits;
  log("Executing "+width+"-qubit circuit; "+analysis.data.operations+" parsed operations.");
  let worker:Worker;
  try{worker=new Worker(new URL("./services/large.worker.ts",import.meta.url),{type:"module"});}
  catch{setRunning(false);setError("Unable to start local execution worker.");return;}
  workerRef.current=worker;
  const finish=(payload:{result?:ScalableResult;error?:string})=>{
   if(workerRef.current!==worker)return;
   workerRef.current=null;if(deadlineRef.current!==null)clearTimeout(deadlineRef.current);
   deadlineRef.current=null;worker.terminate();
   setRunning(false);
   const duration=performance.now()-start;setElapsed(duration);setStage("Idle");
   const status:RunRecord["status"]=payload.result?"completed":"failed";
   setHistory(prev=>[{id:iso(),name:current.name,date:iso(),qubits:width,shots:current.shots,
    method:payload.result?.method||analysis.data!.method,duration,status},...prev].slice(0,24));
   if(payload.result){
    if(result&&executed)setPreviousRun({source:executed.source,method:result.method,
     qubits:result.backendInfo.qubitCount,shots:result.backendInfo.shots,seed:result.seed,counts:result.counts});
    setResult(payload.result);setExecuted(current);
    log("Completed "+payload.result.backendInfo.shots+" shots, "+methodLabel(payload.result.method)+".","success");}
   else{setError(payload.error||"Computation finished without a result.");log(payload.error||"Simulation failed.","error");}
  };
  worker.onmessage=(ev:MessageEvent<{result?:ScalableResult;error?:string;stage?:string}>)=>{
   if(ev.data?.stage){setStage(ev.data.stage);log("Worker: "+ev.data.stage);return;}
   finish(ev.data);
  };
  worker.onerror=()=>finish({error:"Local quantum worker encountered an error."});
  worker.onmessageerror=()=>finish({error:"Unreadable worker response."});
  deadlineRef.current=setTimeout(()=>finish({error:"120-second computation limit exceeded; reduce workload."}),jobLimitMs);
  try{worker.postMessage({source:current.source,shots:current.shots,seed:current.seed});}
  catch{finish({error:"Unable to transfer circuit to worker."});}
 },[draft,analysis,running,log,result,executed]);
 const cancel=()=>{
  if(!workerRef.current)return;
  workerRef.current.terminate();workerRef.current=null;
  if(deadlineRef.current!==null)clearTimeout(deadlineRef.current);
  deadlineRef.current=null;setRunning(false);setStage("Idle");
  setError("Execution cancelled.");log("Operator cancelled a local simulation.","info");
  setHistory(prev=>[{id:iso(),name:draft.name,date:iso(),qubits:analysis.data?.qubits||draft.n,
   shots:draft.shots,method:analysis.data?.method||"unresolved",duration:0,status:"cancelled" as const},...prev].slice(0,24));
 };
 const exportExperiment=async()=>{
  if(!result||!executed||running)return;
  const hash=globalThis.crypto?.subtle?await globalThis.crypto.subtle.digest("SHA-256",new TextEncoder().encode(executed.source))
   .then(b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")).catch(()=>null):null;
  const evidence={schema:"MAH-Quantum-Experiment/v1",recordedAtUtc:iso(),
   software:"MAH Quantum logical-qubit classical simulation",
   circuit:{openQasm:executed.source,sha256:hash,logicalQubits:result.backendInfo.qubitCount},
   execution:{seed:result.seed,requestedShots:result.backendInfo.shots,
    completedShots:Object.values(result.counts).reduce((a,b)=>a+b,0),method:result.method,
    exactForSupportedCircuit:result.exact,simulationTimeMs:result.executionTimeMs,
    finiteSupportRank:result.supportRank??null,idealProbabilityLog2:result.idealProbabilityLog2??null},
   measurement:{counts:result.counts,shotFrequencies:result.probabilities,
    idealProbabilitiesShown:result.idealProbabilities,
    omittedIdealProbabilityMass:result.distributionInfo.omittedIdealProbabilityMass},
   limitations:result.detail,
   notice:"Classical ideal quantum circuit simulation; not a physical quantum processor."
  };
  download("MAH-Quantum-"+result.backendInfo.qubitCount+"Q-experiment.json",JSON.stringify(evidence,null,2),"application/json");
  log("Exported measured counts and SHA-256 circuit fingerprint.","success");
 };
 const editorKeys=(e:KeyEvent<HTMLTextAreaElement>)=>{
  if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();run();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();saveExperiment();return;}
  if(e.key==="Tab"){
   e.preventDefault();const el=e.currentTarget,start=el.selectionStart,end=el.selectionEnd;
   edit({source:draft.source.slice(0,start)+"  "+draft.source.slice(end),model:"custom"});
   requestAnimationFrame(()=>{el.focus();el.setSelectionRange(start+2,start+2);});
  }
 };
 const jump=()=>{
  const el=codeRef.current;if(!el)return;
  const lines=draft.source.split("\n"),row=Math.max(1,Math.min(lines.length,Math.floor(lineTarget)||1));
  let offset=0;for(let i=0;i<row-1;i++)offset+=lines[i].length+1;
  el.focus();el.setSelectionRange(offset,offset);el.scrollTop=Math.max(0,row-4)*20.8;
 };
 const lines=draft.source.split("\n").length;
 const shownHistory=history.slice(0,24);
 const headerText={
  workbench:"Quantum computation workbench",models:"Executable research models",
  graphs:"Computed scientific graphs",hamiltonian:"Diagonal Hamiltonian & uncertainty laboratory",equipment:"Industrial equipment & application atlas",
  optimization:"Industrial optimization · verified QAOA & classical",
  integrations:"Industry software / quantum engine interoperability",
  hardware:"Laboratory instrumentation and industrial edge gateway",
  experiments:"Experiment management & local job history"
 }[tab];
 const navItems:Array<{key:Tab;name:string;detail:string}>=[
  {key:"workbench",name:"Circuit Workbench",detail:"QASM, solver & output"},
  {key:"models",name:"Research Models",detail:"8 executable templates"},
  {key:"graphs",name:"Scientific Graphs",detail:"Real statistics & connectivity"},
  {key:"hamiltonian",name:"Hamiltonian Lab",detail:"Z/ZZ energy, errors & observables"},
  {key:"equipment",name:"Equipment Atlas",detail:"Physical instrument references"},
  {key:"optimization",name:"Industrial Optimization",detail:"QAOA vs exact classical"},
  {key:"integrations",name:"Integration Bridge",detail:"REST jobs & Python SDK"},
  {key:"hardware",name:"Hardware Bridge",detail:"SCPI, Modbus & edge acquisition"},
  {key:"experiments",name:"Experiment Library",detail:"Saved circuits & run history"}
 ];
 return <Page eyebrow="MAH QUANTUM / SCIENTIFIC COMPUTING" title="1000+ Qubit"
  description="Research-grade interface for specified exact, mathematically tractable circuit families on 1,000–4,096 logical qubits. Classical simulation, not a physical quantum processor.">
  <div className="rq-console">
   <div className="rq-topbar">
    <div><span className="rq-kicker">MAH QUANTUM / RESEARCH WORKBENCH</span>
     <h2>Scientific Computing Console</h2>
     <p>Validated circuit representations · reproducible experiments · industrial research reference</p></div>
    <div className="rq-top-actions">
     <span className="rq-local-status"><span/> LOCAL SIMULATOR</span>
     <button onClick={()=>{setFocus(x=>!x);setTab("workbench");}}>{focus?"Exit focus":"Editor focus"}</button>
     <button disabled={running} onClick={saveExperiment}>Save experiment</button>
     <button disabled={running} onClick={()=>fileRef.current?.click()}>Import QASM</button>
     <input ref={fileRef} type="file" aria-label="Import research QASM file" accept=".qasm,.txt,text/plain" hidden onChange={e=>{void importQasm(e);}}/>
     <button onClick={()=>download("MAH-Quantum-Research.qasm",draft.source,"text/plain")}>Export QASM</button>
    </div>
   </div>
   <div className="large-intro">
    <div><b>1,000–4,096</b><small>Supported logical qubits</small></div>
    <div><b>8,192</b><small>Maximum expanded gates</small></div>
    <div><b>1,024</b><small>Maximum sampled shots</small></div>
    <div><b>3 METHODS</b><small>Exact supported circuit families</small></div>
   </div>
   <div className="rq-science-telemetry" aria-label="Live scientific preflight and execution status">
    <div><span>REGISTER</span><strong>{analysis.data?analysis.data.qubits.toLocaleString("en-US")+" logical qubits":"INVALID CIRCUIT"}</strong></div>
    <div><span>PARSED GATES</span><strong>{analysis.data?analysis.data.operations.toLocaleString("en-US")+" / 8,192":"NOT AVAILABLE"}</strong></div>
    <div><span>SELECTED SOLVER</span><strong>{analysis.data?methodLabel(analysis.data.method):"PREFLIGHT REQUIRED"}</strong></div>
    <div><span>LAST EXECUTION</span><strong>{running?"RUNNING · "+stage:result?result.backendInfo.shots+" SAMPLED SHOTS":"NOT RUN"}</strong></div>
    <div><span>DEVICE PROVENANCE</span><strong>IDEAL / SOFTWARE ONLY</strong></div>
   </div>
   <div className={focus?"rq-layout rq-focused":"rq-layout"}>
    <nav className="rq-rail" aria-label="Quantum research tools">
     <div className="rq-rail-title"><span>RESEARCH MODULES</span><b>01–09</b></div>
     {navItems.map((item,i)=><button key={item.key} aria-current={tab===item.key?"page":undefined}
      onClick={()=>{setTab(item.key);setFocus(false);window.scrollTo({top:0,behavior:"auto"});}}>
      <span className="rq-nav-index">{String(i+1).padStart(2,"0")}</span><span><strong>{item.name}</strong><small>{item.detail}</small></span></button>)}
     <div className="rq-rail-summary">
      <span>WORKSPACE SAFETY</span><p>Models run locally in browser workers. Saved experiments remain on this device and are not encrypted. Equipment cards are reference information only.</p>
     </div>
    </nav>
    <div className="rq-content" role="region" aria-label={headerText}>
     <div className="rq-content-header"><div><span>RESEARCH / {tab.toUpperCase()}</span><h2>{headerText}</h2></div>
      <p>{storage} · not cloud-backed</p></div>
     {tab==="workbench"&&<div className="large-grid">
      <section className="large-editor" aria-label="1000-plus circuit editor">
       <div className="large-title"><div><span>01 / CIRCUIT CONFIGURATION</span><h2>Design a reproducible experiment</h2></div><span>LOCAL WORKER</span></div>
       <label className="rq-name">Experiment name
        <input aria-label="Research experiment name" value={draft.name} maxLength={85} disabled={running}
         onChange={e=>edit({name:e.target.value})}/>
       </label>
       <div className="large-fields">
        <label>Logical qubits
         <select aria-label="Large circuit qubit count" value={RESEARCH_WIDTHS.includes(draft.n as typeof RESEARCH_WIDTHS[number])?draft.n:1000} disabled={running}
          onChange={e=>loadModel(draft.model==="custom"?"ghz":draft.model,Number(e.target.value))}>
          {RESEARCH_WIDTHS.map(v=><option value={v} key={v}>{v.toLocaleString()}</option>)}
         </select>
        </label>
        <label>Experiment preset
         <select aria-label="Large circuit preset" value={draft.model} disabled={running}
          onChange={e=>loadModel(e.target.value as ResearchModel)}>
          {RESEARCH_TEMPLATES.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
          <option disabled value="custom">Custom QASM source</option>
         </select>
        </label>
        <label>Measurement shots
         <select aria-label="Large circuit shots" value={draft.shots} disabled={running}
          onChange={e=>edit({shots:Number(e.target.value)})}>
          {[32,64,128,256,512,1024].map(v=><option value={v} key={v}>{v.toLocaleString()}</option>)}
         </select>
        </label>
        <label>Random seed
         <input type="number" aria-label="Large circuit seed" min={0} max={4294967295} step={1} value={draft.seed}
          disabled={running} onChange={e=>edit({seed:Number(e.target.value)})}/>
        </label>
       </div>
       <div className="large-source-header">
        <strong>experiment.qasm · strict OpenQASM subset</strong>
        <span>{draft.source.length.toLocaleString()} chars · {lines.toLocaleString()} lines</span>
       </div>
       <div className="rq-code-frame">
        <pre aria-hidden="true" className="rq-gutter" ref={gutterRef}>{Array.from({length:Math.min(lines,9000)},(_,i)=>i+1).join("\n")}</pre>
        <textarea ref={codeRef} className="large-code" aria-label="Large quantum QASM code" wrap="off" spellCheck={false}
         value={draft.source} disabled={running} onKeyDown={editorKeys}
         onScroll={e=>{if(gutterRef.current)gutterRef.current.scrollTop=e.currentTarget.scrollTop;}}
         onChange={e=>edit({source:e.target.value,model:"custom"})}/>
       </div>
       <div className="rq-code-footer"><span>FP64 ideal circuit · no hardware interface</span>
        <label>Go to line <input aria-label="Go to QASM line" type="number" min={1} max={lines} value={lineTarget}
         onChange={e=>setLineTarget(Number(e.target.value))} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();jump();}}}/></label>
        <button onClick={jump}>Go</button>
        <span>Ctrl+Enter run · Ctrl+S save</span>
       </div>
       <div className="rq-preflight">
        <div><span>SCIENTIFIC PREFLIGHT</span><strong>{analysis.data?"VALID INPUT":"ACTION REQUIRED"}</strong></div>
        {analysis.data?<div className="rq-preflight-grid">
         <div><span>Selected solver</span><b>{methodLabel(analysis.data.method)}</b></div>
         <div><span>Expanded gates</span><b>{analysis.data.operations.toLocaleString()} / 8,192</b></div>
         <div><span>Active qubits</span><b>{analysis.data.activeQubits.toLocaleString()}</b></div>
         <div><span>Logical depth estimate</span><b>{analysis.data.logicalDepthUpperBound.toLocaleString()}</b></div>
        </div>:<p role="status">{analysis.error}</p>}
        {analysis.data?.method==="partitioned-statevector"&&<p className="rq-warning">Non-Clifford entanglement uses bounded independent components (≤18 qubits each, aggregate 2^20 amplitudes). Resource checks are enforced during execution.</p>}
       </div>
       <p className="large-footnote">Exact supported families: Clifford stabilizers, separable gates, and resource-bounded non-Clifford components. Unsupported entangled circuits fail rather than returning invented results. Terminal measurements only.</p>
       <div className="large-actions">
        <button className="large-primary" onClick={run} disabled={running||!analysis.data}>{running?"Computing…":"Run quantum circuit"}</button>
        {running&&<button onClick={cancel}>Cancel computation</button>}
        <button disabled={running} onClick={()=>loadModel(draft.model==="custom"?"ghz":draft.model)}>Restore preset</button>
        <button disabled={!result||running} onClick={()=>{void exportExperiment();}}>Download reproducible JSON</button>
       </div>
       <div className="rq-worker-status" role="status">{running?"Worker: "+stage+" · bounded execution":result?"COMPLETED · "+elapsed.toFixed(1)+" ms browser job":"IDLE · ready for local computation"}</div>
       {error&&<p role="alert" className="large-error">{error}</p>}
      </section>
      <section className="large-results" aria-label="Quantum computation results">
       <div className="large-title"><div><span>02 / MEASUREMENT ANALYSIS</span><h2>Verified simulation output</h2></div></div>
       {!result?<div className="large-empty">
        <h3>Ready to calculate</h3><p>Run a validated circuit to inspect sampled output bitstrings, actual backend, exactness scope and measurement statistics.</p>
        <small>{draft.name}</small></div>:<>
        <div className="large-telemetry">
         <div><span>Method</span><b>{methodLabel(result.method)}</b></div>
         <div><span>Logical qubits</span><b>{result.backendInfo.qubitCount.toLocaleString()}</b></div>
         <div><span>Completed shots</span><b>{stats?.shots.toLocaleString()} / {result.backendInfo.shots.toLocaleString()}</b></div>
         <div><span>Computational time</span><b>{result.executionTimeMs.toFixed(1)} ms</b></div>
        </div>
        <p className="large-scope">Mathematically exact within the supported ideal circuit family. These are sampled classical simulation results, not physical QPU measurements.</p>
        {result.method==="stabilizer-tableau"&&<div className="large-metric"><span>Exact Z-basis support dimension</span>
         <b>2<sup>{result.supportRank}</sup> bitstrings</b>
         <small>Supported states each have ideal probability 2<sup>−{result.supportRank}</sup>. Very small probabilities are shown symbolically.</small>
        </div>}
        {result.method==="partitioned-statevector"&&<p className="large-scope">{result.detail}</p>}
        {result.method==="separable-state"&&<p className="large-scope">Independent two-component complex states; no general non-Clifford entangled state is claimed.</p>}
        <div className="rq-sampled-meta"><div><span>Distinct outcomes</span><b>{stats?.distinct.toLocaleString()}</b></div>
         <div><span>Sample Shannon entropy</span><b>{stats?.entropy.toFixed(3)} bits</b></div></div>
        <div className="large-outcome-header"><b>Measured outcomes</b><span>{stats?.distinct} distinct · showing {Math.min(24,stats?.distinct||0)}</span></div>
        <div className="large-outcomes">
         {stats?.rows.slice(0,24).map(([bits,count])=><button type="button" className="large-outcome" key={bits}
          title="Select full bitstring" onClick={()=>setSelectedOutcome(selectedOutcome===bits?null:bits)}>
          <code>{concise(bits)}</code><span>{count.toLocaleString()} / {result.backendInfo.shots.toLocaleString()}</span>
          <div className="large-meter"><i style={{width:100*count/result.backendInfo.shots+"%"}}/></div></button>)}
        </div>
        {selectedOutcome&&<div className="rq-selected-outcome"><strong>Selected measured output · {selectedOutcome.length} bits</strong>
         <code>{selectedOutcome}</code>
         <button onClick={()=>{void navigator.clipboard?.writeText(selectedOutcome);}}>Copy bitstring</button></div>}
        <div className="rq-inspector-actions"><button onClick={()=>setTab("graphs")}>Open scientific graphs</button>
         <button onClick={()=>{void exportExperiment();}}>Export evidence JSON</button></div>
        <p className="large-footnote">The list displays sample frequencies, not 2^n amplitudes. Sample entropy is not entanglement entropy. Noise, fidelity and hardware timing are not calibrated.</p>
       </>}
       {elapsed>0&&<p className="large-footnote">Browser job duration: {elapsed.toFixed(1)} ms, including worker start and transfer.</p>}
      </section>
     </div>}
     {tab==="models"&&<section className="rq-models" aria-label="Executable quantum research model library">
      <div className="rq-heading"><span>WORKING MATHEMATICAL TEMPLATES</span><h2>Validated circuit families</h2>
       <p>Each model generates actual OpenQASM and executes through the existing supported backends. These are ideal circuit studies, not industrial device twins or universal quantum algorithms.</p></div>
      <div className="rq-model-grid">{RESEARCH_TEMPLATES.map((m,i)=><article className="rq-model-card" key={m.id}>
       <div className="rq-model-header"><span>MODEL {String(i+1).padStart(2,"0")} / {m.category.toUpperCase()}</span>
        <b>{m.expected==="stabilizer-tableau"?"STABILIZER":m.expected==="separable-state"?"PRODUCT":"PARTITIONED"}</b></div>
       <h3>{m.name}</h3><p>{m.description}</p>
       <div className="rq-model-property"><span>Scientific use</span><strong>{m.scientificUse}</strong></div>
       <div className="rq-model-property"><span>Industry relevance</span><strong>{m.industry}</strong></div>
       <button disabled={running} onClick={()=>loadModel(m.id)}>Load executable model</button>
      </article>)}</div>
     </section>}
     {tab==="graphs"&&<QuantumResearchGraphs diagnostic={analysis.data} result={result} comparison={runComparison}/>}
     {tab==="hamiltonian"&&<HamiltonianWorkbench result={result} executedSource={executed?.source||null} currentBits={analysis.data?.bits||1000} onOpenCircuit={()=>{setTab("workbench");window.scrollTo({top:0,behavior:"auto"});}}/>}
     {tab==="equipment"&&<QuantumIndustrialCatalog/>}
     {tab==="optimization"&&<IndustrialQaoaWorkbench/>}
     {tab==="integrations"&&<IndustryIntegrations source={draft.source} shots={draft.shots} seed={draft.seed} analysis={analysis.data}/>}
     {tab==="hardware"&&<HardwareResearchBridge/>}
     {tab==="experiments"&&<div className="rq-experiments">
      <div className="rq-heading"><span>REPRODUCIBILITY / LONG-SESSION RESEARCH</span><h2>Saved circuits, job history and export</h2>
       <p>Only bounded QASM snapshots and recent run metadata persist locally. Measurement distributions are not saved to history. Export important results before leaving the page.</p></div>
      <div className="rq-experiment-actions"><button disabled={running} onClick={saveExperiment}>Save current experiment</button>
       <button disabled={running} onClick={()=>fileRef.current?.click()}>Import QASM</button>
       <button onClick={()=>download("MAH-Quantum-Research.qasm",draft.source,"text/plain")}>Download QASM</button>
       <button disabled={!result||running} onClick={()=>{void exportExperiment();}}>Download reproducible JSON</button></div>
      <div className="rq-experiment-grid">
       <section className="rq-panel"><div className="rq-panel-head"><h3>Named experiment snapshots</h3><small>{saved.length} / 12</small></div>
        <input type="search" aria-label="Search saved quantum experiments" placeholder="Search by name" value={query} onChange={e=>setQuery(e.target.value)}/>
        <div className="rq-saved-list">{saved.filter(x=>x.name.toLowerCase().includes(query.toLowerCase())).map(s=>
         <div key={s.id}><div><strong>{s.name}</strong><small>{s.n.toLocaleString()} Q · {dateLabel(s.updated)}</small></div>
          <button disabled={running} onClick={()=>loadSaved(s)}>Load</button>
          <button disabled={running} aria-label={"Delete "+s.name} onClick={()=>{
           if(confirm("Delete this local experiment snapshot?"))setSaved(v=>v.filter(x=>x.id!==s.id));
          }}>Delete</button></div>)}
         {!saved.length&&<p className="rq-placeholder">No named snapshots yet. Save the current circuit to build your local experiment library.</p>}
        </div>
       </section>
       <section className="rq-panel"><div className="rq-panel-head"><h3>Recent execution history</h3>
         <button disabled={!history.length} onClick={()=>{if(confirm("Clear local job history?"))setHistory([]);}}>Clear history</button></div>
        <div className="rq-run-log">{history.map(h=><div key={h.id}><div><strong>{h.name}</strong><small>{dateLabel(h.date)}</small></div>
         <span className={h.status==="completed"?"rq-done":"rq-stopped"}>{h.status}</span>
         <small>{h.qubits} Q · {h.shots} shots · {methodLabel(h.method)} · {h.duration.toFixed(1)} ms</small>
        </div>)}
         {!history.length&&<p className="rq-placeholder">No executions yet.</p>}
        </div>
       </section>
      </div>
      <section className="rq-panel rq-log"><div className="rq-panel-head"><h3>Execution-event log</h3>
        <button onClick={()=>setLogs([])}>Clear</button></div>
       <div role="log" aria-label="Quantum research execution log">{logs.map((x,i)=><p key={i} className={x.level}>
        <time>{new Date(x.date).toLocaleTimeString()}</time>{x.message}</p>)}</div>
      </section>
     </div>}
    </div>
   </div>
   <section className="large-explain">
    <h2>Research integrity and industrial scope</h2>
    <p>The 1000+ Qubit workspace supports exact Clifford stabilizer circuits, separable product circuits and independent bounded non-Clifford entangled components; it does not compute arbitrary 4,096-qubit universal quantum circuits. Gate graphs and Z/ZZ observables are derived from real simulated circuits and samples, not actual calibrated instrument readings.</p>
    <p>The equipment atlas documents representative quantum computing and sensing instrument families. Those instruments are not connected, commissioned, controlled or simulated as physical digital twins. Industrial use needs independently validated problem formulation, safety controls, data governance, authentication and commercial operations.</p>
   </section>
  </div>
 </Page>;
}
