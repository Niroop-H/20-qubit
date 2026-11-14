/**
 * Linear-time syntax splitting for bounded OpenQASM 2/3 subsets.
 * No regex with competing unbounded whitespace/operand quantifiers.
 * Semantic register and gate validation is performed by the callers.
 */
export type QuantumOperation =
 | {kind:"arrow";quantum:string;classical:string}
 | {kind:"assignment";quantum:string;classical:string}
 | {kind:"barrier";operands:string}
 | {kind:"gate";name:string;angles:string[];operands:string};

export function readQuantumOperation(statement:string):QuantumOperation{
 const s=statement.trim();
 const measure=/^measure\s+/i.exec(s);
 if(measure){
  const tail=s.slice(measure[0].length),at=tail.indexOf("->");
  if(at>=0){
   const quantum=tail.slice(0,at).trim(),classical=tail.slice(at+2).trim();
   if(!quantum||!classical)throw Error("Measurement needs a quantum and a classical operand.");
   return{kind:"arrow",quantum,classical};
  }
 }
 const equals=s.indexOf("=");
 if(equals>0){
  const left=s.slice(0,equals).trim();
  const right=s.slice(equals+1).trim();
  const assigned=/^measure\s+/i.exec(right);
  if(assigned){
   const quantum=right.slice(assigned[0].length).trim();
   if(!left||!quantum)throw Error("Measurement assignment needs both operands.");
   return{kind:"assignment",quantum,classical:left};
  }
 }
 const barrier=/^barrier\s+/i.exec(s);
 if(barrier){
  const operands=s.slice(barrier[0].length).trim();
  if(!operands)throw Error("Barrier needs an operand.");
  return{kind:"barrier",operands};
 }
 const name=/^[A-Za-z][A-Za-z0-9]*/.exec(s);
 if(!name)throw Error("Unsupported syntax: loops and custom gates are unavailable.");
 let rest=s.slice(name[0].length);
 let angles:string[]=[];
 if(rest.startsWith("(")){
  let depth=0,close=-1;
  for(let i=0;i<rest.length;i++){
   if(rest[i]==="(")depth++;
   else if(rest[i]===")"){
    depth--;
    if(depth===0){close=i;break;}
    if(depth<0)break;
   }
  }
  if(close<0)throw Error("Unclosed gate parameter list.");
  const parameters=rest.slice(1,close);
  angles=parameters.split(",");
  rest=rest.slice(close+1);
 }
 if(!rest||!/^\s/.test(rest)||!rest.trim())
  throw Error("Unsupported gate syntax: expected quantum operands.");
 return{kind:"gate",name:name[0].toLowerCase(),angles,operands:rest.trim()};
}
