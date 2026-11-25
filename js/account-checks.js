// Account gates at startup: blocked users, demo account, suspension, terms.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// ── REPORT · BLOCK · TERMS · SUSPENSION ──
let hiddenUserIds=new Set();   // blocked either way (server list) — hidden everywhere
let iBlockedIds=new Set();     // people I blocked (can unblock)
let activeChatOtherName='';
let _report=null, _blockTarget=null;
const REPORT_REASONS=['Scam or fake job','Harassment or hate','Inappropriate or offensive','Unsafe or illegal','Spam','Other'];

async function loadBlockedIds(){
  if(!sb||!me)return;
  try{
    const pid=myProfileId||me.id;
    const[r1,r2]=await Promise.all([
      sb.rpc('my_blocked_ids'),
      sb.from('blocks').select('blocked_id').eq('blocker_id',pid)
    ]);
    applyBlocked(r1,r2);
  }catch(e){console.warn('blocked ids',e);}
}
function applyBlocked({data:ids,error:e1},{data:mine,error:e2}){
  if(!e1)hiddenUserIds=new Set((ids||[]).map(r=>typeof r==='string'?r:(r?.my_blocked_ids||r?.id)).filter(Boolean));
  if(!e2)iBlockedIds=new Set((mine||[]).map(r=>r.blocked_id));
  iBlockedIds.forEach(id=>hiddenUserIds.add(id));
}

// Demo account (App Store reviewer): map stays on Toronto, GPS never moves it
let isDemoAccount=false;
const DEMO_CENTER={lat:43.6532,lng:-79.3832};
async function checkDemoAccount(){
  isDemoAccount=false;
  if(!sb||!me)return;
  let isDemo=false;
  try{
    const{data,error}=await sb.from('profiles').select('is_demo').eq('id',myProfileId||me.id).maybeSingle();
    isDemo=!error&&data?.is_demo===true;
  }catch(e){}
  applyDemo(isDemo);
}
function applyDemo(isDemo){
  isDemoAccount=!!isDemo;
  if(!isDemoAccount)return;
  _needHome=false;
  // Treat downtown Toronto as "your location": distances, green ring, GPS dot
  gpsLat=DEMO_CENTER.lat;gpsLng=DEMO_CENTER.lng;locationSource='gps';
  userLat=DEMO_CENTER.lat;userLng=DEMO_CENTER.lng;
  try{localStorage.removeItem(GPS_CACHE_KEY);}catch(e){}
  if(map)setTimeout(()=>{_mapResize();_mapSetView(DEMO_CENTER.lat,DEMO_CENTER.lng,kmToZoom(25,DEMO_CENTER.lat));updateGpsDot();updateCircleOverlay();loadJobs();},700);
}
function demoLocationNote(){
  // Still triggers the normal location permission prompt, but never moves the map
  try{navigator.geolocation&&navigator.geolocation.getCurrentPosition(()=>{},()=>{},{timeout:5000});}catch(e){}
  toast('📍 Demo account — showing Toronto. Yoodle currently serves the GTA.');
}

async function checkAccountGates(){
  if(!sb||!me)return false;
  try{
    const[{data:susp},{data:tp,error:tpErr}]=await Promise.all([
      sb.rpc('am_i_suspended'),
      sb.from('profiles').select('terms_accepted_at').eq('id',myProfileId||me.id).maybeSingle()
    ]);
    return applyGates(susp,tp,tpErr);
  }catch(e){console.warn('gates',e);}
  return false;
}
// true = suspended (suspended screen shown, caller must stop); Terms prompt shown if not yet accepted
function applyGates(susp,tp,tpErr){
  if(susp===true){document.getElementById('suspended-gate').style.display='flex';return true;}
  if(!tpErr&&tp&&!tp.terms_accepted_at)document.getElementById('terms-gate').style.display='flex';
  return false;
}

// Start-up checks in ONE round trip: profile id, suspended + Terms, is_demo, blocked ids.
// A suspended account still stops before the map loads. Falls back to step-by-step checks if the batch throws.
async function startupChecks(){
  if(!sb||!me)return false;
  let r=null;
  try{
    r=await Promise.all([
      sb.from('profiles').select('id,terms_accepted_at,is_demo,helper_lat,helper_lng,helper_address').eq('id',me.id).maybeSingle(),
      sb.rpc('am_i_suspended'),
      sb.rpc('my_blocked_ids'),
      sb.from('blocks').select('blocked_id').eq('blocker_id',me.id)
    ]);
  }catch(e){console.warn('startup checks',e);}
  if(!r){
    const{data}=await sb.from('profiles').select('id').eq('id',me.id).maybeSingle();myProfileId=data?.id||me.id;
    if(await checkAccountGates())return true;
    await checkDemoAccount();
    await loadBlockedIds();
    if(!isDemoAccount&&locationSource!=='gps'){_needHome=true;openHomeGate();}
    return false;
  }
  const[{data:prof,error:profErr},{data:susp},blk1,blk2]=r;
  myProfileId=prof?.id||me.id;
  if(applyGates(susp,prof,profErr))return true;
  applyDemo(!profErr&&prof?.is_demo===true);
  try{applyBlocked(blk1,blk2);}catch(e){console.warn('blocked ids',e);}
  // No GPS → open the map at the user's saved helper location (not Toronto) if it's > 50 km away.
  // 700 ms = after showApp()'s 150/600 ms first-load setView, so it isn't overridden.
  myHomeHasAddr=!!(prof?.helper_address);
  if(!profErr&&prof?.helper_lat!=null&&prof?.helper_lng!=null){
    const _hl=+prof.helper_lat,_hg=+prof.helper_lng;
    if(_needHome){_needHome=false;userLat=_hl;userLng=_hg;_mapSetView(_hl,_hg,map?map.getZoom():13);}
    setTimeout(()=>_centerOnHome(_hl,_hg,50),700);
  }else if(!profErr&&!isDemoAccount&&locationSource!=='gps'){
    // No saved location and no GPS → home base is required (a map view saved in this browser doesn't count —
    // the old Toronto default was saved for every visitor). Sits under the Terms screen until that's accepted.
    _needHome=true;openHomeGate();
  }
  return false;
}
async function acceptTerms(){
  if(!sb||!me)return;
  const btn=document.getElementById('terms-accept');btn.disabled=true;btn.textContent='Saving…';
  const{error}=await sb.from('profiles').update({terms_accepted_at:new Date().toISOString()}).eq('id',myProfileId||me.id);
  btn.disabled=false;btn.textContent='I agree';
  if(error)return toast('❌ '+error.message);
  document.getElementById('terms-gate').style.display='none';
  toast('✅ Thanks — welcome to Yoodle!');
}
