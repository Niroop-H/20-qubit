import {FormEvent,ReactNode,useEffect,useState} from 'react';
import SiteHeader from './SiteHeader';
import {useAccess} from './access/AccessProvider';
import './workspace-access.css';
export default function WorkspaceAccess({children}:{children:ReactNode}){
 const access=useAccess();
 const [busy,setBusy]=useState(false),[code,setCode]=useState(''),[error,setError]=useState(''),[retryAt,setRetryAt]=useState(0),[now,setNow]=useState(Date.now());
 useEffect(()=>{if(!retryAt)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[retryAt]);
 async function submit(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');const result=await access.submit(code);setNow(Date.now());if(result.ok){setCode('');setRetryAt(0);}else{setError(result.error||'Unable to verify access.');setRetryAt(result.retryAt||0);}setBusy(false);}
 if(access.ready&&access.allowed)return <>{children}</>;
 const seconds=Math.max(0,Math.ceil((retryAt-now)/1000));const remaining=`${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m ${seconds%60}s`;
 return <div className="access-page"><SiteHeader/><main className="access-main"><form className="access-card" onSubmit={submit}><span className="access-eyebrow">MAH QUANTUM / WORKSPACE</span><h1>Workspace access</h1><p>Enter your access code to continue.</p>{!access.ready?<p role="status">Checking access…</p>:<><label htmlFor="workspace-code">Access code</label><input id="workspace-code" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={code} onChange={e=>{setCode(e.target.value);setRetryAt(0);setError('');}} required disabled={busy}/><button className="access-submit" disabled={busy||!code||seconds>0}>{busy?'Verifying…':'Continue'}</button>{(error||access.error)&&<p role="alert" className="access-error">{error||access.error}</p>}{seconds>0&&<p className="access-countdown">Available again in {remaining}</p>}{retryAt>0&&seconds===0&&<p role="status">The timeout has ended. You can try this code again.</p>}</>}<a href="/">← Back to home</a></form></main></div>;
}
