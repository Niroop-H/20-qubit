import {createContext,useContext,useEffect,useState,ReactNode} from 'react';
type Theme='dark'|'light';
const ThemeContext=createContext<{theme:Theme;setTheme:(theme:Theme)=>void}>({theme:'dark',setTheme:()=>{}});
export function ThemeProvider({children}:{children:ReactNode}){
 const [theme,setTheme]=useState<Theme>(()=>{try{return localStorage.getItem('mah-color-theme')==='light'?'light':'dark';}catch{return 'dark';}});
 useEffect(()=>{document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;try{localStorage.setItem('mah-color-theme',theme);}catch{/* Theme still works when storage is unavailable. */}},[theme]);
 useEffect(()=>{const sync=(e:StorageEvent)=>{if(e.key==='mah-color-theme')setTheme(e.newValue==='light'?'light':'dark');};addEventListener('storage',sync);return()=>removeEventListener('storage',sync);},[]);
 return <ThemeContext.Provider value={{theme,setTheme}}>{children}</ThemeContext.Provider>;
}
export const useTheme=()=>useContext(ThemeContext);
