import {serveIndustryHttp} from "../../apps/engine/src/studio/industry-http";
/** Synchronous bounded batch (1–3 jobs); not a persistent queue. */
export default function handler(req:any,res:any){return serveIndustryHttp(req,res,"batch");}
