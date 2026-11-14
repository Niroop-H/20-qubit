import {serveIndustryHttp} from "../../apps/engine/src/studio/industry-http";
/** Public read-only capability negotiation; no authorization metadata exposed. */
export default function handler(req:any,res:any){return serveIndustryHttp(req,res,"capabilities");}
