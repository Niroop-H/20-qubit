/** Shared exact lowering of common OpenQASM standard-library composite gates.
 * All expansions use existing numerically validated primitive gates.
 * Gate counts are enforced by the caller's append function *after* lowering.
 */
import type {Step} from "./model";

export const COMPOSITE_GATES:Record<string,{angles:number;arity:number}>={
 cp:{angles:1,arity:2},cu1:{angles:1,arity:2},
 crz:{angles:1,arity:2},cry:{angles:1,arity:2},crx:{angles:1,arity:2},
 rzz:{angles:1,arity:2},cy:{angles:0,arity:2},ch:{angles:0,arity:2},
 cswap:{angles:0,arity:3},ccz:{angles:0,arity:3},iswap:{angles:0,arity:2},
};
type Append=(gate:Step["gate"],targets:number[],controls?:number[],
 params?:Record<string,number>)=>void;

/** Exact up to global phase only where the underlying gate itself is defined so.
 * cp/cu1 are phase gates, not RZ: controlled relative phases are preserved.
 */
export function lowerCompositeGate(name:string,q:number[],angles:number[],add:Append){
 const spec=COMPOSITE_GATES[name];
 if(!spec||q.length!==spec.arity||angles.length!==spec.angles)
  throw Error("Invalid standard gate "+name);
 if(new Set(q).size!==q.length)throw Error("Control and target qubits must be distinct.");
 const cx=(a:number,b:number)=>add("CX",[b],[a]);
 const rz=(a:number,v:number)=>add("RZ",[a],[],{theta:v});
 const ry=(a:number,v:number)=>add("RY",[a],[],{theta:v});
 const phase=(a:number,v:number)=>add("U",[a],[],{theta:0,phi:0,lambda:v});
 const single=(gate:Step["gate"],a:number)=>add(gate,[a]);
 const [a,b,c]=q,theta=angles[0];
 switch(name){
  case "cp":case "cu1":
   phase(a,theta/2);cx(a,b);phase(b,-theta/2);cx(a,b);phase(b,theta/2);break;
  case "crz":
   rz(b,theta/2);cx(a,b);rz(b,-theta/2);cx(a,b);break;
  case "cry":
   ry(b,theta/2);cx(a,b);ry(b,-theta/2);cx(a,b);break;
  case "crx":
   single("H",b);rz(b,theta/2);cx(a,b);rz(b,-theta/2);cx(a,b);single("H",b);break;
  case "rzz":
   cx(a,b);rz(b,theta);cx(a,b);break;
  case "cy":
   phase(b,-Math.PI/2);cx(a,b);single("S",b);break;
  case "ch":
   // H=RY(pi/2) Z, so controlled-H = controlled-RY after controlled-Z.
   add("CZ",[b],[a]);
   ry(b,Math.PI/4);cx(a,b);ry(b,-Math.PI/4);cx(a,b);break;
  case "cswap":
   cx(c,b);add("CCX",[c],[a,b]);cx(c,b);break;
  case "ccz":
   single("H",c);add("CCX",[c],[a,b]);single("H",c);break;
  case "iswap":
   // SWAP · S(a) · S(b) · CZ(a,b) maps |01>↔i|10>, preserves |00>,|11>.
   add("SWAP",[a,b]);single("S",a);single("S",b);add("CZ",[b],[a]);break;
  default:throw Error("Unsupported composite gate "+name);
 }
}
