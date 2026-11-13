import {useEffect,useLayoutEffect,useRef,useState,useId} from 'react';
import {createPortal} from 'react-dom';
import './workspace-menu.css';
export const workspaces=[
 ['/studio','Quantum Computing','1–100 logical qubits · adaptive exact simulation'],
 ['/1000-plus','1000+ Qubit','1,000–4,096 logical qubits · exact Clifford / separable'], 
 ['/lab','Quantum Lab Twin','Hardware playground & guided operations'],
 ['/sensing','Sensing & Metrology','Magnetometry, clocks & gravimetry'],
 ['/communication','Communication & Cryptography','BB84, optical links & entanglement'],
];
export default function WorkspaceMenu(){
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),id=useId();
 const [open,setOpen]=useState(false),[position,setPosition]=useState({top:0,left:0,width:370,maxHeight:500});
 useLayoutEffect(()=>{if(!open)return;const place=()=>{const rect=trigger.current!.getBoundingClientRect(),width=Math.min(370,innerWidth-24);setPosition({left:Math.max(12,Math.min(rect.right-width,innerWidth-width-12)),top:rect.bottom+8,width,maxHeight:Math.max(100,innerHeight-rect.bottom-20)});};place();addEventListener('resize',place);addEventListener('scroll',place,true);return()=>{removeEventListener('resize',place);removeEventListener('scroll',place,true);};},[open]);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{const target=e.target as Node;if(!trigger.current?.contains(target)&&!panel.current?.contains(target))setOpen(false);};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};const focus=(e:FocusEvent)=>{const target=e.target as Node;if(!trigger.current?.contains(target)&&!panel.current?.contains(target))setOpen(false);};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);document.addEventListener('focusin',focus);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);document.removeEventListener('focusin',focus);};},[open]);
 const focusLink=(last=false)=>requestAnimationFrame(()=>{const links=panel.current?.querySelectorAll('a');links?.[last?links.length-1:0]?.focus();});
 return <div className="workspace-menu"><button type="button" ref={trigger} className="workspace-trigger" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);focusLink(e.key==='ArrowUp');}else if(e.key==='Tab'&&open&&!e.shiftKey){e.preventDefault();focusLink();}}}>Quantum Workspace <span aria-hidden="true">⌄</span></button>
 {open&&createPortal(<div ref={panel} id={id} className="workspace-options" style={position} aria-label="Choose a quantum workspace" onKeyDown={e=>{const links=[...panel.current!.querySelectorAll('a')],i=links.indexOf(document.activeElement as HTMLAnchorElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();links[e.key==='Home'?0:e.key==='End'?links.length-1:(i+(e.key==='ArrowDown'?1:-1)+links.length)%links.length]?.focus();}if(e.key==='Tab'&&e.shiftKey&&i===0){e.preventDefault();trigger.current?.focus();setOpen(false);}}}><p>CHOOSE YOUR WORKSPACE</p>{workspaces.map(([href,title,description],i)=><a key={href} href={href} aria-current={location.pathname===href||location.pathname.startsWith(href+'/')?'page':undefined} onClick={()=>setOpen(false)}><span className="workspace-number">0{i+1}</span><span><strong>{title}</strong><small>{description}</small></span><span aria-hidden="true">↗</span></a>)}</div>,document.fullscreenElement??document.body)}
 </div>;
}
