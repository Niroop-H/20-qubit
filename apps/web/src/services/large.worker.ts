import { parseLargeQasm } from "../../../engine/src/studio/largeQasm";
import { simulateScalable } from "../../../engine/src/studio/scalable";
self.onmessage = (event:MessageEvent<{source:string;shots:number;seed:number}>) => {
  try {
    const {source,shots,seed}=event.data;
    const program=parseLargeQasm(source);
    if(program.qubits<1000)throw new Error("Use the Quantum Computing Studio for circuits below 1,000 qubits.");
    const result=simulateScalable(program,shots,seed);
    self.postMessage({result});
  }catch(error){
    self.postMessage({error:error instanceof Error?error.message:"Unable to execute large circuit."});
  }
};
