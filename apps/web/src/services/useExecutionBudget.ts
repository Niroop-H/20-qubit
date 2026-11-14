import {useCallback,useEffect,useState} from "react";
import {BROWSER_BUDGET_KEY,BROWSER_EXECUTION_LIMIT,parseBudget,spendBudget,remainingTimeLabel,
 type BrowserBudget} from "./execution-budget-policy";
export function useExecutionBudget(){
 const [budget,setBudget]=useState<BrowserBudget>(()=>parseBudget(null,Date.now()));
 const [now,setNow]=useState(Date.now());
 const [error,setError]=useState("");
 const refresh=useCallback(()=>{
  try{setBudget(parseBudget(localStorage.getItem(BROWSER_BUDGET_KEY),Date.now()));setError("");}
  catch{setError("Execution allowance storage is unavailable or invalid.");}
  setNow(Date.now());
 },[]);
 useEffect(()=>{
  refresh();
  const timer=setInterval(()=>{setNow(Date.now());refresh();},1000);
  const onStorage=(event:StorageEvent)=>{
   if(event.key===BROWSER_BUDGET_KEY||event.key===null)refresh();
  };
  window.addEventListener("storage",onStorage);
  return()=>{clearInterval(timer);window.removeEventListener("storage",onStorage);};
 },[refresh]);
 const reserve=useCallback(async():Promise<{ok:boolean;message:string}>=>{
  const commit=()=>{
   const at=Date.now();
   const current=parseBudget(localStorage.getItem(BROWSER_BUDGET_KEY),at);
   const outcome=spendBudget(current,at);
   if(outcome.ok)localStorage.setItem(BROWSER_BUDGET_KEY,JSON.stringify(outcome.budget));
   return outcome;
  };
  try{
   // Web Locks provide cross-tab atomicity where supported.
   const result=navigator.locks?
    await navigator.locks.request(BROWSER_BUDGET_KEY,commit):commit();
   setBudget(result.budget);setNow(Date.now());setError("");
   if(result.ok)return{ok:true,message:""};
   return{ok:false,message:"Execution allowance used. Try again in "+remainingTimeLabel(result.retryAt,Date.now())+"."};
  }catch{
   setError("Execution allowance storage is unavailable or invalid.");
   return{ok:false,message:"Unable to verify local execution allowance. Enable browser site storage and reload."};
  }
 },[]);
 const waiting=budget.cooldownUntil>now;
 const status=error||(
  waiting?"20-run allowance used · renews in "+remainingTimeLabel(budget.cooldownUntil,now):
   `${budget.remaining}/${BROWSER_EXECUTION_LIMIT} execution credits available · 5-hour cooldown when used`
 );
 return{reserve,waiting,status,remaining:waiting?0:budget.remaining};
}
