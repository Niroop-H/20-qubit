import {useCallback,useEffect,useRef,useState} from "react";
import {Page} from "./lab/Shared";
import type {ScalableResult} from "../../engine/src/studio/scalable";
import "./large-quantum.css";

type Preset="ghz"|"cluster"|"plus"|"rotations";
const sizes=[1000,1024,1536,2048,4096];
function sourceFor(n:number,preset:Preset):string{
 const lines=["OPENQASM 2.0;",'include "qelib1.inc";',"qreg q["+n+"];","creg c["+n+"];"];
 if(preset==="ghz"){
  lines.push("h q[0];");
  for(let i=1;i<n;i++)lines.push("cx q["+(i-1)+"],q["+i+"];");
 }else if(preset==="cluster"){
  lines.push("h q;");
  for(let i=1;i<n;i++)lines.push("cz q["+(i-1)+"],q["+i+"];");
 }else if(preset==="plus")lines.push("h q;");
 else lines.push("ry(pi/3) q;");
 return lines.join("\n")+"\n";
}
function concise(bits:string):string{
 if(bits.length<=72)return bits;
 return bits.slice(0,28)+"…"+bits.slice(-28);
}
export default function LargeQuantum(){
 const [n,setN]=useState(1000),[preset,setPreset]=useState<Preset>("ghz");
 const [source,setSource]=useState(()=>sourceFor(1000,"ghz"));
 const [shots,setShots]=useState(256),[seed,setSeed]=useState(42);
 const [result,setResult]=useState<ScalableResult|null>(null),[error,setError]=useState("");
 const [running,setRunning]=useState(false),[elapsed,setElapsed]=useState(0);
 const workerRef=useRef<Worker|null>(null);
 const [testName,setTestName]=useState("GHZ entanglement · 1000 qubits");
 useEffect(()=>()=>{workerRef.current?.terminate();},[]);
 const changePreset=(next:Preset,width=n)=>{
  setPreset(next);setSource(sourceFor(width,next));
  setResult(null);setError("");
  setTestName(({
   ghz:"Long-range GHZ entanglement",
   cluster:"Linear graph-state entanglement",
   plus:"Uniform Clifford superposition",
   rotations:"Separable non-Clifford rotations"
  } as Record<Preset,string>)[next]+" · "+width+" qubits");
 };
 const run=useCallback(()=>{
  if(running)return;
  setError("");setResult(null);setRunning(true);setElapsed(0);
  const started=performance.now();
  const worker=new Worker(new URL("./services/large.worker.ts",import.meta.url),{type:"module"});
  workerRef.current=worker;
  worker.onmessage=(event:MessageEvent<{result?:ScalableResult;error?:string}>)=>{
   setElapsed(performance.now()-started);
   if(event.data.error)setError(event.data.error);
   else if(event.data.result)setResult(event.data.result);
   else setError("The simulator returned no result.");
   setRunning(false);worker.terminate();workerRef.current=null;
  };
  worker.onerror=()=>{
   setElapsed(performance.now()-started);
   setRunning(false);setError("The browser worker could not execute this circuit.");
   worker.terminate();workerRef.current=null;
  };
  worker.postMessage({source,shots,seed});
 },[running,source,shots,seed]);
 const cancel=()=>{workerRef.current?.terminate();workerRef.current=null;setRunning(false);setError("Execution cancelled by operator.");};
 const counts=result?Object.entries(result.counts).sort((a,b)=>b[1]-a[1]):[];
 const countTotal=counts.reduce((a,[,v])=>a+v,0);
 return <Page eyebrow="MAH QUANTUM / COMPUTATION" title="1000+ Qubit"
   description="Exact simulation of selected large circuit families. Clifford stabilizer states and separable non-Clifford states—no exponential dense statevector allocation, no physical quantum processor.">
  <section className="large-intro" aria-label="Large quantum computing specifications">
   <div><b>1,000–4,096</b><small>Logical qubits supported</small></div>
   <div><b>8,192</b><small>Maximum expanded operations</small></div>
   <div><b>1,024</b><small>Maximum sampled shots</small></div>
   <div><b>EXACT</b><small>For supported circuit families</small></div>
  </section>
  <div className="large-grid">
   <section className="large-editor" aria-label="1000-plus circuit editor">
    <div className="large-title"><div><span>CIRCUIT CONFIGURATION</span><h2>Design an executable experiment</h2></div><span>LOCAL WORKER</span></div>
    <div className="large-fields">
     <label>Logical qubits
      <select aria-label="Large circuit qubit count" value={n} disabled={running}
       onChange={e=>{const v=Number(e.target.value);setN(v);changePreset(preset,v);}}>
       {sizes.map(v=><option key={v} value={v}>{v.toLocaleString()}</option>)}
      </select>
     </label>
     <label>Experiment preset
      <select aria-label="Large circuit preset" value={preset} disabled={running}
       onChange={e=>changePreset(e.target.value as Preset)}>
       <option value="ghz">GHZ · long-range entanglement</option>
       <option value="cluster">Linear graph state · CZ chain</option>
       <option value="plus">Hadamard superposition</option>
       <option value="rotations">Separable rotations · non-Clifford</option>
      </select>
     </label>
     <label>Measurement shots
      <select aria-label="Large circuit shots" value={shots} onChange={e=>setShots(Number(e.target.value))} disabled={running}>
       {[32,64,128,256,512,1024].map(v=><option key={v} value={v}>{v.toLocaleString()}</option>)}
      </select>
     </label>
     <label>Seed
      <input type="number" aria-label="Large circuit seed" min="0" max="4294967295" step="1" value={seed}
       onChange={e=>setSeed(Number(e.target.value))} disabled={running}/>
     </label>
    </div>
    <div className="large-source-header"><strong>Static OpenQASM subset</strong><span>Editable · {source.length.toLocaleString()} characters</span></div>
    <textarea className="large-code" aria-label="Large quantum QASM code" spellCheck={false} value={source}
     onChange={e=>{setSource(e.target.value);setResult(null);setError("");}} disabled={running}/>
    <p className="large-footnote">Supported exact backends: Clifford gates I/H/S/X/Y/Z/CX/CZ/SWAP, or arbitrary supported single-qubit gates with SWAP. Non-Clifford entangling circuits are rejected. Terminal measurements only.</p>
    <div className="large-actions">
     <button className="large-primary" onClick={run} disabled={running}>{running?"Computing…":"Run quantum circuit"}</button>
     {running&&<button onClick={cancel}>Cancel computation</button>}
     <button disabled={running} onClick={()=>changePreset(preset)}>Restore preset</button>
    </div>
    {running&&<p role="status" className="large-status">Executing state evolution and sampling in a dedicated local worker. Large circuits may take longer.</p>}
    {error&&<p role="alert" className="large-error">{error}</p>}
   </section>
   <section className="large-results" aria-label="Quantum computation results">
    <div className="large-title"><div><span>COMPUTATION ANALYSIS</span><h2>Verified simulation output</h2></div></div>
    {!result?<div className="large-empty">
     <h3>Ready to calculate</h3>
     <p>Load a supported circuit and run it. Results display measured bitstrings, execution method, exact theoretical probabilities when representable, and sampling uncertainty.</p>
     <small>{testName}</small>
    </div>:<>
     <div className="large-telemetry">
      <div><span>Method</span><b>{result.method==="stabilizer-tableau"?"Clifford stabilizer tableau":"Separable pure-state"}</b></div>
      <div><span>Logical qubits</span><b>{result.backendInfo.qubitCount.toLocaleString()}</b></div>
      <div><span>Completed shots</span><b>{countTotal.toLocaleString()} / {result.backendInfo.shots.toLocaleString()}</b></div>
      <div><span>Computational time</span><b>{result.executionTimeMs.toFixed(1)} ms</b></div>
     </div>
     <p className="large-scope">Mathematically exact within the supported circuit family. This does not represent a physical quantum processor or a hardware gate-fidelity estimate.</p>
     {result.method==="stabilizer-tableau"&&<div className="large-metric">
      <span>Exact Z-basis support dimension</span>
      <b>2<sup>{result.supportRank}</sup> bitstrings</b>
      <small>Each allowed full measurement bitstring has probability 2<sup>−{result.supportRank}</sup>. Very small probabilities are shown symbolically rather than rounded to false numerical precision.</small>
     </div>}
     {result.method==="separable-state"&&<p className="large-scope">Single-qubit complex amplitudes are propagated exactly; each output basis probability is a product of the individual qubit probabilities.</p>}
     <div className="large-outcome-header"><b>Most frequent measured outcomes</b><span>{counts.length.toLocaleString()} distinct · showing {Math.min(24,counts.length)}</span></div>
     <div className="large-outcomes">
      {counts.slice(0,24).map(([bits,count])=><div className="large-outcome" key={bits}>
       <code title={bits}>{concise(bits)}</code>
       <span>{count.toLocaleString()} / {shots.toLocaleString()}</span>
       <div className="large-meter"><i style={{width:(100*count/shots)+"%"}}/></div>
      </div>)}
     </div>
     <p className="large-footnote">The distribution table is a bounded display of sampled outcomes; it is not a complete enumeration of 2<sup>{result.backendInfo.qubitCount}</sup> states. Histogram frequencies fluctuate with the random seed.</p>
    </>}
    {elapsed>0&&<p className="large-footnote">Browser job duration: {elapsed.toFixed(1)} ms, including worker startup and transfer.</p>}
   </section>
  </div>
  <section className="large-explain">
   <h2>What the mathematical engine can and cannot do</h2>
   <p>Large Clifford circuits (including entangled GHZ and graph states) are represented exactly by a stabilizer tableau. Separable circuits with arbitrary supported one-qubit rotations are represented as products of 2-component vectors. Neither method creates 2<sup>n</sup> complex amplitudes.</p>
   <p>Circuits combining non-Clifford transformations with general entanglement may require exponential resources. This workspace refuses those workloads instead of returning an invented result. It does not claim arbitrary 4,096-qubit universal simulation, real quantum-hardware behavior, or guaranteed real-time performance.</p>
  </section>
 </Page>;
}
