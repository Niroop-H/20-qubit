import {useEffect,useMemo,useRef,useState} from "react";
import {validateIndustrialGraph,type IndustrialGraph,type IndustrialOptimizationResult} from "../../../engine/src/studio/industrial";
import {SCENARIOS,type Scenario} from "../services/industrial-research-examples";
import {download} from "../services/projects";
type WorkerResponse={result?:IndustrialOptimizationResult;error?:string};
const fmt=(x:number,d=3)=>Number(x).toLocaleString("en-US",{maximumFractionDigits:d});
const money=(x:number)=>fmt(x,2);
const maxMs=30000;
function groups(assignment:string,graph:IndustrialGraph){
 const a:string[]=[],b:string[]=[];
 for(let i=0;i<graph.nodes.length;i++){
  (assignment[assignment.length-1-i]==="1"?b:a).push(graph.nodes[i]);
 }
 return{a,b};
}
function GraphPlot({graph,assignment}:{graph:IndustrialGraph;assignment?:string}){
 const n=graph.nodes.length,positions=graph.nodes.map((_,i)=>{
  const a=2*Math.PI*i/n-Math.PI/2;return{x:200+153*Math.cos(a),y:194+145*Math.sin(a)};
 });
 const largest=Math.max(...graph.edges.map(x=>x.weight));
 return <svg className="rq-opt-map" viewBox="0 0 400 390" role="img"
  aria-label={"Weighted undirected graph with "+n+" decision nodes and "+graph.edges.length+" edges"}>
  <circle cx="200" cy="194" r="155" fill="none" stroke="#304a5d" strokeDasharray="3 7"/>
  {graph.edges.map((e,i)=><g key={i}>
   <line x1={positions[e.source].x} y1={positions[e.source].y} x2={positions[e.target].x} y2={positions[e.target].y}
    stroke={assignment&&assignment[n-1-e.source]!==assignment[n-1-e.target]?"#d6bb84":"#4587a1"}
    strokeWidth={1.2+3.2*e.weight/largest} opacity=".7"/>
   <title>{"Edge "+graph.nodes[e.source]+" ↔ "+graph.nodes[e.target]+": weight "+e.weight}</title>
  </g>)}
  {positions.map((p,i)=><g key={i}>
   <circle cx={p.x} cy={p.y} r="17" fill={assignment?(assignment[n-1-i]==="1"?"#285b66":"#826f48"):"#173e56"}
    stroke={assignment?"#d5caab":"#7cc8de"} strokeWidth="1.6"/>
   <text x={p.x} y={p.y+4} textAnchor="middle" fontSize="12" fill="#ecf5ff" fontWeight="600">{i}</text>
   <title>{graph.nodes[i]+(assignment?" · group "+(assignment[n-1-i]==="1"?"B":"A"):"")}</title>
  </g>)}
  <text x="200" y="367" textAnchor="middle" fill="#9db7c9" fontSize="11">
   {assignment?"Gold and teal nodes are the selected bipartition":"Node labels and edge weights map to the JSON model"}
  </text>
 </svg>;
}
export default function IndustrialQaoaWorkbench(){
 const [scenario,setScenario]=useState<Scenario|"custom">("manufacturing");
 const [source,setSource]=useState(JSON.stringify(SCENARIOS.manufacturing,null,2));
 const [shots,setShots]=useState(512),[seed,setSeed]=useState(2026);
 const [result,setResult]=useState<IndustrialOptimizationResult|null>(null);
 const [error,setError]=useState(""),[running,setRunning]=useState(false);
 const [origin,setOrigin]=useState("Synthetic example — not operational data");
 const worker=useRef<Worker|null>(null),timeout=useRef<ReturnType<typeof setTimeout>|null>(null);
 const importInput=useRef<HTMLInputElement|null>(null);
 useEffect(()=>()=>{worker.current?.terminate();if(timeout.current!==null)clearTimeout(timeout.current);},[]);
 const validation=useMemo(()=>{
  try{return{graph:validateIndustrialGraph(JSON.parse(source)),error:""};}
  catch(e){return{graph:null,error:e instanceof Error?e.message:String(e)};}
 },[source]);
 const clear=()=>{setResult(null);setError("");};
 const load=(next:Scenario)=>{
  setScenario(next);setSource(JSON.stringify(SCENARIOS[next],null,2));setOrigin("Synthetic reference model");clear();
 };
 const loadFile=async(file:File|undefined)=>{
  if(!file||running)return;
  if(file.size>48*1024){setError("Graph files must not exceed 48 KiB.");return;}
  try{
   const graph=validateIndustrialGraph(JSON.parse(await file.text()));
   setSource(JSON.stringify(graph,null,2));setOrigin("User-provided local JSON file");setScenario("custom");clear();
  }catch(e){setError("Graph import rejected: "+(e instanceof Error?e.message:String(e)));}
 };
 const run=()=>{
  if(running||worker.current)return;
  if(!validation.graph){setError(validation.error);return;}
  const graph=validation.graph;
  setResult(null);setError("");setRunning(true);
  let w:Worker;
  try{w=new Worker(new URL("../services/industrial-research.worker.ts",import.meta.url),{type:"module"});}
  catch{setRunning(false);setError("Unable to start the local optimization worker.");return;}
  worker.current=w;
  const finish=(msg:WorkerResponse)=>{
   if(worker.current!==w)return;
   worker.current=null;if(timeout.current!==null)clearTimeout(timeout.current);
   timeout.current=null;w.terminate();setRunning(false);
   if(msg.result)setResult(msg.result);
   else setError(msg.error||"No computation result was returned.");
  };
  w.onmessage=(e:MessageEvent<WorkerResponse>)=>finish(e.data);
  w.onerror=()=>finish({error:"The local optimization worker encountered an error."});
  w.onmessageerror=()=>finish({error:"The worker returned an unreadable result."});
  timeout.current=setTimeout(()=>finish({error:"The industrial QAOA run exceeded its 30-second local execution budget."}),maxMs);
  try{w.postMessage({graph,shots,seed});}catch{finish({error:"Unable to transfer the industrial graph."});}
 };
 const cancel=()=>{
  if(!worker.current)return;
  worker.current.terminate();worker.current=null;
  if(timeout.current!==null)clearTimeout(timeout.current);timeout.current=null;
  setRunning(false);setError("Optimization cancelled by operator.");
 };
 const exportResult=async()=>{
  if(!result||running)return;
  const canonical=JSON.stringify(result.graph);
  const sha256=crypto?.subtle?await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical))
   .then(buf=>Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,"0")).join("")).catch(()=>null):null;
  const evidence={schema:"MAH-Quantum-Industrial-Optimization-Evidence/v1",
   recordedAtUtc:new Date().toISOString(),inputSha256:sha256,
   inputDigestDefinition:"SHA-256 over JSON.stringify(result.graph) in UTF-8",
   inputProvenance:origin,exactGlobalReference:true,
   report:result,
   notice:"Ideal small-variable QAOA simulation on a classical computer; no quantum advantage or industrial operating certification."};
  download("MAH-Quantum-Industrial-QAOA-Evidence.json",JSON.stringify(evidence,null,2),"application/json");
 };
 const best=result?groups(result.quantum.bestSampleAssignment,result.graph):null;
 const values:[string,number][]=result?[["Classical global optimum",result.classical.optimum],
  ["Classical greedy",result.classical.greedyScore],
  ["QAOA exact expectation",result.quantum.expectedScore],
  ["Best QAOA sample",result.quantum.bestSampleScore]]:[] as [string,number][];
 return <div className="rq-opt" aria-label="Industrial optimization QAOA research workbench">
  <div className="rq-heading"><span>BOUNDARY-VALIDATED INDUSTRIAL RESEARCH MODEL</span>
   <h2>Weighted graph optimization · quantum versus classical</h2>
   <p>Define a weighted separation problem, run a genuine ideal QAOA circuit and compare its objective with the independently enumerated classical optimum. <strong>This companion model uses 2–10 qubits, not the 1,000+ large-circuit solver.</strong></p>
  </div>
  <div className="rq-opt-capabilities">
   <div><strong>2–10 Q</strong><span>decision variables</span></div>
   <div><strong>p = 1</strong><span>QAOA ansatz</span></div>
   <div><strong>EXACT</strong><span>classical optimum</span></div>
   <div><strong>1,024</strong><span>max sampled shots</span></div>
  </div>
  <div className="rq-opt-columns">
   <section className="rq-panel rq-opt-config" aria-label="Industrial optimization model inputs">
    <div className="rq-panel-head"><div><span>01 / INPUT MODEL</span><h3>Define a weighted partition</h3></div><small>{origin}</small></div>
    <p className="rq-note">The modeled objective is the sum of positive weighted edges crossing between two groups. No additional industrial capacity, safety or timing constraints are modeled.</p>
    <label className="rq-opt-label">Synthetic reference scenario
     <select aria-label="Industrial optimization scenario" value={scenario} disabled={running}
      onChange={e=>load(e.target.value as Scenario)}>
      <option value="manufacturing">Manufacturing activity separation</option>
      <option value="energy">Energy network segmentation</option>
      <option value="computing">Compute-job interference</option>
      <option value="custom" disabled>Custom customer model</option>
     </select></label>
    <label className="rq-opt-label">Weighted graph JSON
     <textarea aria-label="Industrial optimization graph JSON" value={source} spellCheck={false} disabled={running}
      onChange={e=>{setSource(e.target.value);setScenario("custom");setOrigin("Custom edited graph");clear();}}/></label>
    <div className="rq-opt-buttons">
     <button type="button" disabled={running} onClick={()=>importInput.current?.click()}>Import graph JSON</button>
     <input ref={importInput} hidden aria-label="Import industrial weighted graph JSON file" type="file" accept=".json,application/json"
      onChange={e=>{const file=e.target.files?.[0];e.target.value="";void loadFile(file);}}/>
     <button type="button" onClick={()=>download("MAH-Quantum-Industrial-Graph.json",source,"application/json")}>Export graph JSON</button>
    </div>
    {validation.graph?<p className="rq-opt-valid">Validated: {validation.graph.nodes.length} decision nodes · {validation.graph.edges.length} weighted edges</p>:
     <p className="rq-opt-invalid" role="status">Input review: {validation.error}</p>}
    <div className="rq-opt-parameters">
     <label className="rq-opt-label">Measurement shots
      <select aria-label="Industrial QAOA shots" value={shots} disabled={running} onChange={e=>{setShots(Number(e.target.value));clear();}}>
       {[128,256,512,1024].map(v=><option value={v} key={v}>{fmt(v,0)}</option>)}
      </select>
     </label>
     <label className="rq-opt-label">Random seed
      <input aria-label="Industrial QAOA seed" type="number" min={0} max={4294967295} step={1}
       value={seed} disabled={running} onChange={e=>{setSeed(Number(e.target.value));clear();}}/>
     </label>
    </div>
    <div className="rq-opt-buttons rq-opt-run">
     <button className="rq-opt-primary" disabled={running||!validation.graph} onClick={run}>{running?"Optimizing…":"Run QAOA and classical reference"}</button>
     {running&&<button onClick={cancel}>Cancel</button>}
     <button disabled={!result||running} onClick={()=>{void exportResult();}}>Download evidence JSON</button>
    </div>
    {running&&<p className="rq-opt-valid" role="status">Computing locally in an isolated worker. Hard limit: 30 seconds.</p>}
    {error&&<p className="rq-opt-invalid" role="alert">{error}</p>}
   </section>
   <section className="rq-panel rq-opt-analysis" aria-label="Industrial optimization visualization">
    <div className="rq-panel-head"><div><span>02 / MATHEMATICAL GRAPH</span><h3>Weighted interaction network</h3></div><small>Ideal research graph · not plant telemetry</small></div>
    {validation.graph?<GraphPlot graph={validation.graph} assignment={result?.quantum.bestSampleAssignment}/>:
     <p className="rq-placeholder">A validated graph is required to display its topology.</p>}
    {result&&best&&<>
     <div className="rq-opt-partitions">
      <div><span>Selected group A</span>{best.a.map(n=><b key={n}>{n}</b>)}</div>
      <div><span>Selected group B</span>{best.b.map(n=><b key={n}>{n}</b>)}</div>
     </div>
     <p className="rq-note">The colors show the best sampled partition, not a prescribed real-world equipment configuration.</p>
    </>}
   </section>
  </div>
  <section className="rq-panel rq-opt-results" aria-label="Industrial optimization comparisons">
   <div className="rq-panel-head"><div><span>03 / ENGINEERING EVIDENCE</span><h3>Quantum/classical benchmark and reproducibility</h3></div>
    {result&&<small>Seed {result.settings.seed} · {result.execution.completedShots} observed shots</small>}</div>
   {!result?<p className="rq-placeholder">Run a validated example to reveal the exact classical optimum, greedy baseline, real ideal QAOA expectation, sampling distribution, and comparison ratios.</p>:
    <div className="rq-opt-results-grid">
     <div className="rq-opt-comparisons">
      {values.map(([name,value])=><div key={name} className="rq-opt-comp">
       <div><span>{name}</span><b>{money(value)}</b></div>
       <div><i style={{width:Math.max(0,100*value/result.classical.optimum)+"%"}}/></div>
      </div>)}
     </div>
     <div className="rq-opt-metrics">
      <div><span>QAOA expectation / exact optimum</span><strong>{fmt(result.quantum.approximationRatio*100,2)}%</strong></div>
      <div><span>P(sampled optimum)</span><strong>{fmt(result.quantum.optimalOutcomeProbability*100,2)}%</strong></div>
      <div><span>QAOA γ / β</span><strong>{fmt(result.quantum.gamma,4)} / {fmt(result.quantum.beta,4)}</strong></div>
      <div><span>Angle evaluations</span><strong>{result.settings.parametersEvaluated}</strong></div>
      <div><span>Statevector memory</span><strong>{fmt(result.execution.statevectorBytes/1024,1)} KiB</strong></div>
      <div><span>Local duration</span><strong>{fmt(result.execution.durationMs,1)} ms</strong></div>
     </div>
     <section className="rq-opt-landscape" aria-label="QAOA beta gamma objective parameter landscape">
      <div className="rq-opt-landscape-head"><div><span>04 / VARIATIONAL PARAMETER LANDSCAPE</span>
       <h3>Evaluated γ–β response surface</h3>
       <p>Each cell is the exact ideal QAOA expectation calculated at a tested parameter pair, not a fabricated or hardware-calibrated visualization.</p></div>
       <button type="button" onClick={()=>{
        const rows="gamma_rad,beta_rad,expected_cut_score\n"+
         result.landscape.samples.map(p=>p.gamma+","+p.beta+","+p.expectedScore).join("\n")+"\n";
        download("MAH-Quantum-QAOA-Parameter-Landscape.csv",rows,"text/csv");
       }}>Export landscape CSV</button>
      </div>
      <div className="rq-opt-heatmap-scroll"><div className="rq-opt-heatmap"
       role="img" aria-label="Exact calculated QAOA expectation heatmap over 36 gamma values across three scales and 9 beta values"
       style={{gridTemplateColumns:"repeat("+result.landscape.gammaPoints+",minmax(0,1fr))"}}>
       {Array.from({length:result.landscape.betaPoints},(_,j)=>Array.from({length:result.landscape.gammaPoints},(_,i)=>{
        const point=result.landscape.samples[i*result.landscape.betaPoints+j];
        const ratio=Math.min(1,Math.max(0,point.expectedScore/result.classical.optimum));
        return <span key={i+":"+j} title={"γ="+fmt(point.gamma,5)+" rad; β="+fmt(point.beta,5)+" rad; expected cut="+fmt(point.expectedScore,6)}
         style={{background:"rgba(109,216,225,"+(.12+.86*ratio)+")"}}/>;
       }))}
      </div></div>
      <div className="rq-opt-heatmap-legend"><span>β: 0 → π/2 (vertical)</span><span>γ: three scales up to {fmt(result.landscape.gammaMax,4)} rad (horizontal)</span>
       <span>{result.landscape.samples.length} exact sampled parameter pairs</span></div>
      <p className="rq-note">This displays three coarse 12 × 9 gamma-scale grids (324 actual evaluations) used by the solver. The final reported angles may improve after local refinement and need not coincide with the best heatmap cell. Parameter performance is not a benchmark against real quantum hardware.</p>
     </section>
     <details className="rq-opt-outcomes"><summary>Inspect complete sampled outcomes ({result.quantum.outcomes.length} observed)</summary>
      <div role="table" aria-label="QAOA sampled assignment statistics"><div className="rq-opt-outcome-header"><span>Assignment</span><span>Shots</span><span>Cut score</span><span>Ideal probability</span></div>
       {result.quantum.outcomes.map(row=><div key={row.bits} className="rq-opt-outcome-row">
        <code>{row.bits}</code><span>{row.count}</span><span>{fmt(row.score,3)}</span><span>{fmt(row.idealProbability*100,3)}%</span>
       </div>)}
      </div>
     </details>
    </div>}
   <p className="rq-note">No quantum computational advantage is claimed. Global optimum is computed by full classical enumeration for these small problems. This mathematical model is not a real scheduling, power-grid protection, routing or manufacturing control system. Angles are selected by bounded search, not a guarantee of variational optimality.</p>
  </section>
 </div>;
}
