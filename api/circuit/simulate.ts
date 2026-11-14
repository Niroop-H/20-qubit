/**
 * Deprecated anonymous compatibility API. Scientific execution is now served
 * by authenticated, bounded /api/v1/execute and /api/v1/batch.
 * The UI's browser Workers do not depend on this endpoint.
 */
export default function handler(req:any,res:any){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 res.setHeader("Allow","POST");
 if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
 return res.status(410).json({error:"legacy_route_retired",
  message:"Anonymous simulation is disabled. Use the authenticated /api/v1/execute contract."});
}
