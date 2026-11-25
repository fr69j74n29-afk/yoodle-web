// Showing the app after sign-in (showApp) and the signed-out screen.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

function showAuthScreen(){_notifs=[];renderNotifBadge();closeOv('nt-sheet');myViewStats=null;renderViewBadge();closeViewPanel();document.getElementById('view-auth').style.display='flex';document.getElementById('view-main').style.display='none';}

let _appStartedFor=null;
function _startApp(session){
  me=session.user;
  if(_appStartedFor===session.user.id)return;
  _appStartedFor=session.user.id;
  showApp();
}
async function showApp(){
  document.getElementById('view-auth').style.display='none';
  const m=document.getElementById('view-main');m.style.display='flex';m.style.flexDirection='column';
  // Container just became visible — Leaflet needs to recalc tile positions.
  // The start-up loadJobs() below waits for this resize + radius sync, so it runs once with the right ring size.
  let _viewReadyRes; const _viewReady=new Promise(r=>_viewReadyRes=r);
  if(map){
    const _hasSavedZoom=!!JSON.parse(localStorage.getItem('yoodle_map')||'null')?.zoom;
    const _c0=map.getCenter(), _lat=userLat??_c0.lat, _lng=userLng??_c0.lng, _z=map.getZoom();
    setTimeout(()=>{
      try{
      _mapResize();
      // First load (no saved zoom) — show the default radius (RADIUS_KM, 10 km)
      const z2=_hasSavedZoom?_z:kmToZoom(RADIUS_KM,_lat);
      _mapSetView(_lat,_lng,z2);
      _syncRadiusToMap(); // saved view: no zoomend fires, so match RADIUS_KM to the ring
      updateCircleOverlay();
      }finally{_viewReadyRes();}
    },150);
    setTimeout(()=>{_mapResize();_mapSetView(_lat,_lng,_hasSavedZoom?_z:map.getZoom());updateCircleOverlay();},600);
  }else _viewReadyRes();
  setAvatar();
  if(await startupChecks())return; // suspended — stop here (profile, gates, demo, blocks in one round trip)
  await Promise.race([_viewReady,new Promise(r=>setTimeout(r,1000))]); // map resized + ring synced (max 1 s)
  loadJobs(); // the one start-up load (before: a 2nd load also ran from the resize timer)
  loadViewStats(); // eye badge (helpers only)
  ysInit(); // Find a helper counts + Post a Job category picker
  closeAuthSheet();
  restoreGuestDraft();
  if(window._openEmailSettings)nav('profile');
  // Silent GPS refresh on login — only when permission was ALREADY granted and the
  // 30-min cache is stale. Fresh cache → no GPS at all (battery). Never prompts.
  // Permissions API may be absent on older iOS Safari (<16) → try/catch falls back
  // to today's tap-to-locate behaviour.
  try{
    if(!isDemoAccount&&navigator.permissions&&navigator.geolocation&&!_restoreCachedGps()){
      navigator.permissions.query({name:'geolocation'}).then(p=>{
        if(p.state==='granted')locateUser(true);
      }).catch(()=>{});
    }
  }catch(e){}
  subscribeToMessages();
  registerOneSignal();
  processReferral();
  if(window.yoodiInit)yoodiInit(); // Yoodi on the map + her draft links (js/yoodi.js)
  handleHelperLanding();
  if(window._idvReturn)handleIdvReturn();
  loadReadyIds(); // ⚡ Ready to work bolts (signed-in only)
  if(window._readyLand)handleReadyLanding();
  handleEmailJobLanding();
  recordOnboardPath();
  logActive();
  loadPoints();
  loadNotifications(); // bell count in the top bar
  setTimeout(async()=>{
    let tid=window._pendingNotifTaskId||null;
    let cid=window._pendingNotifConvId||null;
    window._pendingNotifTaskId=null;
    window._pendingNotifConvId=null;
    // Deep link saved before sign-in (yoodle_chat_land) — used once, 7-day limit
    try{
      const d=JSON.parse(localStorage.getItem('yoodle_chat_land')||'null');
      localStorage.removeItem('yoodle_chat_land');
      if(!tid&&d&&d.t&&Date.now()-(d.ts||0)<7*24*60*60*1000){tid=d.t;cid=d.c||null;}
    }catch(e){}
    if(tid)await openChatFromNotification(tid,cid);
  },1500);
  loadPendingRatings();
  refreshUnreadCount();
  startUnreadPoller();
  setTimeout(updateNotifNudge, 2000);
  setTimeout(updateNotifNudge, 5000);
}


async function setAvatar(){
  if(!me)return;
  const av=document.getElementById('top-av');
  if(!av)return;
  const url=me.user_metadata?.avatar_url;
  if(url){av.innerHTML=`<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover">`;return;}
  if(sb){
    const{data}=await sb.from('profiles').select('name,avatar_color').eq('id',myProfileId||me.id).maybeSingle();
    const name=data?.name||me.email?.split('@')[0]||'Y';
    av.innerHTML=avatarCircle(name,data?.avatar_color,'36px','14px');
  } else {
    av.textContent=(me.user_metadata?.full_name||me.email||'?')[0].toUpperCase();
  }
}
