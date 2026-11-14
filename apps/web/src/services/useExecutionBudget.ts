import {useCallback,useEffect,useState} from "react";
import {BROWSER_BUDGET_KEY,BROWSER_EXECUTION_LIMIT,parseBudget,spendBudget,
 remainingTimeLabel,type BrowserBudget} from "./execution-budget-policy";

type RemoteBudget={limit:number;remaining:number;retryAt:number;allowed:boolean};
const useNetwork=()=>typeof location!=="undefined"&&!["localhost","127.0.0.1","::1"].includes(location.hostname);
async function remoteResponse(method:"GET"|"POST"):Promise<RemoteBudget|null>{
 const res=await fetch("/api/usage",{method,cache:"no-store",
  headers:{"Accept":"application/json",...(method==="POST"?{"Content-Type":"application/json"}:{})},
  ...(method==="POST"?{body:"{}"}:{})});
 if(res.status!==200&&res.status!==429)return null;
 const data=await res.json();
 if(data?.schema!=="MAH-Quantum-Workspace-Credits/v1"||
    !Number.isInteger(data.limit)||data.limit!==BROWSER_EXECUTION_LIMIT||
    !Number.isInteger(data.remaining)||data.remaining<0||data.remaining>data.limit||
    !Number.isFinite(data.retryAt)||data.retryAt<0||
    typeof data.allowed!=="boolean")return null;
 return{limit:data.limit,remaining:data.remaining,retryAt:data.retryAt,allowed:data.allowed};
}
export function useExecutionBudget(){
 const [budget,setBudget]=useState<BrowserBudget>(()=>{
  try{return parseBudget(localStorage.getItem(BROWSER_BUDGET_KEY),Date.now());}
  catch{return parseBudget(null,Date.now());}
 });
 const [remote,setRemote]=useState<RemoteBudget|null>(null);
 const [networkFallback,setNetworkFallback]=useState(false);
 const [now,setNow]=useState(Date.now());
 const [error,setError]=useState("");
 const refresh=useCallback(()=>{
  try{setBudget(parseBudget(localStorage.getItem(BROWSER_BUDGET_KEY),Date.now()));setError("");}
  catch{setError("Execution allowance storage is unavailable or invalid.");}
  setNow(Date.now());
 },[]);
 useEffect(()=>{
  refresh();
  const timer=setInterval(refresh,1000);
  const onStorage=(event:StorageEvent)=>{
   if(event.key===BROWSER_BUDGET_KEY||event.key===null)refresh();
  };
  window.addEventListener("storage",onStorage);
  if(useNetwork()){
   // The server sees the network address. Browser JS never reads or stores it.
   void remoteResponse("GET").then(result=>{
    if(result){setRemote(result);setNetworkFallback(false);}
    else setNetworkFallback(true);
   }).catch(()=>setNetworkFallback(true));
  }
  return()=>{clearInterval(timer);window.removeEventListener("storage",onStorage);};
 },[refresh]);
 const reserve=useCallback(async():Promise<{ok:boolean;message:string}>=>{
  if(useNetwork()){
   try{
    const network=await remoteResponse("POST");
    if(network){
     setRemote(network);setNetworkFallback(false);setNow(Date.now());
     if(network.allowed)return{ok:true,message:""};
     return{ok:false,message:"Network execution allowance used. Retry in "+
      remainingTimeLabel(network.retryAt,Date.now())+"."};
    }
   }catch{/* Clearly marked local fallback below. */}
   setNetworkFallback(true);setRemote(null);
  }
  // Preview/offline fallback, not a tamper-proof network access control.
  const commit=()=>{
   const at=Date.now(),current=parseBudget(localStorage.getItem(BROWSER_BUDGET_KEY),at);
   const outcome=spendBudget(current,at);
   if(outcome.ok)localStorage.setItem(BROWSER_BUDGET_KEY,JSON.stringify(outcome.budget));
   return outcome;
  };
  try{
   const result=navigator.locks?
    await navigator.locks.request(BROWSER_BUDGET_KEY,commit):commit();
   setBudget(result.budget);setNow(Date.now());setError("");
   if(result.ok)return{ok:true,message:""};
   return{ok:false,message:"Local execution allowance used. Retry in "+
    remainingTimeLabel(result.retryAt,Date.now())+"."};
  }catch{
   setError("Execution allowance storage is unavailable or invalid.");
   return{ok:false,message:"Unable to verify local execution allowance. Enable browser site storage and reload."};
  }
 },[]);
 const server=remote!==null&&!networkFallback;
 const remoteWaiting=!!remote&&remote.retryAt>now&&!remote.allowed;
 const localWaiting=budget.cooldownUntil>now;
 const waiting=server?remoteWaiting:localWaiting;
 const remaining=server?(remote!.retryAt>0&&now>=remote!.retryAt?BROWSER_EXECUTION_LIMIT:remote!.remaining):
  (localWaiting?0:budget.remaining);
 const prefix=server?"Network allowance":"Local browser allowance";
 const status=error||(
  waiting?`${prefix} used · renews in ${remainingTimeLabel(server?remote!.retryAt:budget.cooldownUntil,now)}`:
   `${remaining}/${BROWSER_EXECUTION_LIMIT} execution credits available · ${networkFallback?"browser-only fallback (network quota unavailable)":"5-hour cooldown after all credits"}`
 );
 return{reserve,waiting,status,remaining};
}
