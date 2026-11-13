/** Strict bounded OpenQASM 2/3 subset for 101–4096 logical qubits. */
import type { LargeProgram } from "./scalable";
import { validateLargeProgram, LARGE_MAX_QUBITS, LARGE_MAX_STEPS } from "./scalable";
import type { Step } from "./model";
import { expression } from "./qasm";

export function parseLargeQasm(source:string):LargeProgram{
 if(typeof source!=="string"||source.length>750000)throw new Error("Source is limited to 750 KB.");
 const clean=source.replace(/\/\*[\s\S]*?\*\//g,match=>match.replace(/[^\n]/g," ")).replace(/\/\/[^\n]*/g,"");
 const chunks=clean.split(";");
 if(chunks.pop()?.trim())throw new Error("Each statement must end in a semicolon.");
 let version="",qName="",cName="",n=0,m=0,operation=false;
 const steps:Step[]=[];
 function add(gate:Step["gate"],targets:number[],controls:number[]=[],params?:Record<string,number>,classical?:number){
  if(steps.length>=LARGE_MAX_STEPS)throw new Error("Expanded circuit exceeds "+LARGE_MAX_STEPS+" operations.");
  steps.push({id:"large-"+steps.length,gate,targets,controls,params,classical});
 }
 function address(operand:string,kind:"q"|"c"){
  const result=/^([a-zA-Z_]\w*)(?:\[(\d+)\])?$/.exec(operand.trim());
  const name=kind==="q"?qName:cName,count=kind==="q"?n:m;
  if(!result||!name||result[1]!==name)throw new Error("Unknown "+kind+" register operand "+operand);
  if(result[2]===undefined)return Array.from({length:count},(_,i)=>i);
  const q=Number(result[2]);if(q>=count)throw new Error("Operand "+q+" exceeds register width "+count);
  return [q];
 }
 for(let k=0;k<chunks.length;k++){
  const statement=chunks[k].trim();
  if(!statement)continue;
  try{
   let hit:RegExpExecArray|null;
   if((hit=/^OPENQASM\s+(2\.0|3(?:\.0)?)$/i.exec(statement))){
    if(version||operation||qName)throw new Error("Declare a single version at the beginning.");
    version=hit[1];continue;
   }
   if(!version)throw new Error("Declare OPENQASM version first.");
   if((hit=/^include\s+"([^"]+)"$/.exec(statement))){
    if(!["qelib1.inc","stdgates.inc"].includes(hit[1]))throw new Error("Unsupported include.");
    continue;
   }
   if((hit=/^(qreg|creg)\s+([a-zA-Z_]\w*)\[(\d+)\]$/.exec(statement))){
    if(version!=="2.0"||operation)throw new Error("QASM2 register declarations must precede gates.");
    const count=Number(hit[3]);if(count<1||count>LARGE_MAX_QUBITS)throw new Error("Register width outside 1–"+LARGE_MAX_QUBITS);
    if(hit[1]==="qreg"){if(qName)throw new Error("Only one quantum register.");qName=hit[2];n=count;}
    else{if(cName)throw new Error("Only one classical register.");cName=hit[2];m=count;}
    continue;
   }
   if((hit=/^(qubit|bit)\[(\d+)\]\s+([a-zA-Z_]\w*)$/.exec(statement))){
    if(version==="2.0"||operation)throw new Error("QASM3 register declarations must precede gates.");
    const count=Number(hit[2]);if(count<1||count>LARGE_MAX_QUBITS)throw new Error("Register width outside 1–"+LARGE_MAX_QUBITS);
    if(hit[1]==="qubit"){if(qName)throw new Error("Only one quantum register.");qName=hit[3];n=count;}
    else{if(cName)throw new Error("Only one classical register.");cName=hit[3];m=count;}
    continue;
   }
   if(!qName)throw new Error("Declare quantum register before operations.");
   operation=true;
   if((hit=/^measure\s+(.+?)\s*->\s*(.+)$/i.exec(statement))){
    const a=address(hit[1],"q"),b=address(hit[2],"c");
    if(a.length!==b.length)throw new Error("Measurement registers must match.");
    a.forEach((q,i)=>add("MEASURE",[q],[],undefined,b[i]));continue;
   }
   if((hit=/^(.+?)\s*=\s*measure\s+(.+)$/i.exec(statement))){
    if(version==="2.0")throw new Error("Assignment measurement requires QASM3.");
    const a=address(hit[2],"q"),b=address(hit[1],"c");
    if(a.length!==b.length)throw new Error("Measurement registers must match.");
    a.forEach((q,i)=>add("MEASURE",[q],[],undefined,b[i]));continue;
   }
   if((hit=/^barrier\s+(.+)$/i.exec(statement))){
    const targets=hit[1].split(",").flatMap(s=>address(s,"q"));
    if(targets.length>0)add("BARRIER",targets);continue;
   }
   hit=/^([a-zA-Z][a-zA-Z0-9]*)(?:\((.*)\))?\s+(.+)$/.exec(statement);
   if(!hit)throw new Error("Unsupported syntax (loops and custom gates are unavailable).");
   const name=hit[1].toLowerCase(),args=hit[2]===undefined?[]:hit[2].split(",").map(expression);
   const nargs:{[gate:string]:number}={id:0,h:0,x:0,y:0,z:0,s:0,t:0,sdg:0,tdg:0,rx:1,ry:1,rz:1,u:3,u3:3,cx:0,cz:0,swap:0,ccx:0};
   if(!Object.prototype.hasOwnProperty.call(nargs,name))throw new Error("Unsupported scalable instruction "+name);
   if(args.length!==nargs[name])throw new Error(name+" expects "+nargs[name]+" angle parameters.");
   const operands=hit[3].split(",").map(s=>address(s,"q"));
   const arity=name==="ccx"?3:["cx","cz","swap"].includes(name)?2:1;
   if(operands.length!==arity)throw new Error(name+" requires "+arity+" operand(s).");
   const width=Math.max(...operands.map(a=>a.length));
   if(operands.some(a=>a.length!==1&&a.length!==width))throw new Error("Registers must be compatible.");
   for(let i=0;i<width;i++){
    const q=operands.map(a=>a.length===1?a[0]:a[i]);
    if(["sdg","tdg"].includes(name))add("U",[q[0]],[],{theta:0,phi:0,lambda:name==="sdg"?-Math.PI/2:-Math.PI/4});
    else if(name==="u"||name==="u3")add("U",[q[0]],[],{theta:args[0],phi:args[1],lambda:args[2]});
    else if(["rx","ry","rz"].includes(name))add(name.toUpperCase() as Step["gate"],[q[0]],[],{theta:args[0]});
    else if(name==="cx"||name==="cz")add(name.toUpperCase() as Step["gate"],[q[1]],[q[0]]);
    else if(name==="ccx")add("CCX",[q[2]],[q[0],q[1]]);
    else add(name==="id"?"I":name.toUpperCase() as Step["gate"],q);
   }
  }catch(e){
   throw new Error("Statement "+(k+1)+": "+(e as Error).message);
  }
 }
 if(!version||!n)throw new Error("QASM source must declare version and quantum register.");
 const program:LargeProgram={qubits:n,bits:m||n,steps};
 validateLargeProgram(program);
 return program;
}
