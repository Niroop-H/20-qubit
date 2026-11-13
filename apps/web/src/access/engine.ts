export const ALLOWANCE_MS = 24 * 60 * 60 * 1000;
export const COOLDOWN_MS = 12 * 60 * 60 * 1000;
export const STORAGE_KEY = 'mah-workspace-access-v1';
export interface Usage { usedMs: number; cooldownUntil: number }
export interface AccessState {
 version: 1; active: string | null; codes: Record<string, Usage>;
 owner: string | null; heartbeat: number;
}
export const emptyState = (): AccessState => ({version:1, active:null, codes:{}, owner:null, heartbeat:0});
export function codeId(code:string):string|null {
 if(code.length!==10 || !/^25212007[a-z]{2}$/.test(code)) return null;
 return 'c'+((code.charCodeAt(8)-97)*26+code.charCodeAt(9)-97);
}
export function readState(raw:string|null):AccessState {
 if(!raw)return emptyState();
 const data=JSON.parse(raw);
 if(data.version!==1 || !data.codes || typeof data.codes!=='object' || Array.isArray(data.codes))throw Error('Invalid access record');
 const keys=Object.keys(data.codes);
 if(keys.length>676 || keys.some(k=>!/^c\d{1,3}$/.test(k)||Number(k.slice(1))>675))throw Error('Invalid code record');
 for(const u of Object.values(data.codes) as Usage[])if(!u||!Number.isFinite(u.usedMs)||u.usedMs<0||u.usedMs>ALLOWANCE_MS||!Number.isFinite(u.cooldownUntil)||u.cooldownUntil<0)throw Error('Invalid usage record');
 if(data.active!==null && (typeof data.active!=='string'||!Object.prototype.hasOwnProperty.call(data.codes,data.active)))throw Error('Invalid active record');
 if(data.owner!==null&&typeof data.owner!=='string')throw Error('Invalid owner');
 if(!Number.isFinite(data.heartbeat)||data.heartbeat<0)throw Error('Invalid heartbeat');
 return data;
}
export function granted(s:AccessState){return !!s.active && !!s.codes[s.active] && s.codes[s.active].usedMs<ALLOWANCE_MS && s.codes[s.active].cooldownUntil===0;}
export function enter(s:AccessState, code:string, now:number):{ok:boolean;retryAt?:number;error?:string}{
 const id=codeId(code);if(!id)return {ok:false,error:'Invalid access code.'};
 let record=s.codes[id];
 if(record?.cooldownUntil>now)return {ok:false,retryAt:record.cooldownUntil,error:'Please wait for the timeout to end.'};
 if(!record || (record.cooldownUntil>0&&now>=record.cooldownUntil))record=s.codes[id]={usedMs:0,cooldownUntil:0};
 // Re-entry preserves consumption; switching codes transfers tracking to the new code.
 if(s.active!==id){s.owner=null;s.heartbeat=0;}
 s.active=id;
 return {ok:true};
}
export function tick(s:AccessState,tab:string,now:number,visible:boolean):boolean {
 if(!granted(s))return false;
 if(!visible){if(s.owner===tab){s.owner=null;s.heartbeat=0;return true;}return false;}
 // A shared lease prevents simultaneously visible windows from counting twice.
 if(s.owner!==tab){if(s.owner&&now-s.heartbeat<2200)return false;s.owner=tab;s.heartbeat=now;return true;}
 const elapsed=now-s.heartbeat;
 // Treat long gaps as suspended/closed browsing, not active usage.
 const delta=elapsed>0&&elapsed<=5000?elapsed:0;s.heartbeat=now;
 const usage=s.codes[s.active!],remaining=ALLOWANCE_MS-usage.usedMs;
 usage.usedMs=Math.min(ALLOWANCE_MS,usage.usedMs+delta);
 if(usage.usedMs>=ALLOWANCE_MS){usage.cooldownUntil=now-Math.max(0,delta-remaining)+COOLDOWN_MS;s.active=null;s.owner=null;s.heartbeat=0;}
 return true;
}
