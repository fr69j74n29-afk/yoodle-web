// Tabs / screens (nav) and browse mode.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

let browseMode='map'; // 'map' | 'list'

function toggleBrowseMode(){
  browseMode=browseMode==='map'?'list':'map';
  nav('browse');
}

function nav(view) {
  document.querySelectorAll('.app-view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-i').forEach(n=>n.classList.remove('active'));

  // Handle 'browse' — shows map or list based on browseMode
  if(view==='browse'){
    document.getElementById('app-'+browseMode).classList.add('active');
    document.getElementById('ni-map').classList.add('active');
  } else if(view==='map'||view==='list'){
    browseMode=view;
    document.getElementById('app-'+view).classList.add('active');
    document.getElementById('ni-map').classList.add('active');
  } else if(view==='postjob'){
    document.getElementById('app-postjob').classList.add('active');
    const navBtn=document.getElementById('ni-post');
    if(navBtn)navBtn.classList.add('active');
  } else {
    document.getElementById('app-'+view).classList.add('active');
    const navBtn=document.getElementById('ni-'+view);
    if(navBtn)navBtn.classList.add('active');
  }

  // close any open modals when navigating
  document.querySelectorAll('.modal-ov.open').forEach(m=>m.classList.remove('open'));
  if(view==='map'||(view==='browse'&&browseMode==='map')){setTimeout(()=>{
    if(!map)return; // no WebGL → no map
    // Snapshot position before invalidateSize (which can fire moveend and corrupt coords)
    const _c0=map.getCenter(), _lat=userLat??_c0.lat, _lng=userLng??_c0.lng, _z=map.getZoom();
    // Recalc container size without auto-panning (container just went none→flex)
    _mapResize();
    // Restore the exact position the user last saw
    _mapSetView(_lat,_lng,_z);
    if(gpsLat&&gpsLng)updateGpsDot();
    updateCircleOverlay();updateRadiusCounts();updateNotifNudge();
  },100);}
  if(view==='myjobs'){loadMyJobs();loadPendingRatings();}
  if(view==='post'){updateForkHelperCard();updateForkIdvCard();}
  if(view==='postjob')resetPost();
  if(view==='messages'){loadMessages().then(()=>refreshUnreadCount());}
  if(view==='profile')loadProfile();
  if(view==='helper')openHelperScreen();
  updateNotifNudge();
}
