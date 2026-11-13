/** Original MAH carrier artwork: machined frame, ceramic connectors and red PCB. */
export default function ChipFabrication(){
 return <svg className="precision-fabrication red-carrier-detail" viewBox="0 0 500 600" aria-hidden="true">
 <defs>
  <linearGradient id="mah-frame" x2=".8" y2="1"><stop stopColor="#ffedaa"/><stop offset=".18" stopColor="#b67c23"/><stop offset=".37" stopColor="#fff2b8"/><stop offset=".49" stopColor="#e5bb58"/><stop offset=".53" stopColor="#755019"/><stop offset=".8" stopColor="#e7be61"/><stop offset="1" stopColor="#fff2bb"/></linearGradient>
  <linearGradient id="mah-ceramic" x2="0" y2="1"><stop stopColor="#fffde8"/><stop offset=".5" stopColor="#d9d6bc"/><stop offset=".9" stopColor="#f4efda"/><stop offset="1" stopColor="#929888"/></linearGradient>
  <radialGradient id="mah-socket"><stop stopColor="#0b0905"/><stop offset=".5" stopColor="#292114"/><stop offset=".62" stopColor="#f5d68a"/><stop offset=".8" stopColor="#8b6329"/><stop offset="1" stopColor="#ffe6a1"/></radialGradient>
 </defs>
 <rect x="-12" y="-12" width="524" height="624" rx="36" fill="none" stroke="#1b1009" strokeWidth="32" transform="translate(3 8)"/>
 <rect x="-10" y="-10" width="520" height="620" rx="32" fill="none" stroke="url(#mah-frame)" strokeWidth="24"/>
 <rect x="5" y="5" width="490" height="590" rx="21" fill="none" stroke="#fff0b0" strokeWidth="2"/>
 <rect x="15" y="15" width="470" height="570" rx="15" fill="none" stroke="#641018" strokeWidth="7"/>
 {[0,1].map(side=><g key={side} transform={side?'translate(500 600) rotate(180)':undefined}>
  {Array.from({length:7},(_,i)=><g key={i}><circle cx="4" cy={50+i*82} r="10" fill="url(#mah-socket)"/><circle cx="4" cy={50+i*82} r="4" fill="#120d07"/></g>)}
  {Array.from({length:62},(_,i)=><g key={i}><rect x={38+i*6.8} y="27" width="3.6" height="15" rx="1" fill="#e9c77e"/><path d={`M${40+i*6.8} 43 V${62+i%4*4} L${80+i*5.6} 120 V${175+i%3*8}`} fill="none" stroke={i%3?'#dc8f65':'#f8d69b'} strokeWidth={i%3?'.8':'1.5'}/></g>)}
  <rect x="69" y="63" width="362" height="51" rx="6" fill="#23080c" transform="translate(3 5)"/>
  <rect x="66" y="59" width="368" height="51" rx="6" fill="url(#mah-ceramic)" stroke="#fcf5d0" strokeWidth="2"/>
  <rect x="116" y="71" width="268" height="27" rx="3" fill="#9b6b28" stroke="#ffedba"/>
  <rect x="123" y="75" width="254" height="18" rx="2" fill="#371b11"/>
  {Array.from({length:45},(_,i)=><path key={i} d={`M${128+i*5.5} 76 v16`} stroke="#f5dc97" strokeWidth="2"/>)}
  {[89,411].map(x=><g key={x}><circle cx={x} cy="84" r="10" fill="url(#mah-socket)"/><path d={`M${x-4} 84 h8 M${x} 80 v8`} stroke="#4a351c" strokeWidth="2"/></g>)}
  {Array.from({length:30},(_,i)=><g key={i}><circle cx={35+i*15} cy="129" r="2.8" fill="#efc77e"/><circle cx={35+i*15} cy="129" r="1.2" fill="#6b1120"/></g>)}
 </g>)}
 {Array.from({length:36},(_,i)=><g key={i}>
  <path d={`M30 ${150+i*8} H${46+i%4*6} L${108+i%3*6} ${180+i*6.5} H160`} stroke="#eeaf72" strokeWidth="1" fill="none"/>
  <path d={`M470 ${150+i*8} H${450-i%4*6} L${398-i%3*6} ${180+i*6.5} H360`} stroke="#e69d66" strokeWidth="1" fill="none"/>
  <circle cx="27" cy={152+i*8} r="2" fill="#e8bd74"/>
  <circle cx="473" cy={152+i*8} r="2" fill="#e8bd74"/>
 </g>)}
 {[0,1].map(side=><g key={side} transform={`translate(${side?440:43} 0)`}>{Array.from({length:15},(_,i)=><g key={i} transform={`translate(0 ${163+i*18})`}><rect width="16" height="9" rx="1" fill="#35151a"/><rect width="3" height="9" fill="#e2d4b9"/><rect x="13" width="3" height="9" fill="#e2d4b9"/><rect x="5" y="2" width="6" height="5" fill={i%3?'#b89d79':'#171719'}/></g>)}</g>)}
 {[[33,37],[467,37],[33,563],[467,563]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="13" fill="url(#mah-socket)"/><path d={`M${x-5} ${y-3} l5 -3 l5 3 v6 l-5 3 l-5 -3 Z`} fill="#1f170c"/></g>)}
 <text x="250" y="146" fill="#f6d6ba" fontSize="8" fontFamily="monospace" textAnchor="middle" letterSpacing="3">MAH QUANTUM</text>
 <text x="250" y="470" fill="#edcbb7" fontSize="6" fontFamily="monospace" textAnchor="middle" letterSpacing="2">PRECISION CARRIER / REV 05</text>
 </svg>;
}
export function ChipCore(){return <div className="mah-core-shield">
 <div className="mah-shield-grain"/>
 <div className="mah-chip-brand"><img src="/mah-quantum-logo.jpg" alt=""/><strong>MAH<br/>QUANTUM</strong><span>DEVASHRI S QUANTUM</span></div>
 <div className="mah-die-window die-window-one"><svg viewBox="0 0 100 180" aria-hidden="true"><rect x="8" y="8" width="84" height="164" rx="19" fill="#263b41" stroke="#c6d8d0" strokeWidth="3"/><rect x="23" y="24" width="54" height="132" rx="10" fill="#101f29" stroke="#b4965b"/>{Array.from({length:20},(_,i)=><g key={i}><path d={`M8 ${30+i*6} Q20 ${27+i*6} 28 ${34+i*5.5} M92 ${30+i*6} Q80 ${27+i*6} 72 ${34+i*5.5}`} fill="none" stroke="#f9dc8f" strokeWidth=".9"/><rect x="34" y={35+i*5.5} width="32" height="1" fill="#7e9ea4"/></g>)}<path d="M46 42 V134 M54 42 V134 M46 88 H54" stroke="#e3e8da" fill="none" strokeWidth="2"/></svg></div>
 <div className="mah-die-window die-window-two"><svg viewBox="0 0 100 120" aria-hidden="true"><defs><linearGradient id="mah-die-film"><stop stopColor="#b7d4bc"/><stop offset=".4" stopColor="#6d9d9b"/><stop offset="1" stopColor="#54747b"/></linearGradient></defs><rect x="13" y="13" width="74" height="94" fill="url(#mah-die-film)" stroke="#d9d9ad" strokeWidth="2"/>{Array.from({length:15},(_,i)=><g key={i}><path d={`M${18+i*4.5} 5 V15 M${18+i*4.5} 105 V115 M5 ${20+i*5.5} H15 M85 ${20+i*5.5} H95`} stroke="#ffe2a3" strokeWidth="1.5"/><path d={`M${20+i*4} 21 V99 M21 ${24+i*5} H79`} stroke="#d5dfc0" opacity=".5" strokeWidth=".5"/></g>)}<rect x="29" y="33" width="42" height="54" fill="none" stroke="#edf2d6"/><path d="M38 42 V78 M62 42 V78 M38 60 H62" fill="none" stroke="#eee7b9" strokeWidth="3"/></svg></div>
 <div className="mah-package-fasteners"><i/><i/><i/><i/></div>
 </div>;}
