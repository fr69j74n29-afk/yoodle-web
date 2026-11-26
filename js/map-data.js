// Loading jobs, helpers, pros and listings for the map and list (loadJobs).
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

let listRadiusKm=25;

function setListRadius(el,km){
  document.querySelectorAll('.list-radius-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  listRadiusKm=km;
  loadJobs();
}

// Pro listings (pro.yoodle.ca): the map reads pros ONLY via get_pros_near() — nearby only, closest first, same
// inputs as get_helpers_near (Oct 26). Single-pro lookups use get_public_pros(p_profile). Both security definer:
// approved, visible, unexpired, located; tester pros only for testers — no admin/owner exception, so nobody sees pending pros here.
// The pro still sees their own pending pin on pro.yoodle.ca (table RLS: approved OR own OR admin).
// Fetched in parallel with helpers/jobs inside loadJobs(), in ONE request — the owner's name comes
// embedded via the pro_profiles.profile_id → profiles FK. Trades list is cached after the first successful load.
function fetchPros(lat,lng,km){
  return Promise.all([
    PRO_TRADES?null:sb.from('pro_trades').select('key,label,emoji,licence_required'),
    sb.rpc('get_pros_near',{user_lat:lat,user_lng:lng,radius_km:km,lim:300})   // nearby approved pros only, filtered in the database
  ]).catch(e=>{console.warn('pros',e);return[null,null];});
}
function applyPros(res,pid){
  try{
    const[tr,pr]=res||[];
    if(tr&&tr.data){PRO_TRADES={};tr.data.forEach(t=>PRO_TRADES[t.key]={emoji:t.emoji||'🔧',label:t.label,lic:!!t.licence_required});}
    allPros=((pr&&pr.data)||[])
      .filter(p=>p.status==='approved'&&!hiddenUserIds.has(p.profile_id)&&(!p.is_tester||myIsTester))
      .map(({is_tester,...p})=>({...p,mine:p.profile_id===pid}));
  }catch(e){console.warn('pros',e);allPros=[];}
}

async function loadJobs() {
  if (!sb) {
    const ltc=document.getElementById('list-tab-content');
    if(ltc)ltc.innerHTML=emptyState('🔌', 'No database connection', 'Check Supabase config');
    return;
  }

  const pid=myProfileId||me?.id;
  const ltc=document.getElementById('list-tab-content');
  if(_needHome||userLat==null||userLng==null){
    if(ltc)ltc.innerHTML=emptyState('📍','Set your home base','Pick your area to see nearby jobs and helpers');
    return;
  }
  if(ltc)ltc.innerHTML=spin();

  // Show loading state in corner card
  const _countsEl=document.getElementById('map-counts');
  const _loadingEl=document.getElementById('map-counts-loading');
  const _dataEl=document.getElementById('map-counts-data');
  if(_loadingEl)_loadingEl.style.display='flex';
  if(_dataEl)_dataEl.style.display='none';

  // Helpers, business listings and jobs are independent — fetch in parallel (one round trip instead of three)
  const _hasLoc=!!(userLat&&userLng);
  if(_hasLoc)_lastJobsLoad={lat:userLat,lng:userLng,r:RADIUS_KM}; // for the small-pan skip in moveend
  // What the map loads: jobs AND helpers within 3× the ring radius (min 30 km) so pins fill the
  // whole screen. Counts and lists still use only the ring (updateRadiusCounts → sheetJobs / sheetHelpers).
  const mapLoadKm=Math.max(30,RADIUS_KM*3);
  const[{data:helpers},{data:bizData},_jobsRes,_meRes,_prosRes,_myJobsRes]=await Promise.all([
    // helpers for map — nearby only, closest first (get_helpers_near), so the API's 1,000-row cap can't drop
    // nearby helpers. Self excluded server-side (own pin comes from _meRes below).
    sb.rpc('get_helpers_near',{
      user_lat:userLat,
      user_lng:userLng,
      radius_km:mapLoadKm,
      lim:300,
      exclude_user_id:pid||null
    }),
    // business listings for map
    sb.rpc('get_business_listings',{
      user_lat:userLat,
      user_lng:userLng,
      radius_km:RADIUS_KM
    }),
    // jobs — only when we have a location (same as before)
    _hasLoc?sb.rpc('get_open_jobs_near',{
      user_lat:userLat,
      user_lng:userLng,
      radius_km:mapLoadKm, // was RADIUS_KM (ring only) — pins now fill the screen like helpers
      lim:120,
      exclude_user_id:pid||null
    }):Promise.resolve(null),
    // own helper row — the helpers query above excludes me (own pin)
    pid?sb.from('profiles').select('id,name,last_lat,last_lng,show_on_map,visible_on_map,helper_address,is_tester').eq('id',pid).maybeSingle():Promise.resolve({data:null}),
    // Pro listings + trades (same round trip)
    fetchPros(userLat,userLng,mapLoadKm),
    // own open jobs (29 Oct 2026) — get_open_jobs_near excludes me; drawn on the map only (not in list/counts)
    pid?sb.from('tasks').select('id,poster_id,title,description,price,category,lat,lng,address,status,doer_id,claimer_id,expires_at,location_verified,completed_at,created_at,show_on_map,url,type').eq('poster_id',pid).in('status',['open','offered']).eq('show_on_map',true).limit(50):Promise.resolve({data:null})
  ]);
  const _mp=_meRes?.data;
  myIsTester=!!_mp?.is_tester; // test accounts (profiles.is_tester) are only shown to other test accounts
  allHelpers=(helpers||[]).filter(h=>!hiddenUserIds.has(h.id)&&(!h.is_tester||myIsTester));
  // own pin: same rule as other helpers' pins — active listing (not paused) with a location
  myHelperPin=(_mp&&_mp.visible_on_map&&_mp.show_on_map&&_mp.last_lat&&_mp.last_lng)?_mp:null;
  // private offers made TO me (js/contacts.js): only private_for can read them (RLS). Drawn like my own pins.
  if(pid)sb.from('tasks').select('*').eq('private_for',pid).eq('status','offered').limit(20).then(({data})=>{
    offerPins=(data||[]).filter(j=>j.lat&&j.lng).map(j=>({...j,category:(j.category||'other').toLowerCase()}));
    if(offerPins.length)renderMapPins();
  },()=>{});
  myJobPins=(_myJobsRes?.data||[]).filter(j=>j.lat&&j.lng&&(!j.expires_at||Date.parse(j.expires_at)>Date.now())).map(j=>({...j,category:(j.category||'other').toLowerCase()}));
  allBizListings=bizData||[];
  applyPros(_prosRes,pid); // after myIsTester is known

  // if no user location, show prompt
  if(!_hasLoc){
    if(ltc)ltc.innerHTML=emptyState('📍','Share your location','Tap the locate button on the map to see nearby jobs');
    const lbl=document.getElementById('list-sub');
    if(lbl)lbl.textContent='Enable location to browse jobs';
    return;
  }

  const{data,error}=_jobsRes;

  if(error){
    if(ltc)ltc.innerHTML=emptyState('😕','Error loading jobs',error.message);
    return;
  }

  allJobs=(data||[]).map(j=>({...j,category:(j.category||'other').toLowerCase()}));
  updateRadiusCounts();
  if(sb&&me){
    // Only this user's pending applications (a short list) - no task_id=in.(...) list in the URL (log ingestion fix, 14 Nov 2026)
    const{data:apps}=await sb.from('applications').select('task_id').eq('applicant_id',myProfileId||me.id).eq('status','pending');
    myAppliedTaskIds=new Set((apps||[]).map(a=>a.task_id));
  }
  renderListTabContent();
  renderMapPins();
}
