import {useMemo,useState} from "react";
import {EQUIPMENT,PLATFORMS,APPLICATIONS,type EquipmentPlatform} from "../services/quantum-equipment";
export default function QuantumIndustrialCatalog(){
 const [platform,setPlatform]=useState<EquipmentPlatform|"All">("All");
 const [query,setQuery]=useState("");
 const [section,setSection]=useState<"equipment"|"applications">("equipment");
 const filtered=useMemo(()=>EQUIPMENT.filter(e=>
  (platform==="All"||e.platform===platform)&&
  [e.name,e.function,e.category,e.platform,e.useCase].join(" ").toLowerCase().includes(query.toLowerCase())
 ),[platform,query]);
 return <div className="rq-catalog" aria-label="Quantum industrial and scientific equipment reference catalog">
  <div className="rq-heading"><span>SCIENTIFIC INSTRUMENT &amp; APPLICATION ATLAS</span><h2>Quantum research equipment and industrial workflow reference</h2>
   <p>Explore instrument families across quantum computing and sensing, with scientific inputs, measured quantities, industrial applications, engineering validation and integration pathways.</p>
  </div>
  <div className="rq-catalog-switch">
   <button type="button" aria-pressed={section==="equipment"} onClick={()=>setSection("equipment")}>Equipment atlas ({EQUIPMENT.length})</button>
   <button type="button" aria-pressed={section==="applications"} onClick={()=>setSection("applications")}>Industrial models ({APPLICATIONS.length})</button>
  </div>
  {section==="equipment"?<>
   <div className="rq-catalog-filters">
    <label>Technology platform
     <select aria-label="Equipment technology platform" value={platform} onChange={e=>setPlatform(e.target.value as EquipmentPlatform|"All")}>
      {PLATFORMS.map(p=><option key={p} value={p}>{p}</option>)}
     </select>
    </label>
    <label>Search instrument / measurement
     <input aria-label="Search quantum equipment" type="search" value={query} placeholder="e.g. spectroscopy, cryogenic, laser, magnetometer"
      onChange={e=>setQuery(e.target.value)}/>
    </label>
   </div>
   <p className="rq-catalog-count">{filtered.length} equipment profiles matching your selected platform and search</p>
   <div className="rq-equipment-grid">
    {filtered.map(e=><details className="rq-equipment-card" key={e.id}>
     <summary>
      <span className="rq-equipment-platform">{e.platform} / {e.category}</span>
      <strong>{e.name}</strong>
      <span className="rq-equipment-desc">{e.function}</span>
      <span className="rq-reference-status">Equipment profile · view details</span>
     </summary>
     <dl>
      <dt>Physical inputs / configuration</dt><dd>{e.scientificInputs}</dd>
      <dt>Measured outputs</dt><dd>{e.measurements}</dd>
      <dt>Scientific / industrial relevance</dt><dd>{e.useCase}</dd>
      <dt>Required real-world validation</dt><dd>{e.requiredValidation}</dd>
      <dt>Software integration</dt><dd>This atlas card is a documentation profile, not a live device connection. For compatible real telemetry, configure an approved SCPI/TCP or read-only Modbus/TCP edge acquisition profile in the Hardware Bridge.</dd>
     </dl>
    </details>)}
   </div>
  </>:<>
   <div className="rq-app-grid">
    {APPLICATIONS.map(a=><article className="rq-app-card" key={a.sector}>
     <div><span>INDUSTRY MODEL</span><small>{a.status}</small></div>
     <h3>{a.sector}</h3><b>{a.model}</b><p>{a.note}</p>
    </article>)}
   </div>
  </>}
  <div className="rq-catalog-disclaimer"><strong>From research to deployment</strong><p>Select the instrument and use case, map vendor interfaces and measurement units, validate application data and calibration, then connect approved telemetry through the supported edge workflow. Production deployment follows site-specific safety and acceptance procedures.</p></div>
 </div>;
}
