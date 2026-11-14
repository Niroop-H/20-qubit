/** Strict dependency-free runtime validation for legacy structured circuit inputs.
 * Replaces vulnerable zod 3.x. The public anonymous simulation HTTP endpoint
 * remains retired; this adapter is retained for internal tests/integrations.
 */
export const GateTypes=[
 "I","H","X","Y","Z","S","T","RX","RY","RZ","U","CX","CZ","SWAP","CCX","BARRIER","MEASURE"
] as const;
export type GateType=(typeof GateTypes)[number];
export interface CircuitStep{
 id:string;
 gate:GateType;
 targets:number[];
 controls?:number[];
 classical?:number;
 params?:Record<string,number>;
}
export interface NoiseConfig{
 enabled:boolean;
 t1:number;t2:number;gateTime:number;
 readoutError:[number,number];depolarizingRate:number;
}
export interface ExecutionRequest{
 qubits:number;
 bits?:number;
 seed:number;
 shots:number;
 steps:CircuitStep[];
 noiseModel?:NoiseConfig;
}
type Issue={path:Array<string|number>;message:string};
type Safe<T>={success:true;data:T}|{success:false;error:{issues:Issue[]}};
const isObj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==="object"&&!Array.isArray(v);
const checkKeys=(value:Record<string,unknown>,allowed:string[],issues:Issue[],path:Issue["path"])=>{
 for(const key of Object.keys(value))
  if(!allowed.includes(key))issues.push({path:[...path,key],message:"Unknown field."});
};
const number=(value:unknown,path:Issue["path"],issues:Issue[],min:number,max:number,integer=false):number=>{
 if(typeof value!=="number"||!Number.isFinite(value)||
  (integer&&!Number.isSafeInteger(value))||value<min||value>max){
  issues.push({path,message:"Expected "+(integer?"integer":"finite number")+
   " between "+min+" and "+max+"."});return min;
 }
 return value;
};
const flag=(value:unknown,path:Issue["path"],issues:Issue[],fallback:boolean):boolean=>{
 if(value===undefined)return fallback;
 if(typeof value!=="boolean"){issues.push({path,message:"Expected boolean."});return fallback;}
 return value;
};
const requiredObject=(value:unknown,path:Issue["path"],issues:Issue[]):Record<string,unknown>=>{
 if(!isObj(value)){issues.push({path,message:"Expected object."});return{};}
 return value;
};
const requiredString=(value:unknown,path:Issue["path"],issues:Issue[]):string=>{
 if(typeof value!=="string"||!value.trim()||value.length>128){
  issues.push({path,message:"Expected nonempty string up to 128 characters."});return"";
 }
 return value;
};
const requiredArray=(value:unknown,path:Issue["path"],issues:Issue[],min:number,max:number):unknown[]=>{
 if(!Array.isArray(value)||value.length<min||value.length>max){
  issues.push({path,message:"Expected array with "+min+"–"+max+" entries."});return[];
 }
 return value;
};
function parseGate(v:unknown,path:Issue["path"],issues:Issue[]):GateType{
 if(typeof v!=="string"||!(GateTypes as readonly string[]).includes(v)){
  issues.push({path,message:"Unknown quantum gate."});return"I";
 }
 return v as GateType;
}
function parseStep(v:unknown,path:Issue["path"],issues:Issue[]):CircuitStep{
 const obj=requiredObject(v,path,issues);
 checkKeys(obj,["id","gate","targets","controls","classical","params"],issues,path);
 const targets=requiredArray(obj.targets,[...path,"targets"],issues,1,100)
  .map((q,i)=>number(q,[...path,"targets",i],issues,0,99,true));
 const controls=obj.controls===undefined?[]:requiredArray(obj.controls,[...path,"controls"],issues,0,100)
  .map((q,i)=>number(q,[...path,"controls",i],issues,0,99,true));
 let classical:number|undefined;
 if(obj.classical!==undefined)classical=number(obj.classical,[...path,"classical"],issues,0,99,true);
 const params:Record<string,number>={};
 if(obj.params!==undefined){
  const raw=requiredObject(obj.params,[...path,"params"],issues);
  if(Object.keys(raw).length>12)issues.push({path:[...path,"params"],message:"Too many gate parameters."});
  for(const [key,value]of Object.entries(raw)){
   if(!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)){
    issues.push({path:[...path,"params",key],message:"Invalid parameter identifier."});continue;
   }
   params[key]=number(value,[...path,"params",key],issues,-1e12,1e12);
  }
 }
 return{id:requiredString(obj.id,[...path,"id"],issues),
  gate:parseGate(obj.gate,[...path,"gate"],issues),targets,controls,
  ...(classical!==undefined?{classical}:{}),params};
}
function parseNoise(v:unknown,path:Issue["path"],issues:Issue[]):NoiseConfig{
 const obj=requiredObject(v,path,issues);
 checkKeys(obj,["enabled","t1","t2","gateTime","readoutError","depolarizingRate"],issues,path);
 const rawReadout=obj.readoutError===undefined?[.015,.025]:
  requiredArray(obj.readoutError,[...path,"readoutError"],issues,2,2);
 const error0=number(rawReadout[0],[...path,"readoutError",0],issues,0,1);
 const error1=number(rawReadout[1],[...path,"readoutError",1],issues,0,1);
 return{enabled:flag(obj.enabled,[...path,"enabled"],issues,false),
  t1:number(obj.t1??50,[...path,"t1"],issues,Number.MIN_VALUE,1e12),
  t2:number(obj.t2??70,[...path,"t2"],issues,Number.MIN_VALUE,1e12),
  gateTime:number(obj.gateTime??.02,[...path,"gateTime"],issues,Number.MIN_VALUE,1e12),
  readoutError:[error0,error1],
  depolarizingRate:number(obj.depolarizingRate??.001,[...path,"depolarizingRate"],issues,0,1)};
}
const wrapper=<T>(validator:(value:unknown,path:Issue["path"],issues:Issue[])=>T)=>({
 safeParse(value:unknown):Safe<T>{
  const issues:Issue[]=[];
  const data=validator(value,[],issues);
  return issues.length?{success:false,error:{issues}}:{success:true,data};
 },
 parse(value:unknown):T{
  const result=this.safeParse(value);
  if(!result.success)throw new Error(result.error.issues.map(i=>i.path.join(".")+": "+i.message).join("; "));
  return result.data;
 }
});
export const GateTypeSchema=wrapper<GateType>(parseGate);
export const CircuitStepSchema=wrapper<CircuitStep>(parseStep);
export const NoiseConfigSchema=wrapper<NoiseConfig>(parseNoise);
export const ExecutionRequestSchema=wrapper<ExecutionRequest>((value,path,issues)=>{
 const obj=requiredObject(value,path,issues);
 checkKeys(obj,["qubits","bits","seed","shots","steps","noiseModel"],issues,path);
 const qubits=number(obj.qubits,[...path,"qubits"],issues,1,100,true);
 const bits=obj.bits===undefined?undefined:number(obj.bits,[...path,"bits"],issues,1,100,true);
 const seed=number(obj.seed??42,[...path,"seed"],issues,0,4294967295,true);
 const shots=number(obj.shots??1024,[...path,"shots"],issues,1,8192,true);
 const steps=requiredArray(obj.steps,[...path,"steps"],issues,0,256)
  .map((step,i)=>parseStep(step,[...path,"steps",i],issues));
 const noiseModel=obj.noiseModel===undefined?undefined:
  parseNoise(obj.noiseModel,[...path,"noiseModel"],issues);
 return{qubits,...(bits===undefined?{}:{bits}),seed,shots,steps,...(noiseModel===undefined?{}:{noiseModel})};
});
export type ExecutionResponse=import("../studio/simulate").StudioResult;
