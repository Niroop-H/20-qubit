const {test}=require("node:test");
const assert=require("node:assert/strict");
const {BROWSER_EXECUTION_LIMIT,BROWSER_COOLDOWN_MS,freshBudget,parseBudget,spendBudget}=require(process.env.BUDGET_TEST_BUILD+"/budget.js");
test("twenty browser workspace executions then five-hour cooldown and reset",()=>{
 let now=10000,budget=freshBudget();
 for(let k=0;k<BROWSER_EXECUTION_LIMIT;k++){
  const attempt=spendBudget(budget,now);
  assert.equal(attempt.ok,true);budget=attempt.budget;
  assert.equal(budget.remaining,BROWSER_EXECUTION_LIMIT-k-1);
 }
 assert.equal(budget.cooldownUntil,now+BROWSER_COOLDOWN_MS);
 assert.equal(spendBudget(budget,now+10).ok,false);
 assert.equal(parseBudget(JSON.stringify(budget),now+BROWSER_COOLDOWN_MS-1).remaining,0);
 assert.deepEqual(parseBudget(JSON.stringify(budget),now+BROWSER_COOLDOWN_MS),freshBudget());
 assert.equal(spendBudget(budget,now+BROWSER_COOLDOWN_MS).budget.remaining,19);
});
test("reload preserves state and invalid numeric records fail closed",()=>{
 const b=spendBudget(freshBudget(),1500).budget;
 assert.deepEqual(parseBudget(JSON.stringify(b),1600),b);
 for(const bad of [
  "{",JSON.stringify({...b,remaining:21}),
  JSON.stringify({...b,remaining:0,cooldownUntil:0}),
  JSON.stringify({...b,remaining:19,cooldownUntil:10000})
 ])assert.throws(()=>parseBudget(bad,1600));
 assert.deepEqual(parseBudget(null,1500),freshBudget());
});
