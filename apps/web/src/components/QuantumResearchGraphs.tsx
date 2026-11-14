import {useMemo,useState} from "react";
import type {CircuitDiagnostic} from "../../../engine/src/studio/research";
import {measuredBit,pairCorrelation,measuredHistogramStats} from "../../../engine/src/studio/research";
import type {ScalableResult} from "../../../engine/src/studio/scalable";
import type {ScientificRunComparison} from "../../../engine/src/studio/research-comparison";
import {download} from "../services/projects";

const fmt=(n:number,digits=3)=>Number.isFinite(n)?n.toLocaleString("en-US",{maximumFractionDigits:digits}):"—";
const label=(n:number)=>"q"+n;
const BINS=32;
export function QuantumResearchGraphs({diagnostic,result,comparison}:{diagnostic:CircuitDiagnostic|null;result:ScalableResult|null;comparison?:ScientificRunComparison|null}){
 const [bitA,setBitA]=useState(0),[bitB,setBitB]=useState(1),[offset,setOffset]=useState(0);
 const stats=useMemo(()=>result?measuredHistogramStats(result.counts):null,[result]);
 const width=stats?.rows[0]?.[0].length||0;
 const a=Math.min(Math.max(0,bitA),Math.max(0,width-1));
 const b=Math.min(Math.max(0,bitB),Math.max(0,width-1));
 const marg=useMemo(()=>{
  if(!result||!width)return null;
  try{return measuredBit(result.counts,a);}catch{return null;}
 },[result,a,width]);
 const corr=useMemo(()=>{
  if(!result||!width||a===b)return null;
  try{return pairCorrelation(result.counts,a,b);}catch{return null;}
 },[result,a,b,width]);
 const page=Array.from({length:Math.max(0,Math.min(24,width-offset))},(_,i)=>offset+i);
 const maxTouch=Math.max(1,...(diagnostic?.bucketTouches||[]));
 const maxEdge=Math.max(1,...(diagnostic?.bucketEdges.map(x=>x.count)||[]));
 const circle=Array.from({length:BINS},(_,i)=>{
  const t=2*Math.PI*i/BINS-Math.PI/2;
  return{x:220+175*Math.cos(t),y:209+175*Math.sin(t)};
 });
 const exportHistogram=()=>{
  if(!stats)return;
  const file="bitstring,shots,relative_frequency\n"+stats.rows.map(([bits,n])=>
   bits+","+n+","+(n/stats.shots).toPrecision(12)).join("\n")+"\n";
  download("MAH-Quantum-Sampled-Distribution.csv",file,"text/csv");
 };
 return <div className="rq-graphs" aria-label="Quantum research analytics">
  <div className="rq-heading"><span>SCIENTIFIC VISUAL ANALYTICS</span><h2>Computed circuit structure and measurement diagnostics</h2>
   <p>Every graph below is calculated from the current parsed circuit or completed local measurement counts. Neither instrument telemetry nor entanglement entropy is inferred.</p>
  </div>
  {comparison&&<section className="rq-comparison" aria-label="Scientific run-to-run comparison">
   <div className="rq-panel-head"><div><span>REPRODUCIBILITY / INDEPENDENT RUNS</span><h3>Sampled run comparison</h3></div>
    <small>{comparison.runA.shots} vs {comparison.runB.shots} shots</small></div>
   {!comparison.comparable?<p className="rq-note">{comparison.explanation}</p>:<>
    <div className="rq-comparison-metrics">
     <div><span>Empirical total-variation distance</span><strong>{comparison.totalVariationDistance?.toFixed(5)}</strong></div>
     <div><span>Previous entropy</span><strong>{comparison.sampledEntropyA?.toFixed(3)} bits</strong></div>
     <div><span>Latest entropy</span><strong>{comparison.sampledEntropyB?.toFixed(3)} bits</strong></div>
     <div><span>Seed comparison</span><strong>{comparison.runA.seed} / {comparison.runB.seed}</strong></div>
    </div>
    <p className="rq-note">{comparison.explanation} Lower total-variation distance means the observed distributions are more alike; it is not a measurement of QPU fidelity or algorithmic superiority.</p>
   </>}
  </section>}
  <div className="rq-graph-grid">
   <section className="rq-panel" aria-label="Quantum interaction connectivity graph">
    <div className="rq-panel-head"><div><span>01 · CIRCUIT TOPOLOGY</span><h3>Interaction network</h3></div><small>32 aggregated register regions</small></div>
    {!diagnostic?<p className="rq-placeholder">Enter a valid supported circuit to see connectivity.</p>:<>
     <svg className="rq-network" viewBox="0 0 440 420" role="img" aria-label={"32 region circuit connectivity map; "+diagnostic.multiQubitGates+" multi-qubit gates"}>
      <circle cx="220" cy="209" r="176" fill="none" stroke="#2b4358"/>
      {diagnostic.bucketEdges.filter(e=>e.from!==e.to).map((e,i)=>{
       const x=circle[e.from],y=circle[e.to];
       return <line key={i} x1={x.x} y1={x.y} x2={y.x} y2={y.y}
        stroke="#75cade" strokeWidth={Math.min(6,1+5*e.count/maxEdge)} opacity={.16+.58*e.count/maxEdge}/>;
      })}
      {circle.map((c,i)=>{
       const count=diagnostic.bucketTouches[i],scale=.18+.82*count/maxTouch;
       return <g key={i}>
        <circle cx={c.x} cy={c.y} r={7+scale*5} fill={count?"#78c9de":"#1d3447"} stroke="#55778a" strokeWidth="1.1"/>
        <title>{"Region "+(i+1)+": "+count+" gate-operand references"}</title>
       </g>;
      })}
      <text x="220" y="203" textAnchor="middle" fill="#e7f2fa" fontSize="30" fontFamily="monospace">{diagnostic.qubits.toLocaleString("en-US")}</text>
      <text x="220" y="227" textAnchor="middle" fill="#9bb4c8" fontSize="11">LOGICAL QUBITS</text>
     </svg>
     <div className="rq-mini-metrics">
      <div><span>Active wires</span><strong>{fmt(diagnostic.activeQubits,0)}</strong></div>
      <div><span>Multi-qubit gates</span><strong>{fmt(diagnostic.multiQubitGates,0)}</strong></div>
      <div><span>Logical gate depth (unit cost)</span><strong>{fmt(diagnostic.logicalDepth,0)}</strong></div>
      <div><span>Interaction component</span><strong>{fmt(diagnostic.observedMaxComponent,0)} wires</strong></div>
     </div>
     <p className="rq-note">Regions are aggregated for legibility; line thickness represents counts of parsed cross-region gate references. The component size describes an interaction graph, not independently verified entanglement.</p>
    </>}
   </section>
   <section className="rq-panel" aria-label="Quantum gate distribution plot">
    <div className="rq-panel-head"><div><span>02 · CIRCUIT COMPOSITION</span><h3>Gate population</h3></div><small>exact parsed instructions</small></div>
    {!diagnostic?<p className="rq-placeholder">Gate statistics appear after successful QASM preflight.</p>:<>
     <div className="rq-bars">
      {diagnostic.gateCounts.map(({gate,count})=><div className="rq-bar" key={gate}>
       <span>{gate}</span><div><i style={{width:(100*count/diagnostic.operations)+"%"}}/></div>
       <b>{fmt(count,0)}</b>
      </div>)}
     </div>
     <div className="rq-matrix-header">Register activity / 32 equal-width regions</div>
     <div className="rq-density" role="img" aria-label="Quantum register gate operand density heatmap">
      {diagnostic.bucketTouches.map((count,i)=><span key={i} title={"Region "+(i+1)+": "+count+" references"}
       style={{background:count?"rgba(109,205,220,"+(.16+.84*count/maxTouch)+")":"#1b3041"}}/>)}
     </div>
     <div className="rq-mini-metrics">
      <div><span>Expanded ops</span><strong>{fmt(diagnostic.operations,0)} / 8,192</strong></div>
      <div><span>Measurement ops</span><strong>{fmt(diagnostic.measurements,0)}</strong></div>
      <div><span>Solver</span><strong className="rq-small-value">{diagnostic.method.replace(/-/g," ")}</strong></div>
     </div>
     <p className="rq-note">Greedy depth and counts describe the logical circuit. No device gate durations, physical connectivity, clock rates or pulse errors are assumed.</p>
    </>}
   </section>
   <section className="rq-panel" aria-label="Shot histogram and sampled outcomes">
    <div className="rq-panel-head"><div><span>03 · MEASURED DISTRIBUTION</span><h3>Shot statistics</h3></div>
     <button disabled={!stats} onClick={exportHistogram}>Export CSV</button></div>
    {!stats?<p className="rq-placeholder">Run a supported circuit to see the sampled output distribution.</p>:<>
     <div className="rq-mini-metrics">
      <div><span>Completed shots</span><strong>{fmt(stats.shots,0)}</strong></div>
      <div><span>Observed outcomes</span><strong>{fmt(stats.distinct,0)}</strong></div>
      <div><span>Sample Shannon entropy</span><strong>{fmt(stats.entropy)} bits</strong></div>
     </div>
     <div className="rq-histogram">
      {stats.rows.slice(0,16).map(([bits,n])=><div className="rq-hist-row" key={bits}>
       <code title={bits}>{bits.length>44?bits.slice(0,16)+"…"+bits.slice(-16):bits}</code>
       <div><i style={{width:(100*n/stats.shots)+"%"}}/></div>
       <span>{n} / {stats.shots}</span>
      </div>)}
     </div>
     <p className="rq-note">Displayed: up to 16 most frequent sample outcomes. The CSV export includes every observed outcome. Entropy is the plug-in entropy estimator for the finite sample, not a von Neumann/entanglement entropy.</p>
    </>}
   </section>
   <section className="rq-panel" aria-label="Z observable bit statistics and correlations">
    <div className="rq-panel-head"><div><span>04 · SHOT-DERIVED OBSERVABLES</span><h3>Bit marginals &amp; ZZ correlation</h3></div><small>empirical Z basis</small></div>
    {!stats||!width?<p className="rq-placeholder">Individual output-bit statistics appear after measurement sampling.</p>:<>
     <div className="rq-bit-controls">
      <label>Classical bit A <input aria-label="Observable bit A" type="number" min="0" max={width-1} step="1" value={bitA}
       onChange={e=>setBitA(Number(e.target.value))}/></label>
      <label>Classical bit B <input aria-label="Observable bit B" type="number" min="0" max={width-1} step="1" value={bitB}
       onChange={e=>setBitB(Number(e.target.value))}/></label>
     </div>
     {marg&&<div className="rq-mini-metrics">
      <div><span>P(c{a}=1)</span><strong>{fmt(100*marg.pOne,2)}%</strong></div>
      <div><span>Sample &lt;Z{a}&gt;</span><strong>{fmt(marg.zMean,4)}</strong></div>
      <div><span>Wilson 95% P(1) CI</span><strong>{fmt(100*marg.wilson95[0],1)}–{fmt(100*marg.wilson95[1],1)}%</strong></div>
      <div><span>Sample &lt;Z{a}Z{b}&gt;</span><strong>{corr?fmt(corr.zz,4):"Select distinct bits"}</strong></div>
      <div><span>Connected ZZ statistic</span><strong>{corr?fmt(corr.connected,4):"—"}</strong></div>
     </div>}
     <div className="rq-bit-pager"><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-24))}>Previous</button>
      <span>Classical c{offset}–c{Math.min(width-1,offset+23)}</span>
      <button disabled={offset+24>=width} onClick={()=>setOffset(Math.min(width-24,offset+24))}>Next</button></div>
     <div className="rq-bit-histogram" role="img" aria-label="Observed probability of classical output bit one">
      {page.map(i=>{
       let p=0;try{p=measuredBit(result!.counts,i).pOne;}catch{}
       return <button type="button" key={i} className={i===a?"rq-bit-one selected":"rq-bit-one"}
        title={"c"+i+": P(1) "+fmt(p*100,2)+"%"} onClick={()=>setBitA(i)}>
        <span style={{height:Math.max(2,p*100)+"%"}}/><small>{i}</small></button>;
      })}
     </div>
     <p className="rq-note">Observed Z=+1 for output 0 and −1 for output 1. ZZ and connected correlation use finite-shot counts only; they are not entanglement witnesses. Wilson score intervals approximate binomial uncertainty and remain nonzero at observed 0/1 boundaries. They do not quantify physical calibration errors.</p>
    </>}
   </section>
  </div>
 </div>;
}
