// Guest map (signed-out preview, iOS/landing redesign step 3, 27 Nov 2026): pins, tile sheet and action sheet for visitors who aren't signed in.
// Data: get_guest_map_preview() = the member map's own helpers/jobs around Toronto, no names, positions rounded to ~100 m.
// Wording: app_text rows "guest.*" (Supabase), with the same text built in as a fallback.
// Defines functions only — nothing runs on load. Used by the landing page preview (step 4) and the iOS guest mode (step 6).
// Never calls member functions (get_helpers_near / get_open_jobs_near are closed to signed-out visitors since step 0).

let _gmRows=null, _gmText={}, _gmLoading=null, _gmMarkers=[];

// Text from app_text, or the built-in fallback. {n} and {area} are filled in. Returned as plain text (escape before HTML).
function gT(key,fallback,vars){
  let t=(_gmText&&_gmText[key])||fallback||'';
  if(vars)Object.keys(vars).forEach(k=>{t=t.split('{'+k+'}').join(String(vars[k]));});
  return t;
}

// Loads the guest pins + guest wording once (later calls reuse the first result).
function guestMapLoad(){
  if(_gmRows)return Promise.resolve(_gmRows);
  if(_gmLoading)return _gmLoading;
  _gmLoading=Promise.all([
    sb.rpc('get_guest_map_preview'),
    sb.from('app_text').select('key,text').like('key','guest.%')
  ]).then(([pins,txt])=>{
    if(txt&&!txt.error)(txt.data||[]).forEach(r=>{_gmText[r.key]=r.text;});
    if(pins.error)throw pins.error;
    _gmRows=pins.data||[];
    return _gmRows;
  }).catch(e=>{console.warn('[guest-map] load: '+(e&&e.message||e));_gmLoading=null;return [];});
  return _gmLoading;
}

// Same look as the member map pins: green helpers (✓ ID tick, ⚡ ready), red neighbour jobs (category emoji), blue agency/employer jobs, white count badge on stacks.
const GM_HELPER='#5C8A6A', GM_JOB='#DC2626', GM_AGENCY=(typeof AGENCY_PIN!=='undefined'?AGENCY_PIN:'#2563EB');
function _gmPinHtml(group){
  const n=group.length, isHelper=group[0].kind==='helper';
  const badge=n>1?`<span style="position:absolute;top:-6px;right:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#fff;color:#111;font:800 12px/20px 'Nunito',sans-serif;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.25)">${n}</span>`:'';
  if(isHelper){
    const tick=n===1&&group[0].id_verified?'<span class="idv-tick">✓</span>':'';
    const bolt=group.some(r=>r.ready)?'<span class="rtw-in" title="Ready to work">⚡</span>':'';
    const label=n>1?`<span style="font:900 15px 'Nunito',sans-serif;color:#fff">${n}</span>`:'';
    return `<div style="position:relative;width:38px;height:38px;border-radius:50%;background:${GM_HELPER};border:3px solid rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.15);cursor:pointer">${label}${tick}${bolt}</div>`;
  }
  const agency=group.every(r=>r.kind==='job_listing');
  const color=agency?GM_AGENCY:GM_JOB;
  const cat=(group[0].categories||[])[0];
  const emoji=agency?'':(n>1?'📋':((typeof CAT_EMOJI!=='undefined'&&CAT_EMOJI[cat])||(window.ysEmoji&&ysEmoji(cat))||'📋'));
  return `<div style="position:relative;width:38px;height:38px;border-radius:50%;background:${color};border:3px solid rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,.15);cursor:pointer">${emoji}${badge}</div>`;
}

// Draws the guest pins on a MapLibre map (the guest preview map, not the member map). Rows on the same spot become one stack.
function guestDrawPins(targetMap,rows){
  _gmMarkers.forEach(m=>m.remove());_gmMarkers=[];
  if(!targetMap||!rows)return;
  const groups={};
  rows.forEach(r=>{const k=(r.kind==='helper'?'h':'j')+(+r.lat).toFixed(4)+','+(+r.lng).toFixed(4);(groups[k]=groups[k]||[]).push(r);});
  Object.values(groups).forEach(g=>{
    const el=document.createElement('div');
    el.style.width='38px';el.style.height='38px';
    el.style.zIndex=g[0].kind==='helper'?(g.some(r=>r.ready)?'15':'10'):'20'; // same order as the member map: jobs in front of helpers
    el.innerHTML=_gmPinHtml(g);
    el.addEventListener('click',e=>{e.stopPropagation();guestOpenTiles(g);});
    _gmMarkers.push(new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([+g[0].lng,+g[0].lat]).addTo(targetMap));
  });
}

// Guest tiles: same markup and classes as the member tiles (list-card for jobs, list-tile for helpers), without names or links.
function _gmJobTile(r){
  const agency=r.kind==='job_listing', color=agency?GM_AGENCY:GM_JOB;
  const pay=agency?(r.price!=null?`$${r.price}/hr`:'See posting'):`$${r.price??'?'}`;
  const poster=r.poster_label||'Neighbour';
  return `<div class="list-card" style="--jc:${color}" onclick="guestOpenActions()">
    <div class="lc-top"><span class="lc-title">${esc(r.title||'')}</span><div style="display:flex;align-items:center;gap:4px;flex-shrink:0"><span class="lc-budget">${esc(pay)}</span></div></div>
    <div class="lc-desc">${esc(r.snippet||'')}</div>
    <div class="lc-foot">
      <div class="lc-poster"><div class="lc-av">${avatarCircle(poster,null,'20px','9px',false,color)}</div><span class="lc-name">${esc(poster)}</span></div>
      <span class="lc-meta">${r.posted_at?timeAgo(r.posted_at):''}</span>
    </div>
  </div>`;
}
function _gmHelperTile(r){
  const cats=(r.categories||[]).slice(0,4).map(c=>`<span style="font-size:11.5px;font-weight:800;color:var(--purple);background:rgba(92,138,106,.08);border:1px solid rgba(92,138,106,.18);border-radius:100px;padding:2px 8px;white-space:nowrap">${esc(c)}</span>`).join('');
  const rate=r.rate_type==='free'||!r.price?'Free':`$${r.price}${r.rate_type==='hourly'?'/hr':r.rate_type==='daily'?'/day':' flat'}`;
  const name=r.title||'Helper';
  return `<div class="list-tile" onclick="guestOpenActions()" style="background:var(--surface);border-radius:var(--radius-sm);padding:14px 16px;border:1.5px solid var(--border);display:flex;flex-direction:column;gap:8px;cursor:pointer">
    <div style="display:flex;align-items:center;gap:12px">
      ${avatarCircle(name,null,'28px','12px')}
      <div style="min-width:0;flex:1">
        <div style="font-size:15px;font-weight:800">${esc(name)}${r.id_verified?'<span class="idv-chip" title="ID checked by Stripe">✓ ID</span>':''}${r.ready?'<span class="rtw-chip" title="Ready to work">⚡ Ready</span>':''}</div>
        <div style="display:flex;align-items:center;gap:8px"><span style="font-size:13.5px;color:var(--lime);font-weight:800">${esc(rate)}</span></div>
      </div>
      <div style="font-size:13.5px;color:var(--muted);font-weight:800;flex-shrink:0">View ›</div>
    </div>
    ${cats?`<div style="display:flex;flex-wrap:wrap;gap:4px">${cats}</div>`:''}
  </div>`;
}

// Pin tap → the existing #stack-modal sheet with guest tiles. Title from app_text ("5 jobs in Woodbridge", "1 helper in this area").
function guestOpenTiles(group){
  if(!group||!group.length)return;
  const n=group.length, isHelper=group[0].kind==='helper', area=!isHelper&&group[0].area;
  const title=isHelper
    ?(n===1?gT('guest.sheet.helper','1 helper in this area'):gT('guest.sheet.helpers','{n} helpers in this area',{n}))
    :(area
      ?(n===1?gT('guest.sheet.job_area','1 job in {area}',{area}):gT('guest.sheet.jobs_area','{n} jobs in {area}',{n,area}))
      :(n===1?gT('guest.sheet.job_here','1 job in this area'):gT('guest.sheet.jobs_here','{n} jobs in this area',{n})));
  document.getElementById('stack-title').textContent=title;
  document.getElementById('stack-list').innerHTML=group.map(r=>isHelper?_gmHelperTile(r):_gmJobTile(r)).join('');
  openOv('stack-modal');
}

// Tile tap or the guest + button → one sheet: Post a job or task · Find me work · Sign in.
// Built once with the same modal classes as the rest of the app.
function guestOpenActions(title){
  closeOv('stack-modal');
  let ov=document.getElementById('guest-actions');
  if(!ov){
    ov=document.createElement('div');
    ov.className='modal-ov';ov.id='guest-actions';
    ov.addEventListener('click',e=>{if(e.target===ov)closeOv('guest-actions');});
    document.body.appendChild(ov);
  }
  const btn=(icon,bg,t,sub,act)=>`<button type="button" class="ga-choice" onclick="closeOv('guest-actions');${act}" style="border:1.5px solid var(--border)">
      <div class="ga-choice-ico" style="background:${bg}">${icon}</div>
      <div><div class="ga-choice-t">${esc(t)}</div>${sub?`<div class="ga-choice-d">${esc(sub)}</div>`:''}</div></button>`;
  ov.innerHTML=`<div class="modal-sheet"><div class="modal-handle"></div>
    <div class="modal-title" style="margin-bottom:14px">${esc(title||gT('guest.more.title','Sign in to see more'))}</div>
    ${btn('<span style="font-size:22px;font-weight:900;color:#1E2620">+</span>','#F97316',gT('guest.action.post','Post a job or task'),gT('guest.action.post_sub','I have a task that needs doing'),"openGuestPost()")}
    ${btn('<span style="font-size:20px;color:#1E2620">☆</span>','#8DE0A8',gT('guest.action.work','Find me work'),gT('guest.action.work_sub','I want to offer a skill or service'),"openAuthSheet('helper')")}
    ${btn('<span style="font-size:18px;color:#1E2620">→</span>','var(--sage-soft,#E3ECE5)',gT('guest.action.signin','Sign in'),'',"openAuthSheet('signin')")}
  </div>`;
  openOv('guest-actions');
}

// ── Step 4: landing page preview map (27 Nov 2026) ──
// Short Toronto map on the signed-out landing page: above "What would you like to do?" on phones, beside it on desktop (≥ 900 px, CSS).
// Zoom only, never moves away from the GTA: no dragging (a one-finger swipe scrolls the page), pinch / double-tap zoom around the centre,
// desktop: + / − buttons and the mouse wheel scrolls the page. Started after the landing text is on screen. Runs once.
let _gmPreviewMap=null;
function guestPreviewInit(){
  const box=document.getElementById('ga-map'), canvas=document.getElementById('ga-map-canvas');
  if(_gmPreviewMap||!box||!canvas||typeof maplibregl==='undefined')return;
  const start=()=>{
    if(_gmPreviewMap)return;
    box.hidden=false;
    const desktop=window.matchMedia('(min-width:900px)').matches;
    _gmPreviewMap=new maplibregl.Map({
      container:'ga-map-canvas',
      style:(typeof OFM_STYLE!=='undefined'&&typeof _curTheme==='function')?OFM_STYLE[_curTheme()]:'https://tiles.openfreemap.org/styles/positron',
      center:[-79.42,43.71], zoom:desktop?9.3:8.9, minZoom:8.6, maxZoom:13,
      maxBounds:[[-80.25,43.25],[-78.75,44.20]],
      dragPan:false, dragRotate:false, pitchWithRotate:false, touchPitch:false, scrollZoom:false, keyboard:false,
      attributionControl:false
    });
    _gmPreviewMap.touchZoomRotate.enable({around:'center'});
    _gmPreviewMap.touchZoomRotate.disableRotation();
    _gmPreviewMap.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>'}),'bottom-right');
    if(desktop)_gmPreviewMap.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
    // The map credit folds into the (i) button on the member map once you drag; guests can't drag, so fold it on load.
    _gmPreviewMap.on('load',()=>{const a=box.querySelector('.maplibregl-ctrl-attrib');if(a){a.classList.remove('maplibregl-compact-show');a.removeAttribute('open');}});
    guestMapLoad().then(rows=>{
      document.querySelectorAll('#ga-map [data-gt]').forEach(el=>{el.textContent=gT(el.dataset.gt,el.textContent);});
      guestDrawPins(_gmPreviewMap,rows);
    });
  };
  (window.requestIdleCallback||((f)=>setTimeout(f,300)))(start,{timeout:1500});
}
