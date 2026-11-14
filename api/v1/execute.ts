import {serveIndustryHttp} from "../../apps/engine/src/studio/industry-http";
/** Synchronous, authenticated circuit inspection/execution or bounded MaxCut QAOA. */
export default function handler(req:any,res:any){return serveIndustryHttp(req,res,"execute");}
