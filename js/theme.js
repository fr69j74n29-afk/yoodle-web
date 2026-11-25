// Light / dark theme (also switches the map style).
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

/* ── THEMES ── */
const THEMES=['sage-light','sage-dark']; // 'classic' retired — saved value migrates to sage-dark via fallback below
function setTheme(name){
  if(!THEMES.includes(name))name='sage-dark';
  document.body.classList.remove(...THEMES.map(t=>'theme-'+t));
  if(name!=='sage-light')document.body.classList.add('theme-'+name);
  localStorage.setItem('yoodle-theme',name);
  THEMES.forEach(t=>{
    const el=document.getElementById('t-'+t);
    if(el)el.classList.toggle('active',t===name);
  });
  _refreshBaseStyle();
}
function toggleTheme(){
  setTheme(document.body.classList.contains('theme-sage-dark')?'sage-light':'sage-dark');
}
function initTheme(){
  const saved=localStorage.getItem('yoodle-theme');
  /* migrate old dark mode pref */
  if(!saved){
    const oldDark=localStorage.getItem('yoodle-dark');
    if(oldDark==='0') setTheme('sage-light');
    else setTheme('sage-dark');
    return;
  }
  setTheme(saved);
}

try{initTheme();}catch(e){}
