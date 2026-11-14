import {useMemo,useRef,useState} from "react";
import type {ChangeEvent} from "react";
import type {ScalableResult} from "../../../engine/src/studio/scalable";
import {
 ISING_SCHEMA,isingPreset,validateIsingModel,analyzeIsingSamples,
 type IsingModel,type IsingEstimate
} from "../../../engine/src/studio/hamiltonian";
import {download} from "../services/projects";

interface Props {
 result:ScalableResult|null;
 executedSource:string|null;
 currentBits:number;
 onOpenCircuit:()=>void;
}
type Preset="chain"|"frustration"|"separation"|"custom";
const fmt=(n:number,decimal=5)=>Number.isFinite(n)?n.toLocaleString("en-US",{maximumFractionDigits:decimal}):"—";
const pct=(n:number)=>fmt(100*n,1)+"%";
const PRESETS:{key:Preset;label:string}[]=[
 {key:"chain",label:"Synthetic ferromagnetic chain"},
 {key:"frustration",label:"Synthetic frustrated triangle"},
 {key:"separation",label:"Synthetic separation penalties"},
 {key:"custom",label:"Custom JSON model"}
];
const sampleLimits=[128,256,512,1024];
const shade=(n:number)=>{
 const alpha=.13+.78*Math.abs(n);
 return n>=0?"rgba(94,202,214,"+alpha+")":"rgba(234,174,107,"+alpha+")";
};
export default function HamiltonianWorkbench({result,executedSource,currentBits,onOpenCircuit}:Props){
 const [preset,setPreset]=useState<Preset>("chain");
 const [text,setText]=useState(JSON.stringify(isingPreset("chain"),null,2));
 const [target,setTarget]=useState("0.1");
 const [message,setMessage]=useState("");
 const importRef=useRef<HTMLInputElement|null>(null);
 const measuredWidth=Object.keys(result?.counts||{})[0]?.length||currentBits;
 const validation=useMemo<{model:IsingModel|null;error:string}>(()=>{
  try{
   return{model:validateIsingModel(JSON.parse(text),measuredWidth),error:""};
  }catch(e){
   return{model:null,error:e instanceof Error?e.message:String(e)};
  }
 },[text,measuredWidth]);
 const assessed=useMemo<{estimate:IsingEstimate|null;error:string}>(()=>{
  if(!result||!validation.model)return{estimate:null,error:""};
  try{
   return{estimate:analyzeIsingSamples(validation.model,result.counts),error:""};
  }catch(e){
   return{estimate:null,error:e instanceof Error?e.message:String(e)};
  }
 },[validation.model,result]);
 const estimate=assessed.estimate;
 const targetNumber=Number(target);
 const targetValid=target.trim()!==""&&Number.isFinite(targetNumber)&&targetNumber>0&&targetNumber<=1000000;
 const recommended=estimate?.variance!==null&&estimate?.variance!==undefined&&targetValid?
  Math.max(2,Math.ceil((1.959963984540054**2)*estimate.variance/(targetNumber**2))):null;
 const changePreset=(next:Preset)=>{
  setPreset(next);
  if(next!=="custom")setText(JSON.stringify(isingPreset(next),null,2));
  setMessage("");
 };
 const changeText=(value:string)=>{setPreset("custom");setText(value);setMessage("");};
 const onImport=async(e:ChangeEvent<HTMLInputElement>)=>{
  const file=e.target.files?.[0];e.target.value="";
  if(!file)return;
  if(file.size>32768){setMessage("Import rejected: maximum 32 KiB.");return;}
  try{
   const raw=await file.text();
   validateIsingModel(JSON.parse(raw),measuredWidth);
   changeText(raw);setMessage("Model imported and validated for this classical register.");
  }catch(ex){setMessage("Import rejected: "+(ex instanceof Error?ex.message:String(ex)));}
 };
 const exportEvidence=async()=>{
  if(!estimate||!result||!executedSource)return;
  let sha256:string|null=null;
  if(globalThis.crypto?.subtle){
   try{
    const raw=await globalThis.crypto.subtle.digest("SHA-256",new TextEncoder().encode(executedSource));
    sha256=Array.from(new Uint8Array(raw),x=>x.toString(16).padStart(2,"0")).join("");
   }catch{}
  }
  const record={
   schema:"MAH-Quantum-Hamiltonian-Evidence/v1",
   computedAtUtc:new Date().toISOString(),
   engine:"classical ideal quantum circuit simulator",
   physicalQpu:false,noiseCalibrated:false,
   input:{sourceSha256:sha256,source:executedSource,method:result.method,seed:result.seed,
    requestedShots:result.backendInfo.shots,completedShots:estimate.shots},
   observation:{counts:result.counts},
   analysis:estimate,
   limitations:estimate.caveat
  };
  download("MAH-Quantum-Hamiltonian-Analysis.json",JSON.stringify(record,null,2),"application/json");
  setMessage("Exported source, actual sampled counts and reproducible analysis evidence.");
 };
 const exportTerms=()=>{
  if(!estimate)return;
  const csv="term,coefficient,observed_expectation,energy_contribution\n"+
   estimate.termEstimates.map(t=>
    '"'+t.label.replace(/"/g,'""')+'",'+t.weight+','+t.expectation+','+t.contribution
   ).join("\n")+"\n";
  download("MAH-Quantum-Ising-Terms.csv",csv,"text/csv");
  setMessage("Exported all diagonal Hamiltonian term contributions.");
 };
 const maxHist=Math.max(1,...(estimate?.histogram.map(b=>b.shots)||[]));
 const spectrum=estimate?.histogram||[];
 return <div className="rq-hamiltonian" aria-label="Hamiltonian scientific energy workbench">
  <div className="rq-heading">
   <span>09 / HAMILTONIAN &amp; OBSERVABLES</span>
   <h2>Diagonal Ising analysis laboratory</h2>
   <p>Apply a precisely defined I / Z / ZZ Hamiltonian to your <strong>actual sampled classical bitstrings</strong>. Inspect energy statistics, finite-shot uncertainty, term contributions and spin correlations. This is numerical post-processing of the executed circuit, never fabricated live hardware data.</p>
  </div>
  <div className="rq-ham-status-row">
   <div><span>COMPUTATION</span><strong>{result?"MEASURED SIMULATOR SHOTS":"NO COMPLETED RUN"}</strong><small>Classical numerical simulation</small></div>
   <div><span>CLASSICAL REGISTER</span><strong>{measuredWidth.toLocaleString("en-US")} bits</strong><small>c0 = rightmost bit</small></div>
   <div><span>MODEL PREFLIGHT</span><strong className={validation.model?"rq-ham-ok":"rq-ham-fail"}>{validation.model?"VALIDATED":"INVALID"}</strong><small>{validation.model?validation.model.fields.length+validation.model.couplings.length+" active operators":"Fix input to proceed"}</small></div>
   <div><span>OBSERVATIONS</span><strong>{estimate?estimate.shots.toLocaleString("en-US")+" shots":"No energy estimate"}</strong><small>No physical QPU connected</small></div>
  </div>
  <div className="rq-ham-layout">
   <section className="rq-panel rq-ham-model">
    <div className="rq-panel-head"><div><span>01 · MATHEMATICAL MODEL</span><h3>Configure a bounded diagonal Hamiltonian</h3></div><small>I + Σ hᵢZᵢ + Σ JᵢⱼZᵢZⱼ</small></div>
    <label className="rq-ham-label">Research model
     <select aria-label="Ising model preset" value={preset} onChange={e=>changePreset(e.target.value as Preset)}>
      {PRESETS.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}
     </select>
    </label>
    <label className="rq-ham-label">Editable model JSON · explicit classical bit indices
     <textarea aria-label="Hamiltonian model JSON" spellCheck={false} value={text} onChange={e=>changeText(e.target.value)}/>
    </label>
    <div className="rq-ham-actions">
     <button type="button" disabled={!validation.model} onClick={()=>download("MAH-Quantum-Ising-Model.json",JSON.stringify(validation.model,null,2),"application/json")}>Export model</button>
     <button type="button" onClick={()=>importRef.current?.click()}>Import JSON</button>
     <input ref={importRef} type="file" aria-label="Import Hamiltonian model JSON" accept=".json,application/json" hidden onChange={e=>{void onImport(e);}}/>
     <button type="button" onClick={onOpenCircuit}>Open circuit workbench</button>
    </div>
    {validation.error?<p role="alert" className="rq-ham-error">{validation.error}</p>:
     <div className="rq-ham-validated" role="status">Model accepted · {validation.model?.fields.length} Z fields · {validation.model?.couplings.length} ZZ couplings. Terms map to measured <strong>classical</strong> output positions, not necessarily qubit indices when explicit QASM measurement mapping is used.</div>}
    <p className="rq-note">All model examples are synthetic and dimensionless. Supply independently validated coefficients and units for a real engineering problem. This bench computes diagonal expectation values; it does not implement molecular X/Y terms, quantum chemistry or a physical annealer.</p>
   </section>
   <section className="rq-panel rq-ham-results">
    <div className="rq-panel-head"><div><span>02 · RUN-BOUND ESTIMATES</span><h3>Observable energy &amp; statistical uncertainty</h3></div><small>{result?result.method.replace(/-/g," "):"Waiting for sampled result"}</small></div>
    {assessed.error&&<p className="rq-ham-error" role="alert">{assessed.error}</p>}
    {!estimate?<div className="rq-ham-empty">
     <span>MEASUREMENT REQUIRED</span>
     <p>Run a compatible circuit in the workbench, then return here to analyze its output. Changing the circuit or shots invalidates previous results. This panel will not invent an energy value.</p>
     <button onClick={onOpenCircuit}>Configure and run circuit</button>
    </div>:<>
     <div className="rq-ham-metrics">
      <div><span>Sample mean energy</span><strong>{fmt(estimate.mean)}</strong><small>Dimensionless input coefficients</small></div>
      <div><span>Standard error</span><strong>{estimate.standardError===null?"N/A":fmt(estimate.standardError,6)}</strong><small>IID finite-shot approximation</small></div>
      <div><span>95% normal CI</span><strong>{estimate.confidence95?fmt(estimate.confidence95[0],3)+" … "+fmt(estimate.confidence95[1],3):"Not available"}</strong><small>Not hardware/systematic error</small></div>
      <div><span>Lowest energy observed</span><strong>{fmt(estimate.observedMinimum.energy)}</strong><small>Sampled candidate, not certified ground state</small></div>
     </div>
     <div className="rq-ham-plot-head"><strong>Empirical energy spectrum</strong><small>Actual outcomes · {estimate.distinctOutcomes} distinct bitstrings</small></div>
     <div className="rq-ham-spectrum" role="img" aria-label="Sample-derived energy frequency histogram">
      {spectrum.map((bin,i)=><div key={i} title={"Energy "+fmt(bin.lower,5)+" – "+fmt(bin.upper,5)+" | "+bin.shots+" shots"} className="rq-ham-bar-cell">
       <div className="rq-ham-bar-track"><i style={{height:(bin.shots?Math.max(3,100*bin.shots/maxHist):0)+"%"}}/></div>
       <small>{i%Math.max(1,Math.ceil(spectrum.length/6))===0?fmt(bin.lower,2):""}</small>
      </div>)}
     </div>
     <div className="rq-ham-legend"><span>{fmt(estimate.observedMinimum.energy)} MIN OBSERVED</span><span>{fmt(estimate.observedMaximum.energy)} MAX OBSERVED</span></div>
     <div className="rq-ham-actions">
      <button type="button" onClick={()=>{void exportEvidence();}}>Export verified-input report</button>
      <button type="button" onClick={exportTerms}>Export term CSV</button>
     </div>
    </>}
   </section>
  </div>
  {estimate&&<div className="rq-ham-layout rq-ham-secondary">
   <section className="rq-panel">
    <div className="rq-panel-head"><div><span>03 · OBSERVABLE BREAKDOWN</span><h3>Computed operator contributions</h3></div><small>Σ contributions = sample mean</small></div>
    <div className="rq-ham-table-scroll">
     <table className="rq-ham-table"><thead><tr><th scope="col">Pauli term</th><th scope="col">Weight</th><th scope="col">〈Z〉 / 〈ZZ〉</th><th scope="col">Contribution</th></tr></thead>
      <tbody>{estimate.termEstimates.map((t,i)=><tr key={i}><th scope="row">{t.label}</th><td>{fmt(t.weight)}</td><td>{fmt(t.expectation)}</td><td>{fmt(t.contribution)}</td></tr>)}</tbody>
     </table>
    </div>
    <p className="rq-note">All expectations are in the sampled computational Z basis. A term's coefficient is supplied by the operator, not inferred from equipment telemetry.</p>
   </section>
   <section className="rq-panel">
    <div className="rq-panel-head"><div><span>04 · EMPIRICAL SPIN STRUCTURE</span><h3>Z–Z expectation matrix</h3></div><small>First eight participating bits</small></div>
    <div className="rq-ham-matrix-wrap">
     <div className="rq-ham-matrix" style={{gridTemplateColumns:"repeat("+(estimate.selectedBits.length+1)+",minmax(0,1fr))"}} role="table" aria-label="Sampled Z Z expectation correlation matrix">
      <span role="columnheader">c</span>
      {estimate.selectedBits.map(bit=><span role="columnheader" key={"h"+bit}>{bit}</span>)}
      {estimate.selectedBits.map((a,i)=><div key={a} className="rq-ham-matrix-row" style={{display:"contents"}}>
       <span role="rowheader">{a}</span>
       {estimate.selectedBits.map((b,j)=><span key={b} role="cell" title={"E[Z(c"+a+")Z(c"+b+")] = "+estimate.zzMatrix[i][j].toFixed(6)}
        style={{background:shade(estimate.zzMatrix[i][j])}}>{fmt(estimate.zzMatrix[i][j],2)}</span>)}
      </div>)}
     </div>
    </div>
    <div className="rq-ham-key"><span>Negative = amber</span><span>Zero = neutral</span><span>Positive = cyan</span></div>
    <p className="rq-note">This is an observed Z–Z moment matrix, not a covariance matrix or an entanglement witness. If the model includes more than eight bits, exports still include all energy terms.</p>
   </section>
  </div>}
  <section className="rq-panel rq-ham-planning">
   <div className="rq-panel-head"><div><span>05 · EXPERIMENT DESIGN</span><h3>Shot-budget and precision planner</h3></div><small>Finite-shot statistical planning</small></div>
   <label className="rq-ham-label">Desired 95% confidence half-width (energy units)
    <input aria-label="Target energy precision" type="number" min="0.000001" step="0.01" value={target} onChange={e=>setTarget(e.target.value)}/>
   </label>
   {!targetValid&&<p role="alert" className="rq-ham-error">Enter a finite positive target not exceeding 1,000,000.</p>}
   {estimate&&targetValid&&<div className="rq-ham-shot-plan">
    {sampleLimits.map(shots=><div key={shots}><span>{shots.toLocaleString("en-US")} shots</span>
     <strong>{estimate.variance===null?"N/A":"± "+fmt(1.959963984540054*Math.sqrt(estimate.variance/shots),5)}</strong>
     <small>Projected 95% half-width</small></div>)}
    <div><span>Estimated target</span><strong>{recommended===null?"N/A":recommended.toLocaleString("en-US")+" shots"}</strong>
     <small>{recommended!==null&&recommended>1024?"Above local 1,024-shot limit":"Based on observed variance"}</small></div>
   </div>}
   <p className="rq-note">Projection assumes future independent, identically distributed samples from the same ideal distribution and stable sample variance. It is not a guaranteed precision, a readout mitigation model or a claim about physical experimental uncertainty.</p>
  </section>
  {message&&<p role="status" className="rq-ham-feedback">{message}</p>}
  <div className="rq-ham-footer">
   <strong>SCIENTIFIC LIMITATIONS</strong>
   <span>Ideal classical simulator · diagonal I/Z/ZZ only · finite-shot statistics · no hardware QPU · no real plant actuation · no ground-state or industrial process guarantee</span>
  </div>
 </div>;
}
