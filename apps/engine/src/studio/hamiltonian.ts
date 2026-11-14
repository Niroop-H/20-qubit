/**
 * Scientific diagonal Ising (Z/ZZ) analysis of actual sampled outcomes.
 * A finite-shot classical estimator, not a universal Hamiltonian solver,
 * noise model, hardware calibration or proof of ground-state convergence.
 */
export const ISING_SCHEMA = "MAH-Quantum-Diagonal-Ising/v1" as const;
export interface IsingField { bit:number; weight:number }
export interface IsingCoupling { a:number; b:number; weight:number }
export interface IsingModel {
 schema:typeof ISING_SCHEMA; name:string; offset:number;
 fields:IsingField[]; couplings:IsingCoupling[];
}
export interface IsingTermEstimate{
 label:string; weight:number; expectation:number; contribution:number;
}
export interface EnergyBin {lower:number;upper:number;shots:number;frequency:number}
export interface IsingEstimate {
 schema:"MAH-Quantum-Ising-Sample-Analysis/v1";
 model:IsingModel; bitWidth:number; shots:number; distinctOutcomes:number;
 mean:number; variance:number|null; standardError:number|null;
 confidence95:[number,number]|null;
 observedMinimum:{bits:string;energy:number;shots:number};
 observedMaximum:{bits:string;energy:number;shots:number};
 termEstimates:IsingTermEstimate[];
 selectedBits:number[]; zMeans:number[]; zzMatrix:number[][];
 histogram:EnergyBin[];
 caveat:string;
}
const finite=(x:unknown,label:string,max=1000000):number=>{
 if(typeof x!=="number"||!Number.isFinite(x)||Math.abs(x)>max)
  throw Error(label+" must be a finite number between -"+max+" and "+max+".");
 return x;
};
const obj=(x:unknown,label:string):Record<string,unknown>=>{
 if(x===null||typeof x!=="object"||Array.isArray(x))throw Error(label+" must be an object.");
 return x as Record<string,unknown>;
};
const keys=(value:Record<string,unknown>,allowed:string[],label:string)=>{
 for(const k of Object.keys(value))if(!allowed.includes(k))
  throw Error(label+" includes unsupported field "+k+".");
};
const validBit=(n:unknown,width:number,label:string)=>{
 if(typeof n!=="number"||!Number.isSafeInteger(n)||n<0||n>=width)
  throw Error(label+" must be an integer classical bit index in [0,"+(width-1)+"].");
 return n;
};
export function validateIsingModel(value:unknown,width:number):IsingModel{
 if(!Number.isSafeInteger(width)||width<1||width>4096)
  throw Error("Measured classical register width must be 1–4096.");
 const m=obj(value,"Hamiltonian model");
 keys(m,["schema","name","offset","fields","couplings"],"Hamiltonian model");
 if(m.schema!==ISING_SCHEMA)throw Error("Expected "+ISING_SCHEMA+".");
 if(typeof m.name!=="string"||m.name.trim().length<1||m.name.length>100)
  throw Error("Model name must contain 1–100 characters.");
 const offset=finite(m.offset,"Offset");
 if(!Array.isArray(m.fields)||!Array.isArray(m.couplings))
  throw Error("Fields and couplings must be arrays.");
 if(m.fields.length>64||m.couplings.length>128||m.fields.length+m.couplings.length<1)
  throw Error("Supply 1–192 terms (up to 64 fields and 128 couplings).");
 const usedFields=new Set<number>(),usedEdges=new Set<string>();
 const fields:IsingField[]=m.fields.map((raw,i)=>{
  const x=obj(raw,"Field "+i);keys(x,["bit","weight"],"Field "+i);
  const bit=validBit(x.bit,width,"Field "+i+" bit");
  if(usedFields.has(bit))throw Error("Duplicate Z field for classical bit "+bit+".");
  usedFields.add(bit);
  return {bit,weight:finite(x.weight,"Field "+i+" weight")};
 });
 const couplings:IsingCoupling[]=m.couplings.map((raw,i)=>{
  const x=obj(raw,"Coupling "+i);keys(x,["a","b","weight"],"Coupling "+i);
  const a=validBit(x.a,width,"Coupling "+i+" bit A");
  const b=validBit(x.b,width,"Coupling "+i+" bit B");
  if(a===b)throw Error("Self-coupling is not permitted; absorb Z_i Z_i into offset.");
  const low=Math.min(a,b),high=Math.max(a,b),id=low+":"+high;
  if(usedEdges.has(id))throw Error("Duplicate ZZ coupling on bits "+low+" and "+high+".");
  usedEdges.add(id);
  return {a:low,b:high,weight:finite(x.weight,"Coupling "+i+" weight")};
 });
 return{schema:ISING_SCHEMA,name:m.name.trim(),offset,fields,couplings};
}
export function isingPreset(preset:"chain"|"frustration"|"separation"):IsingModel{
 if(preset==="chain")return {
  schema:ISING_SCHEMA,name:"Synthetic six-spin ferromagnetic chain",offset:0,
  fields:[{bit:0,weight:-0.3},{bit:5,weight:0.2}],
  couplings:Array.from({length:5},(_,a)=>({a,b:a+1,weight:-1}))
 };
 if(preset==="frustration")return {
  schema:ISING_SCHEMA,name:"Synthetic frustrated triangular interaction",offset:0,
  fields:[],couplings:[{a:0,b:1,weight:1},{a:1,b:2,weight:1},{a:0,b:2,weight:1}]
 };
 return{
  schema:ISING_SCHEMA,name:"Synthetic separation penalty model",offset:2.5,
  fields:[{bit:0,weight:0.25},{bit:1,weight:-0.4},{bit:2,weight:0.5}],
  couplings:[{a:0,b:1,weight:1.5},{a:1,b:2,weight:-2},{a:0,b:2,weight:0.75}]
 };
}
export function analyzeIsingSamples(modelInput:unknown,counts:Record<string,number>):IsingEstimate{
 if(counts===null||typeof counts!=="object"||Array.isArray(counts))
  throw Error("Sample histogram must be an object.");
 const entries=Object.entries(counts);
 if(!entries.length||entries.length>8192)throw Error("Expected 1–8192 sampled outcomes.");
 const width=entries[0][0].length;
 if(width<1||width>4096)throw Error("Sample bit width is outside 1–4096.");
 const model=validateIsingModel(modelInput,width);
 let shots=0;
 const energies:{bits:string;count:number;energy:number}[]=[];
 const usedBits=[...new Set([
  ...model.fields.map(t=>t.bit),
  ...model.couplings.flatMap(t=>[t.a,t.b])
 ])].sort((a,b)=>a-b);
 const zSum=new Map<number,number>(usedBits.map(b=>[b,0]));
 const edgeSums=new Map<string,number>(
  model.couplings.map(t=>[t.a+":"+t.b,0]));
 const spin=(bits:string,index:number)=>bits[width-index-1]==="1"?-1:1;
 let meanSum=0,energy2Sum=0;
 let min:null|{bits:string;energy:number;shots:number}=null;
 let max:null|{bits:string;energy:number;shots:number}=null;
 for(const [bits,count] of entries){
  if(bits.length!==width||!/^[01]+$/.test(bits)||!Number.isSafeInteger(count)||count<=0)
   throw Error("Malformed sampled bitstring or nonpositive/integer shot count.");
  shots+=count;
  if(!Number.isSafeInteger(shots)||shots>1000000)
   throw Error("Exceeded 1,000,000 total sampled shots.");
  let energy=model.offset;
  for(const t of model.fields)energy+=t.weight*spin(bits,t.bit);
  for(const t of model.couplings)energy+=t.weight*spin(bits,t.a)*spin(bits,t.b);
  if(!Number.isFinite(energy))throw Error("Energy exceeded finite numeric precision.");
  energies.push({bits,count,energy});
  meanSum+=energy*count;energy2Sum+=energy*energy*count;
  if(!min||energy<min.energy||(energy===min.energy&&bits<min.bits))
   min={bits,energy,shots:count};
  if(!max||energy>max.energy||(energy===max.energy&&bits<max.bits))
   max={bits,energy,shots:count};
  for(const b of usedBits)zSum.set(b,zSum.get(b)!+count*spin(bits,b));
  for(const t of model.couplings){
   const id=t.a+":"+t.b;
   edgeSums.set(id,edgeSums.get(id)!+count*spin(bits,t.a)*spin(bits,t.b));
  }
 }
 if(!shots||!min||!max)throw Error("Sample histogram has no shots.");
 const mean=meanSum/shots;
 // Unbiased finite-shot variance. Stable enough for bounded IEEE 754 energies.
 // Centered second pass avoids cancellation for large energy offsets.
 let m2=0;
 for(const row of energies)m2+=row.count*(row.energy-mean)*(row.energy-mean);
 const variance=shots>1?m2/(shots-1):null;
 const standardError=variance===null?null:Math.sqrt(variance/shots);
 const confidence95=standardError===null?null as [number,number]|null:
  [mean-1.959963984540054*standardError,mean+1.959963984540054*standardError] as [number,number];
 const termEstimates:IsingTermEstimate[]=[
  {label:"Offset · I",weight:model.offset,expectation:1,contribution:model.offset},
  ...model.fields.map(t=>{
   const expectation=zSum.get(t.bit)!/shots;
   return{label:"Z(c"+t.bit+")",weight:t.weight,expectation,contribution:t.weight*expectation};
  }),
  ...model.couplings.map(t=>{
   const expectation=edgeSums.get(t.a+":"+t.b)!/shots;
   return{label:"Z(c"+t.a+")·Z(c"+t.b+")",weight:t.weight,expectation,contribution:t.weight*expectation};
  })
 ];
 // Up to eight active classical bits for an interpretable, bounded Z/ZZ matrix.
 const selectedBits=usedBits.slice(0,8);
 const zMeans=selectedBits.map(b=>zSum.get(b)!/shots);
 const zzMatrix=selectedBits.map(a=>selectedBits.map(b=>{
  if(a===b)return 1;
  let total=0;
  for(const row of energies)total+=spin(row.bits,a)*spin(row.bits,b)*row.count;
  return total/shots;
 }));
 const bucketCount=min.energy===max.energy?1:Math.min(24,Math.max(8,Math.ceil(Math.sqrt(energies.length))));
 const range=max.energy-min.energy;
 const histogram=Array.from({length:bucketCount},(_,i)=>({
  lower:min!.energy+range*i/bucketCount,
  upper:i===bucketCount-1?max!.energy:min!.energy+range*(i+1)/bucketCount,
  shots:0,frequency:0
 }));
 for(const row of energies){
  const i=range===0?0:Math.min(bucketCount-1,Math.max(0,Math.floor((row.energy-min.energy)/range*bucketCount)));
  histogram[i].shots+=row.count;
 }
 for(const bin of histogram)bin.frequency=bin.shots/shots;
 return{
  schema:"MAH-Quantum-Ising-Sample-Analysis/v1",model,bitWidth:width,shots,
  distinctOutcomes:entries.length,mean,variance,standardError,confidence95,
  observedMinimum:min,observedMaximum:max,termEstimates,
  selectedBits,zMeans,zzMatrix,histogram,
  caveat:"Z-basis finite-shot estimate for a diagonal I/Z/ZZ Hamiltonian only. No X/Y terms, non-diagonal energy, certified calibration, thermal model or ground-state certificate. 95% interval uses a normal approximation to independent simulated shots."
 };
}
