import WorkspaceMenu from './WorkspaceMenu';
import {useTheme} from './Theme';
import './site-header.css';
export default function SiteHeader(){
 const {theme,setTheme}=useTheme();
 return <header className="site-header" aria-label="MAH Quantum main header">
  <a href="/" className="site-brand"><img src="/mah-quantum-logo.jpg" width="38" height="38" alt=""/><span>MAH Quantum - Devashri S Quantum</span></a>
  <nav className="site-links" aria-label="Main navigation"><a href="/#architecture">Architecture</a><a href="/#explore">Experience</a><a href="/#questions">Questions</a></nav>
  <div className="site-header-actions"><label className="theme-picker"><span aria-hidden="true">{theme==='dark'?'◐':'☀'}</span><select aria-label="Color theme" value={theme} onChange={e=>setTheme(e.target.value as 'dark'|'light')}><option value="dark">Dark black</option><option value="light">Light</option></select></label><WorkspaceMenu/></div>
 </header>;
}
