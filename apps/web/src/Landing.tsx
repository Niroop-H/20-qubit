import "./lab/lab.css";
import SiteHeader from "./SiteHeader";
import ChipFabrication, {ChipCore} from "./ChipFabrication";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Play,
  Pause,
  Plus,
  Minus,
} from "lucide-react";
import "./landing.css";
import "./forged-chip.css";
import "./red-chip.css";
import { ArchitectureExperience, BellExperience } from "./LandingExperience";

function QuantumGlobe({playing, excited}:{playing:boolean;excited:boolean}) {
 const [expanded,setExpanded]=useState(false);
 const [macro,setMacro]=useState(false);
 return <div className={`landchip-scene ${macro ? "chip-macro" : ""} ${playing ? "" : "landchip-paused"} ${excited ? "landchip-active" : ""} ${expanded ? "processor-expanded" : ""}`} onPointerMove={e=>{const r=e.currentTarget.getBoundingClientRect();e.currentTarget.style.setProperty('--tilt',`${(e.clientX-r.left)/r.width*22-11}deg`);}} onPointerLeave={e=>e.currentTarget.style.setProperty('--tilt','0deg')}>
 <div className="core-environment" aria-hidden="true"><div className="core-halo halo-outer"/><div className="core-halo halo-inner"/><div className="core-halo halo-ticks"/><div className="core-nebula"/><div className="core-rays"/><svg className="core-signals" viewBox="0 0 600 520">{Array.from({length:12},(_,i)=>{const y=50+i*36;return <g key={i} style={{animationDelay:`${i*.25}s`}}><path className="signal-track" d={`M 0 ${y} H ${65+i%3*20} L 170 260 H 430 L ${515-i%3*20} ${y} H 600`}/><path className="signal-packet" style={{animationDelay:`${i*.23}s`}} d={`M 0 ${y} H ${65+i%3*20} L 170 260 H 430 L ${515-i%3*20} ${y} H 600`}/></g>;})}</svg><div className="core-readout readout-left">Q / SIM<br/><span>CONCEPT VIEW</span><i/><i/><i/><i/><i/></div><div className="core-readout readout-right">MAH / CORE<br/><span>ARCHITECTURE VIEW</span><b>⌁ ⌁ ⌁</b></div></div><div className="processor-reticle" aria-hidden="true"/><div className="landchip-orbit orbit-a"/><div className="landchip-orbit orbit-b"/>
 <span className="processor-callout callout-one">01 / CONTROL INTERFACE<i/></span><span className="processor-callout callout-two">02 / QUBIT LATTICE<i/></span>
 <div className="landchip-assembly mah-red-assembly" role="img" aria-label="MAH Quantum red circuit board with polished gold frame, ceramic contact banks, metal shield, branded emblem and two exposed die windows">
 <div className="core-underlight"/><div className="core-platform"><i/><i/><i/></div>
 <div className="processor-base"><div className="mah-cold-channels"/></div>
 <div className="processor-interposer"><div className="mah-interposer-grid"/></div>
 <div className="landchip-board"><ChipFabrication/><div className="metal-specular"/>
 <div className="landchip-package"><ChipCore/></div>
 </div></div>
 {expanded&&<div className="mah-layer-key" aria-label="Processor layers"><span><b>01</b> Shield & die windows</span><span><b>02</b> Red signal carrier</span><span><b>03</b> Contact interposer</span><span><b>04</b> Thermal foundation</span></div>}
 <button className="chip-inspect" aria-pressed={macro} onClick={()=>setMacro(!macro)}>{macro ? "− Full assembly" : "+ Inspect fabrication"}</button>
 <button className="processor-expand" onClick={()=>setExpanded(!expanded)} aria-pressed={expanded}>{expanded?'− Assemble processor':'+ Explore layers'}</button>
 </div>;
}
function ParticleField(){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const c=ref.current!,ctx=c.getContext('2d')!;let f=0,w=0,h=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const points=Array.from({length:65},()=>({x:Math.random(),y:Math.random(),vx:(Math.random()-.5)*.00013,vy:(Math.random()-.5)*.00013}));
 const resize=()=>{w=innerWidth;h=innerHeight;c.width=w;c.height=h;};resize();addEventListener('resize',resize);
 const draw=()=>{ctx.clearRect(0,0,w,h);points.forEach((p,i)=>{if(!reduced){p.x=(p.x+p.vx+1)%1;p.y=(p.y+p.vy+1)%1;}ctx.fillStyle='#7fc9ff';ctx.beginPath();ctx.arc(p.x*w,p.y*h,1.2,0,7);ctx.fill();for(let j=i+1;j<points.length;j++){const q=points[j],d=Math.hypot((p.x-q.x)*w,(p.y-q.y)*h);if(d<150){ctx.strokeStyle=`rgba(77,156,232,${(1-d/150)*.2})`;ctx.beginPath();ctx.moveTo(p.x*w,p.y*h);ctx.lineTo(q.x*w,q.y*h);ctx.stroke();}}});if(!reduced)f=requestAnimationFrame(draw);};draw();return()=>{cancelAnimationFrame(f);removeEventListener('resize',resize);};},[]);return <canvas className="particle-field" ref={ref} aria-hidden="true"/>;
}
const faqs = [
  [
    "How does workspace access work?",
    "The public website introduces the platform; the computational workspaces require authorized access. Supported simulations run locally in your browser. Commercial access terms depend on the organization.",
  ],
  [
    "Do I need to know quantum computing?",
    "Start with a Bell or GHZ example, run it, and inspect the results. The visual composer lets you build a circuit before writing any code.",
  ],
  [
    "Can I run code here?",
    "Yes. Studio compiles and runs a supported static subset of OpenQASM 2 and 3. You can also export Qiskit Python scripts for use in your own Python environment.",
  ],
  [
    "What can I build?",
    "Use the 100-logical-qubit Studio or the separate 1000+ Qubit workspace (up to 4,096 logical qubits for specified circuit families). Exact dense statevectors are limited to 20 qubits; larger circuits use restricted mathematical representations.",
  ],
];
export default function Landing() {
  const [playing, setPlaying] = useState(true),
    [excited, setExcited] = useState(true),
    [open, setOpen] = useState<number | null>(0);
  return (
    <div className="landing" id="top"><ParticleField/>
      <a className="landing-skip" href="#explore">
        Skip to content
      </a>
      <SiteHeader/>
      <main>
        <section className="land-hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="land-eyebrow">
              <span className="live-dot" /> A QUANTUM LAB. OPEN TO YOU.
            </p>
            <h1 id="hero-title" className="brand-hero-title">MAH Quantum <span className="hero-divider">-</span><br/><span>Devashri S Quantum</span></h1>
            <p className="land-intro">
              Meet the world beyond 0 and 1.
              <br />
              Build quantum circuits, write code, and see the mathematics come
              alive. All in your browser.
            </p>
            <div className="hero-actions">
              <a className="land-button" href="/studio">
                Enter the Studio <ArrowUpRight size={20} />
              </a>
              <a className="text-link" href="/1000-plus">
                1000+ Qubit workspace <span>↗</span>
              </a>
            </div>
            <p className="hero-note">
              CLASSICAL QUANTUM SIMULATION <span> / </span> CONTROLLED WORKSPACE ACCESS
            </p>
          </div>
          <div className="hero-object">
            <div className="object-heading">
              <span>01 / QUANTUM PROCESSOR</span>
              <span>
                INTERACTIVE VIEW <span className="blue-dot" />
              </span>
            </div>
            <QuantumGlobe playing={playing} excited={excited} />
            <div className="state-tag">
              {excited ? "|ψ⟩ = (|0⟩ + |1⟩) / √2" : "|ψ⟩ = |0⟩"}
              <small>QUANTUM PROCESSOR VISUALIZATION</small>
            </div>
            <div className="object-controls">
              <div>
                <button
                  className={!excited ? "active" : ""}
                  onClick={() => setExcited(false)}
                  aria-pressed={!excited}
                >
                  Idle core
                </button>
                <button
                  className={excited ? "active" : ""}
                  onClick={() => setExcited(true)}
                  aria-pressed={excited}
                >
                  Active core
                </button>
              </div>
              <button
                className="motion-button"
                onClick={() => setPlaying(!playing)}
                aria-label={
                  playing ? "Pause chip animation" : "Play chip animation"
                }
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
            </div>
            <p className="object-hint">
              MOVE YOUR POINTER. CHANGE YOUR PERSPECTIVE.
            </p>
          </div>
        </section>
        <div className="land-facts">
          <span>YOUR IDEAS. YOUR DEVICE.</span>
          <p>
            <b>100</b> logical qubits to explore
          </p>
          <p>
            <b>256</b> operations per circuit
          </p>
          <p>
            <b>LOCAL</b> device-based computation
          </p>
          <a href="/studio">
            Start experimenting <ArrowUpRight size={18} />
          </a>
        </div>

        <section className="landing-cryo"><div className="cryo-cutaway" aria-label="Five-stage dilution refrigerator cutaway"><div className="cryo-cold-glow"/><div className="cryo-stack">{[0,1,2,3,4].map(i=><div className="cryo-plate" key={i} style={{top:`${i*66}px`,left:`${i*5}%`,right:`${i*5}%`}}><span>{['300 K','50 K','4 K','800 mK','10 mK'][i]}</span></div>)}{[12,45,78].map(x=><i className="cryo-rod" key={x} style={{left:`${x}%`}}/>)}{Array.from({length:12},(_,i)=><i className="cryo-wire" key={i} style={{left:`${15+i*5}%`}}/>)}</div></div><div><span className="land-eyebrow">BEYOND THE CHIP / CRYOGENIC INFRASTRUCTURE</span><h2>The environment<br/>is part of the experiment.</h2><p>Explore five cooling stages, helium circulation, vacuum integrity, optical alignment and qubit calibration in a connected virtual laboratory.</p><a className="land-button" href="/lab">Enter the Quantum Lab Twin ↗</a></div></section>
        <ArchitectureExperience/>
        <BellExperience/>
        <section className="land-workflow" id="workflow"><div className="workspace-watermark" aria-hidden="true">ψ</div>
          <div>
            <p className="land-eyebrow">03 / THE DEVELOPMENT ENVIRONMENT</p>
            <h2>
              One workspace.<br/>
              <span>Room to go deeper.</span>
            </h2>
            <p>
              A workspace designed to follow your thinking—from the first
              experiment to the result worth keeping.
            </p>
            <a className="land-button" href="/studio">
              Find your next discovery <ArrowUpRight size={18} />
            </a>
          </div>
          <div className="workflow-list">
            {[
              [
                "01",
                "Inspect the invisible",
                "Step through your circuit. Explore amplitudes, phases, Bloch vectors, and quantum observables.",
              ],
              [
                "02",
                "Transform your circuit",
                "Optimize operations, decompose to U + CX, and explore linear connectivity with the built-in transpiler.",
              ],
              [
                "03",
                "Put theory to the test",
                "Compare ideal probabilities with sampled results. Introduce noise and observe what changes.",
              ],
              [
                "04",
                "Keep the work that matters",
                "Save projects on your device, revisit job history, and export circuits and results.",
              ],
            ].map(([n, title, body]) => (
              <article key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
                <ArrowUpRight size={22} />
              </article>
            ))}
          </div>
        </section>
        <section className="land-faq" id="questions">
          <div>
            <p className="land-eyebrow">04 / BEFORE YOU BEGIN</p>
            <h2>
              A few good
              <br />
              questions.
            </h2>
            <p>No mystery around how this works.</p>
          </div>
          <div>
            {faqs.map(([q, a], i) => (
              <article key={q}>
                <h3>
                  <button
                    aria-expanded={open === i}
                    aria-controls={"answer-" + i}
                    onClick={() => setOpen(open === i ? null : i)}
                  >
                    {q}
                    {open === i ? <Minus size={19} /> : <Plus size={19} />}
                  </button>
                </h3>
                <div id={"answer-" + i} hidden={open !== i}>
                  <p>{a}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="land-cta">
          <p className="land-eyebrow">THE NEXT STEP IS YOURS.</p>
          <h2>
            Your next idea.<br />
            A quantum beginning.
          </h2>
          <a href="/studio" className="land-button">
            Enter MAH Quantum Studio <ArrowUpRight size={22} />
          </a>
          <span className="cta-symbol" aria-hidden="true">
            ψ
          </span>
        </section>
      </main>
      <footer className="land-footer">
        <a href="/" className="land-brand">
          <img src="/mah-quantum-logo.jpg" alt="" />
          <span>
            MAH Quantum - Devashri S Quantum
          </span>
        </a>
        <p>
          Developed by Devashri S Quantum.
          <br />
          Quantum circuits. Code. Discovery.
        </p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </div>
  );
}
