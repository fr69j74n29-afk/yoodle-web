// Find a helper: skills / services grid and filters.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// ══ FIND A HELPER ══
// "Find a helper" button (top bar) → popup of categories with helper counts → pick one:
// popup closes and matching helper pins glow amber; other helper pins fade. Job pins unchanged.
// Client-side only (no Supabase changes). Categories come from the helper_categories table,
// shared by helper profiles and (now) jobs.
const YS_FALLBACK_CATS=[
  {name:'Cleaning',emoji:'🧹'},{name:'Yard & Garden',emoji:'🌿'},{name:'Moving & Lifting',emoji:'📦'},
  {name:'Errands',emoji:'🛒'},{name:'Pet Care',emoji:'🐾'},{name:'Snow & Seasonal',emoji:'❄️'},
  {name:'Handyman',emoji:'🔧'},{name:'Tech Help',emoji:'💻'},{name:'Tutoring',emoji:'📚'},
  {name:'Childcare',emoji:'👶'},{name:'General Labour',emoji:'👷'},{name:'Other',emoji:'✨'}
];
// old job category keys → shared category names (lowercase)
const YS_ALIAS={assembly:'handyman',yard:'yard & garden',moving:'moving & lifting'};
let ysCats=YS_FALLBACK_CATS.slice(), hsCat=null;
let ysBaseJobs=[], ysBaseHelpers=[];

function ysKey(s){s=String(s||'').trim().toLowerCase();return YS_ALIAS[s]||s;}
function ysHelperCats(h){return (h.helper_categories||[]).map(ysKey);}
function ysEmoji(cat){const c=ysCats.find(x=>ysKey(x.name)===ysKey(cat));return c?c.emoji:'';}
function ysLabel(cat){const c=ysCats.find(x=>ysKey(x.name)===ysKey(cat));return c?c.name:cat;}
function ysAttr(k){return esc(k).replace(/'/g,"\\'");}
// highlight only, no filtering: counts, list and pins keep everyone
// Filter button (15 Nov 2026): hsCat can also be 'ready:today' / 'ready:tomorrow' (⚡ Ready to work) — one pick at a time
const FS_READY={'ready:today':{emoji:'⚡',label:'Can start today'},'ready:tomorrow':{emoji:'⚡',label:'Can start tomorrow'}};
function fsReadyOk(h,k){const r=h&&readyIds.get(h.id);return !!r&&(k==='ready:today'?r.today:r.tomorrow);}
function hsName(k){if(window.hsvcIsKey&&hsvcIsKey(k))return hsvcFilterName(k);return FS_READY[k]?FS_READY[k].label:ysLabel(k);}
function hsIcon(k){if(window.hsvcIsKey&&hsvcIsKey(k))return hsvcFilterIcon(k);return FS_READY[k]?FS_READY[k].emoji:ysEmoji(k);}
function hsMatch(h){if(!hsCat)return false;if(window.hsvcIsKey&&hsvcIsKey(hsCat))return hsvcFilterMatch(h,hsCat);if(FS_READY[hsCat])return fsReadyOk(h,hsCat);return ysHelperCats(h).includes(hsCat);}

async function ysInit(){
  try{
    if(sb){
      const{data}=await sb.from('helper_categories').select('name,emoji,sort_order').eq('active',true).order('sort_order');
      if(data&&data.length){
        // 'Other' last; everything else in sort_order
        ysCats=data.filter(c=>ysKey(c.name)!=='other').concat(data.filter(c=>ysKey(c.name)==='other'));
      }
    }
  }catch(e){}
  ysRenderPostCats();ysRender();
}

// called from updateRadiusCounts() — keep popup counts fresh while it's open
// 21 Nov 2026: also refreshes the "💲 Fixed-price services" choice (js/home-services.js) — shown only when a nearby helper offers one
function ysRender(){if(window.hsvcFilterRefresh)hsvcFilterRefresh();if(document.getElementById('hs-ov')?.classList.contains('open'))hsRenderGrid();}

function hsRenderGrid(){
  const el=document.getElementById('hs-grid');if(!el)return;
  const counts={};ysCats.forEach(c=>counts[ysKey(c.name)]=0);
  ysBaseHelpers.forEach(h=>new Set(ysHelperCats(h)).forEach(k=>{if(k in counts)counts[k]++;}));
  const sub=document.getElementById('hs-sub');
  if(sub)sub.textContent=userLat&&userLng?`${ysBaseHelpers.length} ${ysBaseHelpers.length===1?'helper':'helpers'} within ${RADIUS_KM} km`:'Share your location to see helpers nearby';
  const rd=document.getElementById('hs-ready');
  // standby buttons: no counts (small numbers made it look like only 1–2 people are available — Roman, 15 Nov 2026)
  if(rd)rd.innerHTML=Object.keys(FS_READY).map(k=>
    `<button class="hs-cat${hsCat===k?' on':''}" onclick="hsPick('${k}')"><span class="e">⚡</span><span class="t">${k==='ready:today'?'Start today':'Start tomorrow'}</span></button>`).join('');
  el.innerHTML=ysCats.map(c=>{
    const k=ysKey(c.name),n=counts[k]||0;
    return `<button class="hs-cat${n?'':' zero'}${hsCat===k?' on':''}" onclick="hsPick('${ysAttr(k)}')"><span class="e">${c.emoji||''}</span><span class="t">${esc(c.name)}</span><span class="n">${n}</span></button>`;
  }).join('');
}
function _hsInList(){return document.getElementById('app-list')?.classList.contains('active');}
function fsStep(s){
  ['start','help','pro','become','svc','suggest'].forEach(x=>document.getElementById('fs-'+x)?.classList.toggle('on',x===s));
  if(s==='svc'&&window.hsvcFilterGrid)hsvcFilterGrid(); // 💲 Fixed-price services (js/home-services.js)
  if(s==='suggest'&&window.hsvcSuggestOpen)hsvcSuggestOpen(); // "Missing a service? Suggest one →" (js/home-services.js, 27 Nov 2026)
  if(s==='help')hsRenderGrid();
  if(s==='pro')psRenderGrid();
  if(s==='become'){const g=document.getElementById('fs-go');if(g){g.disabled=false;g.textContent='Continue';}}
}
function hsOpen(step){
  // from the list, stay in the list; from anywhere else, go to the map
  if(!document.getElementById('app-map').classList.contains('active')&&!_hsInList())nav('map');
  fsStep(step||'start');openOv('hs-ov');
}
function hsClose(){closeOv('hs-ov');}
function hsToggle(){document.getElementById('hs-ov').classList.contains('open')?hsClose():hsOpen();}
function fsClear(){if(psTrade)psPick(null);else hsPick(null);}
// "Become a PRO" → leaves yoodle.ca for pro.yoodle.ca (tap logged as search 'pro:become', no helper count)
async function fsBecomePro(){
  const g=document.getElementById('fs-go');if(g){g.disabled=true;g.textContent='Opening…';}
  try{if(sb&&me)await Promise.race([sb.rpc('log_search',{p_category:'pro:become',p_helpers:null,p_radius:Math.round(RADIUS_KM)||0}),new Promise(r=>setTimeout(r,1200))]);}catch(e){}
  // App: open it in the in-app browser sheet (a page navigation would be thrown out to Safari) and reset the button
  if(IS_NATIVE){window.open('https://pro.yoodle.ca/');if(g){g.disabled=false;g.textContent='Continue';}return;}
  window.location.href='https://pro.yoodle.ca/';
}
function hsPick(k){
  hsCat=k||null;hsClose();
  if(hsCat&&psTrade){psTrade=null;psSetBtn();} // one filter at a time: a helper pick clears the pro pick
  const btn=document.getElementById('hs-btn'),lbl=document.getElementById('hs-label'),x=document.getElementById('hs-x');
  if(hsCat){
    btn.classList.add('on');btn.classList.remove('pro-on');lbl.textContent=`${hsIcon(hsCat)} ${hsName(hsCat)}`;btn.title=hsName(hsCat);x.style.display='inline-flex';
    if(_hsInList()){if(listTab!=='helpers')switchListTab('helpers');}
    else if(!document.getElementById('app-map').classList.contains('active'))nav('map');
    const n=ysBaseHelpers.filter(hsMatch).length;
    logSearch(hsCat,n);
    if(FS_READY[hsCat]){const d=hsCat==='ready:today'?'today':'tomorrow';
      toast(n?`⚡ ${n} ${n===1?'helper':'helpers'} nearby can start ${d}`:`No standby helpers for ${d} within ${RADIUS_KM} km yet — try zooming out`);}
    else toast(n?`✨ ${n} ${hsName(hsCat)} ${n===1?'helper':'helpers'} nearby`:`No ${hsName(hsCat)} helpers within ${RADIUS_KM} km yet — try zooming out`);
  }else if(!psTrade){
    btn.classList.remove('on','pro-on');lbl.textContent='Filter';btn.title='';x.style.display='none';
  }
  renderMapPins();
  renderListTabContent(); // list Helpers tab follows the Find-a-helper filter
}
