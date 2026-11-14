import {serveBrowserUsage} from "../apps/engine/src/studio/usage-http";
/** Same-origin workspace quota; client addresses are never retained verbatim. */
export default function handler(req:any,res:any){
 return serveBrowserUsage(req,res);
}
