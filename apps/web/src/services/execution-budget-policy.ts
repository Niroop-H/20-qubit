/** Browser-workspace execution allowance. UX accounting, not server authorization.
 * Only numeric counters live in localStorage. Clearing browser site data resets it.
 * A network-enforced allowance must be metered on an authenticated compute server.
 */
export const BROWSER_EXECUTION_LIMIT=20;
export const BROWSER_COOLDOWN_MS=5*60*60*1000;
export const BROWSER_BUDGET_KEY="mah-quantum-execution-budget-v1";
export interface BrowserBudget{version:1;remaining:number;cooldownUntil:number}
export interface BudgetSpend{ok:boolean;budget:BrowserBudget;retryAt:number}
export const freshBudget=():BrowserBudget=>({version:1,remaining:BROWSER_EXECUTION_LIMIT,cooldownUntil:0});
export function parseBudget(raw:string|null,now:number):BrowserBudget{
 if(!Number.isFinite(now)||now<0)throw Error("Invalid time.");
 if(!raw)return freshBudget();
 if(raw.length>1024)throw Error("Execution allowance record is too large.");
 const data=JSON.parse(raw) as BrowserBudget;
 if(!data||data.version!==1||!Number.isInteger(data.remaining)||
    data.remaining<0||data.remaining>BROWSER_EXECUTION_LIMIT||
    !Number.isFinite(data.cooldownUntil)||data.cooldownUntil<0||
    (data.remaining===0&&data.cooldownUntil===0)||
    (data.remaining>0&&data.cooldownUntil!==0))
   throw Error("Invalid execution allowance record.");
 return data.cooldownUntil>0&&now>=data.cooldownUntil?freshBudget():data;
}
export function spendBudget(budget:BrowserBudget,now:number):BudgetSpend{
 const current=parseBudget(JSON.stringify(budget),now);
 if(current.cooldownUntil>now)return{ok:false,budget:current,retryAt:current.cooldownUntil};
 if(current.remaining===0)throw Error("Invalid allowance state.");
 const remaining=current.remaining-1;
 const next:BrowserBudget={version:1,remaining,cooldownUntil:remaining===0?now+BROWSER_COOLDOWN_MS:0};
 return{ok:true,budget:next,retryAt:0};
}
export function remainingTimeLabel(end:number,now:number){
 const seconds=Math.max(0,Math.ceil((end-now)/1000));
 return `${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m ${seconds%60}s`;
}
