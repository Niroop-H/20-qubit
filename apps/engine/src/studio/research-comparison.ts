/**
 * Comparison of two independent finite-shot classical simulator runs.
 * This is an empirical reproducibility diagnostic, not a hardware fidelity
 * estimate, statistical hypothesis test, or quantum advantage claim.
 */
export interface ComparisonSample{
 source:string;
 method:string;
 qubits:number;
 shots:number;
 seed:number;
 counts:Record<string,number>;
}
export interface ScientificRunComparison{
 comparable:boolean;
 explanation:string;
 runA:{seed:number;shots:number;distinct:number};
 runB:{seed:number;shots:number;distinct:number};
 totalVariationDistance:number|null;
 sampledEntropyA:number|null;
 sampledEntropyB:number|null;
 mostChanged:[{outcome:string;frequencyA:number;frequencyB:number;absoluteDelta:number},
  ...Array<{outcome:string;frequencyA:number;frequencyB:number;absoluteDelta:number}>] | [];
}
function validate(run:ComparisonSample){
 if(!run||typeof run.source!=="string"||!run.source||
  !Number.isInteger(run.qubits)||run.qubits<1||run.qubits>4096||
  !Number.isInteger(run.shots)||run.shots<1||run.shots>1024||
  !Number.isInteger(run.seed)||run.seed<0||run.seed>4294967295||
  !run.counts||typeof run.counts!=="object"||Array.isArray(run.counts))
  throw Error("Invalid measured run supplied for comparison.");
 const entries=Object.entries(run.counts);
 if(!entries.length||entries.length>1024)throw Error("Measured histogram is empty or exceeds the shot budget.");
 let total=0;
 for(const [bits,count] of entries){
  if(!/^[01]+$/.test(bits)||bits.length>4096||!Number.isInteger(count)||count<=0)
   throw Error("Malformed measured bitstring/count.");
  total+=count;
 }
 if(total!==run.shots)throw Error("Measured histogram does not reconcile to requested shots.");
 return entries;
}
const entropy=(entries:[string,number][],shots:number)=>
 entries.reduce((acc,[,n])=>{const p=n/shots;return acc-p*Math.log2(p);},0);
export function compareScientificRuns(a:ComparisonSample,b:ComparisonSample):ScientificRunComparison{
 const x=validate(a),y=validate(b);
 const runA={seed:a.seed,shots:a.shots,distinct:x.length};
 const runB={seed:b.seed,shots:b.shots,distinct:y.length};
 if(a.source!==b.source||a.qubits!==b.qubits||a.method!==b.method||
  x[0][0].length!==y[0][0].length)
  return {comparable:false,explanation:"Different circuits, register widths or backends; numerical distribution comparison is disabled.",
   runA,runB,totalVariationDistance:null,sampledEntropyA:null,sampledEntropyB:null,mostChanged:[]};
 const keys=new Set([...x.map(([k])=>k),...y.map(([k])=>k)]);
 const differences=[...keys].map(outcome=>{
  const frequencyA=(a.counts[outcome]||0)/a.shots;
  const frequencyB=(b.counts[outcome]||0)/b.shots;
  return{outcome,frequencyA,frequencyB,absoluteDelta:Math.abs(frequencyA-frequencyB)};
 }).sort((u,v)=>v.absoluteDelta-u.absoluteDelta||u.outcome.localeCompare(v.outcome));
 const tvd=differences.reduce((sum,v)=>sum+v.absoluteDelta,0)/2;
 return{comparable:true,
  explanation:"Empirical total-variation distance between finite-shot histograms for the same QASM and solver. Values can vary purely from shot noise.",
  runA,runB,totalVariationDistance:tvd,
  sampledEntropyA:entropy(x,a.shots),sampledEntropyB:entropy(y,b.shots),
  mostChanged:differences.slice(0,8) as ScientificRunComparison["mostChanged"]};
}
