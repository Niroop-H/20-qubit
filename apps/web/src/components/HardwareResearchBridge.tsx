import {useMemo,useState} from "react";
import type {ChangeEvent} from "react";
import {download} from "../services/projects";

type Reading={channel:string;value:number;unit:string;source:string;register?:number};
type Snapshot={
 schema:"MAH-Quantum-Hardware-Snapshot/v1";
 recordedAtUtc:string;
 hardwareConnected:boolean;
 calibrated:boolean;
 limitations?:string;
 device:{deviceId:string;class:string;transport:string;identityVerified:boolean;idn?:string};
 measurements:Reading[];
 attestation?:{algorithm:string;digest:string;scope:string};
};
const DRIVERS=[
 {name:"SCPI / TCP",status:"Implemented",summary:"Explicit configured private IP · identity check · bounded numeric instrument queries",controls:"One qualified analyzer sweep, gated locally by approvals and physical interlocks"},
 {name:"Modbus / TCP",status:"Implemented · read-only",summary:"Read-only FC03 configured holding registers · numeric scaling · no network scans",controls:"No Modbus coil, setpoint or actuator writes"},
 {name:"OPC UA",status:"Not implemented",summary:"Requires vendor-validated secure endpoint, certificate trust and data map",controls:"No OPC UA read/write client yet"},
 {name:"USB / VISA",status:"Not implemented",summary:"Requires approved vendor VISA runtime and per-instrument drivers",controls:"No USB or GPIB hardware adapter yet"},
 {name:"PLC / SCADA",status:"Not implemented",summary:"Requires site-specific safety and process automation architecture",controls:"No PLC or process-control commands"}
];
const COMMANDS=[
 "# Execute on an isolated customer OT workstation, not in Vercel",
 "python sdk/python/hardware_cli.py detect-scpi --config scpi-devices.json",
 "python sdk/python/hardware_cli.py capture-scpi --config scpi-devices.json --device spectrum-1 --output hardware-snapshot.json",
 "python sdk/python/hardware_cli.py prepare-job --snapshot hardware-snapshot.json --channel marker_level --scale 0.01 --offset 0 --job-id pilot-001 --output research-job.json",
 "python sdk/python/hardware_cli.py submit --job research-job.json --base-url https://YOUR-APPROVED-DOMAIN.example --output research-evidence.json"
].join("\n");
function parseSnapshot(raw:unknown):Snapshot{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Expected equipment JSON object.");
 const x=raw as Record<string,unknown>;
 if(x.schema!=="MAH-Quantum-Hardware-Snapshot/v1"||x.hardwareConnected!==true)
  throw Error("Unsupported snapshot or incomplete edge acquisition.");
 const d=x.device as Snapshot["device"];
 if(!d||typeof d.deviceId!=="string"||d.deviceId.length>64||
  typeof d.transport!=="string"||typeof d.identityVerified!=="boolean")
  throw Error("No valid hardware source descriptor.");
 if(typeof x.recordedAtUtc!=="string"||!Number.isFinite(Date.parse(x.recordedAtUtc)))
  throw Error("Invalid timestamp.");
 if(!Array.isArray(x.measurements)||x.measurements.length<1||x.measurements.length>16)
  throw Error("Expected 1–16 approved numerical readouts.");
 const measurements=x.measurements.map((v:unknown)=>{
  const m=v as Reading;
  if(!m||typeof m.channel!=="string"||m.channel.length>64||
   typeof m.value!=="number"||!Number.isFinite(m.value)||
   typeof m.unit!=="string"||m.unit.length>32||typeof m.source!=="string")
   throw Error("Invalid measurement or units.");
  return m;
 });
 const auth=x.attestation as Snapshot["attestation"];
 if(auth!==undefined&&(!auth||auth.algorithm!=="HMAC-SHA256"||
  typeof auth.digest!=="string"||!/^[a-f0-9]{64}$/.test(auth.digest)))
  throw Error("Malformed edge HMAC format.");
 return{schema:"MAH-Quantum-Hardware-Snapshot/v1",hardwareConnected:true,
  calibrated:x.calibrated===true,recordedAtUtc:x.recordedAtUtc,
  device:d,measurements,limitations:typeof x.limitations==="string"?x.limitations:"",
  ...(auth?{attestation:auth}:{})};
}
export default function HardwareResearchBridge(){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [error,setError]=useState("");
 const [selected,setSelected]=useState("");
 const [scale,setScale]=useState(.01),[offset,setOffset]=useState(0);
 const [message,setMessage]=useState("");
 const [filter,setFilter]=useState("All");
 const drivers=useMemo(()=>DRIVERS.filter(x=>filter==="All"||x.name.startsWith(filter)),[filter]);
 const ingest=async(e:ChangeEvent<HTMLInputElement>)=>{
  const file=e.target.files?.[0];e.target.value="";
  if(!file)return;
  if(file.size>65536){setError("Snapshot preview limited to 64 KiB.");setSnapshot(null);return;}
  try{
   const data=parseSnapshot(JSON.parse(await file.text()));
   setSnapshot(data);setSelected(data.measurements[0].channel);setError("");setMessage("");
  }catch(err){setSnapshot(null);setError(err instanceof Error?err.message:"Invalid snapshot.");}
 };
 const row=snapshot?.measurements.find(m=>m.channel===selected);
 const angle=row?scale*row.value+offset:NaN;
 const angleValid=Number.isFinite(angle)&&Math.abs(angle)<=2*Math.PI;
 const preview=()=>{
  if(!angleValid)return;
  const qasm="OPENQASM 2.0;\nqreg q[1000];\ncreg c[1000];\nry("+angle.toPrecision(17)+") q[0];\n";
  download("exploratory-instrument-parameter.qasm",qasm,"text/plain");
  setMessage("Exploratory QASM exported. For authenticated real sensor inputs, use the edge CLI to verify the HMAC before submitting.");
 };
 return <div className="rq-hardware">
  <div className="rq-heading"><span>PHYSICAL EQUIPMENT / SCIENTIFIC EDGE</span>
   <h2>Connect industrial instruments with quantum research</h2>
   <p>Physical hardware is accessed on a customer-operated edge host. The browser displays imported acquisition evidence; it never sends direct control commands to industrial machines.</p></div>
  <div className="rq-hardware-flow">
   <div><strong>01 / Instruments</strong><small>Configured SCPI or Modbus device</small></div>
   <div><strong>02 / Local gateway</strong><small>Approved endpoint and numeric readings</small></div>
   <div><strong>03 / Integrity</strong><small>Timestamp + signed hardware snapshot</small></div>
   <div><strong>04 / Quantum analysis</strong><small>Bounded ideal circuit via research API</small></div>
  </div>
  <section className="rq-panel rq-hardware-safety">
   <div className="rq-panel-head"><div><span>PHYSICAL EQUIPMENT SAFETY</span><h3>Interlocks are independent of the quantum engine</h3></div></div>
   <p>The only physically active operation currently implemented is an explicitly approved single analyzer sweep. It requires independent verified operator identity, an equipment interlock, a signed short-lived authorization, and persistent anti-replay records. PLC writes, manufacturing actuation, lasers, cryogenics and arbitrary instrument instructions remain disabled.</p>
  </section>
  <div className="rq-hardware-cols">
   <section className="rq-panel">
    <div className="rq-panel-head"><div><span>01 / DRIVER COVERAGE</span><h3>Supported physical connection families</h3></div></div>
    <label className="rq-integration-label">Connection family
     <select aria-label="Hardware protocol filter" value={filter} onChange={e=>setFilter(e.target.value)}>
      {["All","SCPI","Modbus","OPC","USB","PLC"].map(x=><option key={x}>{x}</option>)}
     </select></label>
    <div className="rq-hardware-drivers">{drivers.map(d=><details key={d.name}>
     <summary><strong>{d.name}</strong><small>{d.status}</small></summary>
     <p>{d.summary}</p><p>Control scope: {d.controls}</p>
    </details>)}</div>
   </section>
   <section className="rq-panel">
    <div className="rq-panel-head"><div><span>02 / LOCAL EDGE SETUP</span><h3>Hardware acquisition → signed quantum job</h3></div>
     <button onClick={()=>{void navigator.clipboard.writeText(COMMANDS).then(()=>setMessage("Edge commands copied."),()=>setMessage("Clipboard unavailable."));}}>Copy</button></div>
    <p className="rq-note">Configure only approved private IP addresses on an isolated customer-controlled edge host. No network-wide discovery or browser-held API credentials.</p>
    <pre className="rq-integration-code"><code>{COMMANDS}</code></pre>
    <p className="rq-note">Two distinct server-only secrets are required: MAH_QUANTUM_EDGE_HMAC_KEY for measurement integrity and MAH_QUANTUM_INDUSTRY_API_KEY for quantum API access.</p>
   </section>
  </div>
  <section className="rq-panel">
   <div className="rq-panel-head"><div><span>03 / MEASUREMENT EVIDENCE</span><h3>Explore recorded sensor readouts</h3></div>
    <small>Offline imported evidence · not live connectivity</small></div>
   <label className="rq-integration-label">Import edge snapshot JSON
    <input aria-label="Import physical equipment snapshot" type="file" accept=".json,application/json" onChange={e=>{void ingest(e);}}/></label>
   {error&&<p className="rq-integration-error" role="alert">{error}</p>}
   {!snapshot?<p className="rq-placeholder">Import a snapshot produced by the installed OT gateway. The edge CLI verifies the signature and freshness; this browser preview intentionally does not handle the signing secret.</p>:<>
    <div className="rq-hardware-summary">
     <div><span>Configured device</span><strong>{snapshot.device.deviceId}</strong></div>
     <div><span>Recorded at</span><strong>{snapshot.recordedAtUtc}</strong></div>
     <div><span>Transport</span><strong>{snapshot.device.transport}</strong></div>
     <div><span>Edge-reported identity</span><strong>{snapshot.device.identityVerified?"SCPI ID checked":"No independent identity (Modbus)"}</strong></div>
    </div>
    <p className="rq-hardware-caution">The imported file {snapshot.attestation?"includes":"does not include"} an HMAC attestation, but its authenticity is NOT verified in this browser. An imported snapshot is not a current connection, calibrated measurement, or physical safety authorization.</p>
    <div className="rq-hardware-measurements">{snapshot.measurements.map((m,i)=><div key={i}>
     <span>{m.channel}</span><strong>{m.value.toLocaleString("en-US",{maximumFractionDigits:9})} {m.unit}</strong>
     <small>{m.source}{m.register!==undefined?" · register "+m.register:""}</small></div>)}</div>
    <div className="rq-hardware-map">
     <h3>Preview: telemetry-to-circuit mapping</h3><p className="rq-note">θ = scale × measurement + offset. A mathematical example only; sensor calibration and its engineering meaning must be separately validated.</p>
     <div className="rq-hardware-fields">
      <label>Measurement <select aria-label="Hardware measurement channel" value={selected} onChange={e=>setSelected(e.target.value)}>
       {snapshot.measurements.map((m,i)=><option key={i} value={m.channel}>{m.channel}</option>)}</select></label>
      <label>Scale <input aria-label="Hardware mapping scale" type="number" step=".001" value={scale} onChange={e=>setScale(Number(e.target.value))}/></label>
      <label>Offset <input aria-label="Hardware mapping offset" type="number" step=".001" value={offset} onChange={e=>setOffset(Number(e.target.value))}/></label>
     </div>
     <p className="rq-note">Rotation angle: {angleValid?angle.toPrecision(9)+" rad":"outside allowed ±2π range"}</p>
     <button onClick={preview} disabled={!angleValid}>Download exploratory QASM</button>
     <p className="rq-note">To produce a trusted quantum job, run the signed snapshot through the edge CLI, not this preview.</p>
    </div>
   </>}
   {message&&<p role="status" className="rq-note">{message}</p>}
  </section>
 </div>;
}
