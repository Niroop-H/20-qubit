import {runIndustrialOptimization} from "../../../engine/src/studio/industrial";
self.onmessage=(event:MessageEvent<{graph:unknown;shots:number;seed:number}>)=>{
 try{
  const result=runIndustrialOptimization(event.data.graph,event.data.shots,event.data.seed);
  self.postMessage({result});
 }catch(error){
  self.postMessage({error:error instanceof Error?error.message:"Industrial optimization failed."});
 }
};
