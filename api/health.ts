/** Public capability overview without claiming universal high-qubit computation. */
export default function handler(req:any,res:any){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("Allow","GET");
 if(req.method!=="GET")return res.status(405).json({error:"method_not_allowed"});
 return res.status(200).json({
  status:"healthy",engine:"MAH Quantum classical scientific simulator",
  denseStatevectorMaxQubits:20,
  selectedLargeCircuitFamiliesMaxQubits:4096,
  authenticatedRemoteExecuteMaxQubits:2048,
  apiAuthenticationRequired:true,
  capabilityUrl:"/api/v1/capabilities",
  physicalQuantumProcessor:false,physicalInstrumentControl:false,
  timestamp:new Date().toISOString()
 });
}
