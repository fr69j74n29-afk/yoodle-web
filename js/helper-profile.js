// Helper profile screen, Find me work card, pause / cancel listing.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// Helper mode toggle
let helperLat=null,helperLng=null;
let helperLocSuggestionsData=[];
let helperLocDebounceTimer=null;
let helperEnteredFromFork=false;

// ── FORK SCREEN: "Find me work" card state ──
async function updateForkHelperCard(){
  const el=document.getElementById('fork-helper-card');
  if(!el)return;

  // Not signed in — show default tappable card
  if(!sb||!me){
    el.innerHTML=forkHelperCardNew();
    if(window.hsvcForkCard)hsvcForkCard(null);
    return;
  }

  const{data:prof}=await sb.from('profiles')
    .select('visible_on_map,helper_address,helper_categories,helper_expires_at')
    .eq('id',myProfileId||me.id).maybeSingle();
  if(window.hsvcForkCard)hsvcForkCard(prof); // + screen "My Fixed-Price Services" card (home-services.js)

  if(!prof||(!prof.helper_address&&!(prof.helper_categories||[]).length)){
    // Never set up
    el.innerHTML=forkHelperCardNew();
  } else if(prof.visible_on_map){
    // Active
    const expiry=prof.helper_expires_at?new Date(prof.helper_expires_at):null;
    const expiresLabel=expiry?`Expires ${expiry.toLocaleDateString('en-CA',{month:'short',day:'numeric'})}`:'Active';
    el.innerHTML=`
      <div style="width:100%;min-height:95px;display:flex;align-items:center;gap:16px;padding:20px;border-radius:16px;border:1.5px solid rgba(46,125,82,.15);background:rgba(46,125,82,.04)">
        <div style="width:52px;height:52px;border-radius:14px;background:rgba(46,125,82,.10);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <span style="font-size:24px">✅</span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:17px;font-weight:800;color:var(--text);margin-bottom:2px">You're listed as a helper</div>
          <div style="font-size:14px;font-weight:700;color:var(--lime)">${expiresLabel} · <button onclick="nav('profile')" style="background:none;border:none;padding:0;font-size:13.5px;font-weight:800;color:var(--muted);cursor:pointer;font-family:'Nunito',sans-serif;text-decoration:underline">Manage in Profile →</button></div>
        </div>
      </div>`;
  } else {
    // Paused or expired — offer renew right here
    const expired=prof.helper_expires_at&&new Date(prof.helper_expires_at)<new Date();
    const statusLabel=expired?'Your Helper Listing has expired':'Your Helper Listing is paused';
    el.innerHTML=`
      <div style="width:100%;min-height:95px;display:flex;align-items:center;gap:16px;padding:20px;border-radius:16px;border:1.5px solid var(--yellow);background:rgba(234,179,8,.06)">
        <div style="width:52px;height:52px;border-radius:14px;background:rgba(234,179,8,.15);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <span style="font-size:24px">⏸️</span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:800;color:var(--text)">${statusLabel}</div>
        </div>
        <button onclick="helperEnteredFromFork=true;nav('helper')" style="flex-shrink:0;padding:9px 16px;border-radius:100px;border:none;background:var(--btn-lime);color:#fff;font-family:'Nunito',sans-serif;font-size:13.5px;font-weight:800;cursor:pointer">Renew ✨</button>
      </div>`;
  }
}

function forkHelperCardNew(){
  return `
    <button onclick="helperEnteredFromFork=true;nav('helper')" style="width:100%;min-height:95px;display:flex;align-items:center;gap:16px;padding:20px;border-radius:16px;border:1.5px solid rgba(46,125,82,.20);background:rgba(46,125,82,.04);cursor:pointer;text-align:left;font-family:'Nunito',sans-serif;transition:border-color .15s">
      <div style="width:52px;height:52px;border-radius:14px;background:var(--lime);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="#1E2620" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </div>
      <div>
        <div style="font-size:17px;font-weight:800;color:var(--text);margin-bottom:2px">Find me work</div>
        <div style="font-size:14px;font-weight:700;color:var(--muted)">I want to offer a skill or service</div>
      </div>
    </button>`;
}



// "Tutor Profile" button (17 Nov 2026): only for helpers who picked the Tutoring tag. Opens tutor.yoodle.ca
// signed in, at tutor onboarding (same as the old "Become a Tutor" profile card) via openTutorSignedIn().
function tutorProfileBtn(prof){
  const tutors=(prof?.helper_categories||[]).some(c=>String(c).trim().toLowerCase()==='tutoring');
  return tutors?'<button onclick="openTutorSignedIn(null)" class="pf-btn sec">Tutor Profile ↗</button>':'';
}
function updateProfileHelperBlock(prof){
  const el=document.getElementById('helper-status-block');
  if(!el)return;

  const hasProfile=prof?.helper_address||(prof?.helper_categories||[]).length;

  if(!hasProfile){
    // Never set up
    el.innerHTML=`
      <button onclick="nav('helper')" class="pf-card" style="width:100%;display:flex;align-items:center;gap:12px;cursor:pointer;font-family:'Nunito',sans-serif;text-align:left">
        <div class="pf-ic g" aria-hidden="true">💪</div>
        <div style="flex:1">
          <div class="pf-t">Become a Helper</div>
          <div class="pf-d">Offer your skills to neighbours nearby</div>
        </div>
        <span style="font-size:18px;color:var(--muted)">›</span>
      </button>`;
    return;
  }

  if(prof.visible_on_map){
    // Active
    const expiry=prof.helper_expires_at?new Date(prof.helper_expires_at):null;
    const expiresLabel=expiry?`Expires ${expiry.toLocaleDateString('en-CA',{month:'short',day:'numeric'})}`:'';
    const cats=(prof.helper_categories||[]).slice(0,3);
    const catsHtml=cats.length?cats.map(c=>`<span style="font-size:11.5px;font-weight:800;color:var(--purple);background:rgba(92,138,106,.08);border:1px solid rgba(92,138,106,.18);border-radius:100px;padding:2px 8px">${esc(c)}</span>`).join(' '):'';
    el.innerHTML=`
      <div class="pf-card">
        <div class="pf-row" style="align-items:center">
          <div class="pf-ic g" aria-hidden="true">✅</div>
          <div style="flex:1;min-width:0">
            <div class="pf-t">Helper listing active</div>
            ${expiresLabel?`<div class="pf-d">${expiresLabel}</div>`:''}
          </div>
        </div>
        ${catsHtml?`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">${catsHtml}</div>`:''}
        <button onclick="shareMyHelperPage(null)" class="pf-btn">Share my page</button>
        <button onclick="nav('helper')" class="pf-btn sec">Edit helper profile</button>
        ${window.hsvcProfileBtn?hsvcProfileBtn():''}
        ${tutorProfileBtn(prof)}
      </div>`;
  } else {
    // Paused or expired
    const expired=prof.helper_expires_at&&new Date(prof.helper_expires_at)<new Date();
    const label=expired?'Helper listing expired':'Helper listing paused';
    const icon=expired?'⏰':'⏸️';
    el.innerHTML=`
      <div class="pf-card">
        <div class="pf-row" style="align-items:center">
          <div class="pf-ic y" aria-hidden="true">${icon}</div>
          <div style="flex:1">
            <div class="pf-t">${label}</div>
            <div class="pf-d">Your profile is hidden from searches</div>
          </div>
        </div>
        <button onclick="nav('helper')" class="pf-btn">${expired?'Renew listing':'Resume listing'}</button>
        ${window.hsvcProfileBtn?hsvcProfileBtn():''}
        ${tutorProfileBtn(prof)}
      </div>`;
  }
}


// ── HELPER PROFILE SCREEN ──
let hpLat=null,hpLng=null;
// Vague-location soft ask: city/province/country-only locations all land on one point
// (e.g. 7 helpers on Toronto City Hall). On save we ask once for a neighbourhood/street/postal code;
// "Skip" saves as-is. Nobody is blocked.
let hpLocVague=false,hpLocVagueAck=false;
const HP_VAGUE_TYPES=['city','town','village','municipality','county','state_district','state','province','region','country','administrative'];
function hpIsVagueItem(item){
  const t=item?.addresstype;
  if(t)return HP_VAGUE_TYPES.includes(t);
  const a=item?.address||{};
  return !(a.road||a.house_number||a.neighbourhood||a.suburb||a.quarter||a.postcode||a.hamlet||a.residential);
}
function hpIsVagueText(addr){ // saved profiles: "Toronto, Ontario" / "Ontario" / "Canada" → vague
  return String(addr||'').split(',').map(x=>x.trim()).filter(Boolean).length<=2;
}
function hpAskArea(){
  if(document.getElementById('hp-area-ask'))return;
  const city=(String(document.getElementById('hp-loc').value||'').split(',')[0]||'').trim()||'your city';
  // Count other helpers already pinned on this exact spot (~10 m, same key as the map stacks).
  // allHelpers already excludes the current user and blocked users.
  const _hpKey=(a,b)=>(+a).toFixed(4)+','+(+b).toFixed(4);
  const _hpK=_hpKey(hpLat,hpLng);
  const hpSameSpot=(allHelpers||[]).filter(h=>h.show_on_map&&h.last_lat&&h.last_lng&&_hpKey(h.last_lat,h.last_lng)===_hpK).length;
  // Readability: warning + bold count as the headline when others share the spot; body in full text colour.
  const hpAskIcon=hpSameSpot>0?'⚠️':'📍';
  const hpAskTitle=hpSameSpot>0
    ?`${hpSameSpot} other helper${hpSameSpot===1?' is':'s are'} pinned to this exact spot`
    :'Add your street?';
  const hpAskBody=hpSameSpot>0
    ?`Your pin sits in the middle of ${esc(city)}, so neighbours can't tell you apart. <b>Add your street address to stand out.</b>`
    :`Right now your pin sits in the middle of ${esc(city)}. Adding your street name helps nearby neighbours find you.`;
  const w=document.createElement('div');
  w.id='hp-area-ask';
  w.style.cssText='position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;justify-content:center;padding:16px 16px calc(16px + var(--sab,0px))';
  w.innerHTML=`<div style="width:100%;max-width:420px;background:var(--surface);color:var(--text);border-radius:var(--radius);padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.25);font-family:'Nunito',sans-serif">
    <div style="font-size:28px;line-height:1;margin-bottom:8px">${hpAskIcon}</div>
    <div style="font-size:18px;font-weight:800;margin-bottom:6px">${hpAskTitle}</div>
    <div style="font-size:15px;color:var(--text);font-weight:600;line-height:1.45;margin-bottom:8px">${hpAskBody}</div>
    <div style="font-size:15px;color:var(--text);font-weight:600;line-height:1.45;margin-bottom:16px">🔒 Your exact address is never shown.</div>
    <div style="display:flex;gap:10px">
      <button id="hpa-skip" style="flex:1;padding:12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);background:transparent;color:var(--muted);font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;cursor:pointer">Skip, use ${esc(city.length>14?'city':city)}</button>
      <button id="hpa-add" style="flex:1;padding:12px;border:none;border-radius:var(--radius-sm);background:var(--btn-a);color:#fff;font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;cursor:pointer">Add street</button>
    </div></div>`;
  document.body.appendChild(w);
  const close=()=>w.remove();
  w.addEventListener('click',e=>{if(e.target===w)close();});
  w.querySelector('#hpa-skip').addEventListener('click',()=>{close();hpLocVagueAck=true;saveHelperProfile();});
  w.querySelector('#hpa-add').addEventListener('click',()=>{close();hpStartAddArea(city);});
}
// "Add area": clear the location field and focus it (soft-ask card + own-pin tap)
function hpStartAddArea(city){
  {
    const inp=document.getElementById('hp-loc');
    inp.value='';inp.placeholder=`Street name in ${city}`;
    hpLat=null;hpLng=null;hpLocVague=false;
    const st=document.getElementById('hp-loc-status');st.textContent='Type your street name and pick it from the suggestions, or tap GPS';st.className='loc-status';
    // Focus first, then jump (no smooth scroll): focusing during a smooth scroll left the iPhone caret floating above the box
    try{inp.focus({preventScroll:true});}catch(e){inp.focus();}
    try{inp.scrollIntoView({block:'center'});}catch(e){}
  }
}
let hpRateType='free',hpSelectedCategories=new Set();

async function openHelperScreen(){
  // show loading in categories
  const container=document.getElementById('hp-categories');
  if(container)container.innerHTML='<span style="font-size:13.5px;color:var(--muted)">Loading categories…</span>';

  // fetch categories from DB
  const{data:cats,error:catErr}=await sb.from('helper_categories').select('*').eq('active',true).order('sort_order');
  if(catErr){
    if(container)container.innerHTML=`<span style="font-size:13.5px;color:#DC5046">Could not load categories — check RLS policy on helper_categories table.</span>`;
  } else if(cats&&container){
    container.innerHTML=cats.map(c=>`
      <button id="hpcat-${c.id}" onclick="toggleHPCategory('${c.name}',${c.id})"
        style="padding:8px 14px;border-radius:100px;border:1.5px solid var(--border);background:var(--surface2);color:var(--muted);font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer;transition:all .15s">
        ${c.emoji||''} ${c.name}
      </button>`).join('');
  }

  // pre-populate from saved profile
  const{data:prof}=await sb.from('profiles')
    .select('helper_address,helper_lat,helper_lng,helper_bio,helper_rate,helper_rate_type,helper_categories,visible_on_map')
    .eq('id',myProfileId||me.id).maybeSingle();

  if(prof?.helper_address){
    document.getElementById('hp-loc').value=prof.helper_address;
    hpLat=prof.helper_lat;hpLng=prof.helper_lng;
    hpLocVague=hpIsVagueText(prof.helper_address);hpLocVagueAck=false;
    const st=document.getElementById('hp-loc-status');
    st.textContent=`📍 ${prof.helper_address}`;st.className='loc-status verified';
  }
  if(prof?.helper_bio) document.getElementById('hp-bio').value=prof.helper_bio;
  if(prof?.helper_rate) document.getElementById('hp-rate').value=prof.helper_rate;
  if(prof?.helper_rate_type) setHPRateType(prof.helper_rate_type);

  // show pause option only when listing is currently active
  const pauseSection=document.getElementById('hp-pause-section');
  if(pauseSection) pauseSection.style.display=prof?.visible_on_map?'block':'none';
  const pauseBtn=document.getElementById('hp-pause-btn');
  if(pauseBtn){tapConfirmReset(pauseBtn);pauseBtn.innerHTML='Pause My Listing';}

  // restore selected categories
  hpSelectedCategories=new Set(prof?.helper_categories||[]);
  hpSelectedCategories.forEach(name=>{
    const cat=cats?.find(c=>c.name===name);
    if(cat) applyHPCategoryStyle(cat.id,true);
  });
  // own-pin tap with a city-only location → go straight to adding the neighbourhood
  if(hpFocusAreaNext){hpFocusAreaNext=false;if(hpLocVague)hpStartAddArea((String(prof?.helper_address||'').split(',')[0]||'').trim()||'your city');}
  if(window.yoodiAfterHelperLoad)yoodiAfterHelperLoad(); // Yoodi's bio draft, after the saved bio (js/yoodi.js)
}

function toggleHPCategory(name,id){
  if(hpSelectedCategories.has(name)){
    hpSelectedCategories.delete(name);
    applyHPCategoryStyle(id,false);
  } else {
    hpSelectedCategories.add(name);
    applyHPCategoryStyle(id,true);
  }
}

function applyHPCategoryStyle(id,selected){
  const btn=document.getElementById(`hpcat-${id}`);
  if(!btn)return;
  if(selected){
    btn.style.borderColor='var(--lime)';btn.style.background='rgba(46,125,82,.08)';btn.style.color='var(--lime)';
  } else {
    btn.style.borderColor='var(--border)';btn.style.background='var(--surface2)';btn.style.color='var(--muted)';
  }
}

function setHPRateType(type){
  hpRateType=type;
  ['free','hourly','daily','flat'].forEach(t=>{
    const btn=document.getElementById(`hprt-${t}`);
    if(!btn)return;
    const active=t===type;
    btn.style.borderColor=active?'var(--lime)':'var(--border)';
    btn.style.background=active?'rgba(46,125,82,.08)':'var(--surface2)';
    btn.style.color=active?'var(--lime)':'var(--muted)';
  });
  // hide price input if free
  document.getElementById('hp-rate').style.display=type==='free'?'none':'block';
}

function onHPRateInput(){
  if(parseFloat(document.getElementById('hp-rate').value)>0&&hpRateType==='free'){
    setHPRateType('hourly');
  }
}

const hpAddr=makeAddrSearch({sugId:'hp-loc-suggestions',statusId:'hp-loc-status',pickFn:'selectHPSuggestion',
  noResults:'No addresses found — try different search',
  format:item=>{const a=item.address||{};
    const main=a.house_number?`${a.house_number} ${a.road||''}`.trim():(a.road||a.neighbourhood||a.suburb||item.display_name.split(',')[0]);
    return{main:main.trim(),sub:[a.suburb||a.neighbourhood,a.city||a.town||a.village,a.state_code||a.state].filter(Boolean).join(', ')};}});

function onHPLocInput(val){
  hpLat=null;hpLng=null;
  if(hpGpsPending){hpGpsPending=null;document.getElementById('hp-gps-confirm').style.display='none';}
  hpAddr.input(val);
}

function selectHPSuggestion(i){
  const item=hpAddr.item(i);if(!item)return;
  const a=item.address||{};
  const road=a.house_number?`${a.house_number} ${a.road||''}`.trim():(a.road||'');
  const area=a.suburb||a.neighbourhood||a.city_district||'';
  const city=a.city||a.town||a.village||a.municipality||'';
  const prov=a.state_code||a.state||'';
  const display=addrDisplay([road,area,city,prov]);
  document.getElementById('hp-loc').value=display||item.display_name.split(',').slice(0,3).join(',').trim();
  hpLat=parseFloat(item.lat);hpLng=parseFloat(item.lon);
  hpLocVague=hpIsVagueItem(item);hpLocVagueAck=false;
  const st=document.getElementById('hp-loc-status');
  st.textContent=`📍 ${city||area||display}`;st.className='loc-status verified';
  closeOv('hp-loc-suggestions');
}

// Helper-profile GPS button: street-level reverse lookup, house number dropped,
// coordinates rounded to 3 decimals (~100 m) so the saved point isn't the helper's front door.
async function hpDetectLocation(){
  const inp=document.getElementById('hp-loc');const st=document.getElementById('hp-loc-status');
  if(isDemoAccount){demoLocationNote();inp.value='Downtown Toronto, ON';hpLat=DEMO_CENTER.lat;hpLng=DEMO_CENTER.lng;hpLocVague=false;hpLocVagueAck=false;st.textContent='📍 Demo account — downtown Toronto';st.className='loc-status manual';return;}
  // Safety check: GPS can be off (laptops, weak signal) — hold the result until the helper confirms it
  gpsStreetLookup('hp-gps-btn','hp-loc-status',p=>{
    inp.value=p.display;hpLat=null;hpLng=null;
    hpGpsPending=p;
    document.getElementById('hp-gps-confirm-addr').textContent=p.display;
    document.getElementById('hp-gps-confirm').style.display='block';
    st.textContent='Please confirm the address below';st.className='loc-status manual';
  });
}

// Street-level GPS lookup shared by the helper profile and Post a Job.
// House number dropped from the text. onFound({lat,lng,exactLat,exactLng,display,vague,city}) shows the screen's confirm box:
// lat/lng are rounded to 3 decimals (~100 m, used by helpers); exactLat/exactLng are the raw GPS position (used by jobs).
function gpsStreetLookup(btnId,statusId,onFound){
  const btn=document.getElementById(btnId);const st=document.getElementById(statusId);
  const reset=()=>{btn.disabled=false;btn.innerHTML=ICO.nav+'GPS';};
  if(!navigator.geolocation){st.textContent='GPS not available — type your street name';st.className='loc-status manual';return;}
  btn.disabled=true;btn.textContent='Locating…';st.textContent='Getting your location…';st.className='loc-status loading';
  navigator.geolocation.getCurrentPosition(
    async pos=>{
      const exactLat=pos.coords.latitude,exactLng=pos.coords.longitude;
      const lat=+exactLat.toFixed(3),lng=+exactLng.toFixed(3);
      try{
        const d=await geoFetch(`reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&zoom=17&addressdetails=1&format=json`);const a=d.address||{};
        const road=a.road||a.pedestrian||'';
        const area=a.neighbourhood||a.suburb||a.quarter||a.city_district||'';
        const city=a.city||a.town||a.village||a.municipality||'';
        const prov=a.state_code||a.state||'';
        const display=addrDisplay([road,area,city,prov]);
        if(!display)throw new Error('no address');
        onFound({lat,lng,exactLat,exactLng,display,vague:!(road||area),city:city||area||''});
      }catch(e){st.textContent='Could not detect your street — type it and pick from the suggestions';st.className='loc-status manual';}
      reset();
    },
    ()=>{st.textContent='Location denied — type your street name and pick from the suggestions';st.className='loc-status manual';reset();},
    {timeout:10000,enableHighAccuracy:true}
  );
}

let hpGpsPending=null;
function hpGpsConfirm(ok){
  const p=hpGpsPending;hpGpsPending=null;
  document.getElementById('hp-gps-confirm').style.display='none';
  if(!p)return;
  if(ok){
    hpLat=p.lat;hpLng=p.lng;hpLocVague=p.vague;hpLocVagueAck=false;
    const st=document.getElementById('hp-loc-status');
    st.textContent=`📍 ${p.display} — your exact address is never shown`;st.className='loc-status verified';
  }else{
    hpStartAddArea(p.city||'your city');
  }
}

function showHPSuggestions(){openOv('hp-loc-suggestions');}
function hideHPSuggestions(){closeOv('hp-loc-suggestions');}

async function saveHelperProfile(){
  if(!sb||!me)return toast('Not signed in');
  if(hpGpsPending)return toast('⚠️ Please confirm your GPS address first');
  if(!hpLat||!hpLng)return toast('⚠️ Please select your area from suggestions');
  if(hpLocVague&&!hpLocVagueAck){hpAskArea();return;}
  const address=document.getElementById('hp-loc').value||'';
  const bio=document.getElementById('hp-bio').value||'';
  const rate=hpRateType==='free'?null:parseFloat(document.getElementById('hp-rate').value)||null;
  const categories=Array.from(hpSelectedCategories);
  const expiresAt=new Date(Date.now()+90*24*60*60*1000).toISOString();
  // First-time setup = no helper address and no categories before this save (edits/renewals skip the share screen)
  let firstTime=false;
  try{
    const{data:prev}=await sb.from('profiles').select('helper_address,helper_categories').eq('id',myProfileId||me.id).maybeSingle();
    firstTime=!prev?.helper_address&&!(prev?.helper_categories||[]).length;
  }catch(e){}
  const{error}=await sb.from('profiles').update({
    visible_on_map:true,
    show_on_map:true, // helpers always pinned on the map (list-only option removed)
    last_lat:hpLat,last_lng:hpLng,
    helper_address:address,
    helper_lat:hpLat,helper_lng:hpLng,
    helper_bio:bio,
    helper_rate:rate,
    helper_rate_type:hpRateType,
    helper_categories:categories,
    helper_expires_at:expiresAt
  }).eq('id',myProfileId||me.id);
  if(error)return toast('❌ '+error.message);
  myHomeHasAddr=!!address; // home base = helper address from now on (postJob won't overwrite it)
  toast('✅ Helper profile saved!');
  // No GPS → show jobs around the helper's address, not the Toronto default
  if(!_centerOnHome(hpLat,hpLng,1))loadJobs();
  const returnTo=helperEnteredFromFork?'browse':'profile';
  helperEnteredFromFork=false;
  nav(returnTo);
  if(firstTime)openLiveScreen({address,categories,rate,rateType:hpRateType});
}

function cancelHelperProfile(){
  if(helperEnteredFromFork){
    helperEnteredFromFork=false;
    nav('post');
    return;
  }
  nav('profile');
}

async function pauseHelper(){
  const btn=document.getElementById('hp-pause-btn');
  btn.disabled=true;
  const{error}=await sb.from('profiles').update({visible_on_map:false}).eq('id',myProfileId||me.id);
  btn.disabled=false;
  if(error)return toast('❌ '+error.message);
  toast('⏸️ Listing paused — you can resume anytime');
  loadJobs();
  nav('profile');
}
