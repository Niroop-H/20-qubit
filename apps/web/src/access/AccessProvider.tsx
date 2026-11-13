import {createContext,ReactNode,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {newId} from '../services/id';
import {AccessState,emptyState,enter,granted,readState,STORAGE_KEY,tick} from './engine';
type Entry={ok:boolean;retryAt?:number;error?:string};
const Context=createContext({ready:false,allowed:false,error:'',submit:async(_code:string):Promise<Entry>=>({ok:false})});
export function AccessProvider({children}:{children:ReactNode}){
 const [state,setState]=useState<AccessState>(emptyState),[ready,setReady]=useState(false),[error,setError]=useState('');
 const tab=useRef(newId());
 const transact=useCallback(async(change:(s:AccessState)=>unknown)=>{
  const run=()=>{const next=readState(localStorage.getItem(STORAGE_KEY));const result=change(next);localStorage.setItem(STORAGE_KEY,JSON.stringify(next));setState(next);setError('');setReady(true);return result;};
  try{return navigator.locks?await navigator.locks.request(STORAGE_KEY,run):run();}
  catch{setError('Browser storage is unavailable. Enable site storage to continue.');setState(emptyState());setReady(true);return {ok:false,error:'Unable to save access in this browser.'};}
 },[]);
 useEffect(()=>{
  const pulse=()=>{void transact(s=>tick(s,tab.current,Date.now(),document.visibilityState==='visible'));};
  const sync=()=>{try{setState(readState(localStorage.getItem(STORAGE_KEY)));setError('');}catch{setState(emptyState());setError('Unable to read access in this browser.');}setReady(true);};
  const storage=(e:StorageEvent)=>{if(e.key===STORAGE_KEY||e.key===null)sync();};
  const leave=()=>{try{const s=readState(localStorage.getItem(STORAGE_KEY));if(s.owner===tab.current){tick(s,tab.current,Date.now(),true);tick(s,tab.current,Date.now(),false);localStorage.setItem(STORAGE_KEY,JSON.stringify(s));}}catch{/* Next page will report unavailable storage. */}};
  sync();pulse();const timer=setInterval(pulse,1000);
  document.addEventListener('visibilitychange',pulse);window.addEventListener('storage',storage);window.addEventListener('pagehide',leave);window.addEventListener('pageshow',pulse);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',pulse);window.removeEventListener('storage',storage);window.removeEventListener('pagehide',leave);window.removeEventListener('pageshow',pulse);};
 },[transact]);
 const submit=useCallback(async(code:string)=>await transact(s=>{tick(s,tab.current,Date.now(),document.visibilityState==='visible');return enter(s,code,Date.now());}) as Entry,[transact]);
 return <Context.Provider value={{ready,allowed:granted(state),error,submit}}>{children}</Context.Provider>;
}
export const useAccess=()=>useContext(Context);
