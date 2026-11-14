import type {NoiseConfig} from "../types/circuit";
import {QuantumCircuit} from "./QuantumCircuit";
import {GATES} from "../math/gates";

/** Seeded, normalized quantum-trajectory Monte Carlo noise.
 * The caller MUST provide the random stream (use seededRandom(seed)); this
 * keeps hardware-like Monte Carlo results reproducible for research evidence.
 */
export class NoiseEngine {
  public static validateNoise(config:NoiseConfig):void {
    if(!config||!Array.isArray(config.readoutError)||config.readoutError.length!==2||
      ![config.t1,config.t2,config.gateTime,config.depolarizingRate,...config.readoutError].every(Number.isFinite)||
      config.t1<=0||config.t2<=0||config.gateTime<=0||config.t2>2*config.t1||
      [config.depolarizingRate,...config.readoutError].some(x=>x<0||x>1))
      throw Error("Noise requires positive times, T2 ≤ 2×T1, and error probabilities between 0 and 1.");
  }
  public static applyStepNoise(circuit:QuantumCircuit,targetQubits:number[],config:NoiseConfig,rng:()=>number):void {
    if(!config.enabled)return;
    this.validateNoise(config);
    if(typeof rng!=="function")throw Error("A seeded RNG must be supplied for noise trajectories.");
    const gamma=1-Math.exp(-config.gateTime/config.t1);
    const dephase=(1-Math.exp(-config.gateTime*Math.max(0,1/config.t2-1/(2*config.t1))))/2;
    for(const q of new Set(targetQubits)){
      if(!Number.isInteger(q)||q<0||q>=circuit.numQubits)
        throw Error("Noise target qubit is out of range.");
      const bit=1<<q;
      let excited=0;
      for(let i=0;i<circuit.stateSize;i++)if(i&bit)
        excited+=circuit.real[i]**2+circuit.imag[i]**2;
      const jumpProbability=gamma*excited;
      if(rng()<jumpProbability){
        const scale=1/Math.sqrt(excited);
        for(let i=0;i<circuit.stateSize;i++)if(!(i&bit)){
          circuit.real[i]=circuit.real[i|bit]*scale;
          circuit.imag[i]=circuit.imag[i|bit]*scale;
          circuit.real[i|bit]=0;circuit.imag[i|bit]=0;
        }
      }else{
        const scale=1/Math.sqrt(Math.max(1e-300,1-jumpProbability));
        const survive=Math.sqrt(1-gamma);
        for(let i=0;i<circuit.stateSize;i++){
          const factor=(i&bit?survive:1)*scale;
          circuit.real[i]*=factor;circuit.imag[i]*=factor;
        }
      }
      if(rng()<dephase)circuit.applySingleQubitGate(q,GATES.Z);
      if(rng()<config.depolarizingRate){
        const gate=["X","Y","Z"][Math.min(2,Math.floor(rng()*3))];
        circuit.applySingleQubitGate(q,GATES[gate]);
      }
    }
    if(Math.abs(circuit.normSquared()-1)>1e-8)throw Error("Noisy trajectory lost normalization.");
  }
  public static applyReadoutConfusion(bits:string,errors:[number,number],rng:()=>number):string{
    if(!/^[01]*$/.test(bits)||!Array.isArray(errors)||errors.length!==2||
       errors.some(v=>!Number.isFinite(v)||v<0||v>1)||typeof rng!=="function")
      throw Error("Valid binary outcome, probabilities and seeded RNG required.");
    return Array.from(bits,b=>rng()<errors[b==="0"?0:1]?(b==="0"?"1":"0"):b).join("");
  }
}
