// Location: GPS cache, locating the user, radius ring, zoom limits, fuzzy pin positions.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// ── GPS localStorage cache (survives idle / background) ──
const GPS_CACHE_KEY='yoodle_gps';
const GPS_CACHE_MAX_AGE=30*60*1000; // 30 min
function _cacheGps(lat,lng){
  try{localStorage.setItem(GPS_CACHE_KEY,JSON.stringify({lat,lng,ts:Date.now()}));}catch(e){}
}
function _restoreCachedGps(){
  try{
    const s=JSON.parse(localStorage.getItem(GPS_CACHE_KEY)||'null');
    if(s&&s.lat&&s.lng&&(Date.now()-s.ts)<GPS_CACHE_MAX_AGE) return s;
  }catch(e){}
  return null;
}



let locationSource='preset'; // 'gps' | 'preset'

// No IP lookup — first visit defaults to downtown Toronto (instant).
// GPS updates locationSource to 'gps' when user taps locate.

let _geoWatchId=null;

function locateUser(silent) {
  if(isDemoAccount){if(!silent)demoLocationNote();return;}
  if(!navigator.geolocation){showGeoFallback();return;}

  const btn=document.getElementById('map-locate-btn');
  if(btn){btn.classList.add('locating');btn.classList.remove('located');}

  if(_geoWatchId!==null){navigator.geolocation.clearWatch(_geoWatchId);_geoWatchId=null;}

  let _resolved=false;
  let _coarseFix=null; // best low-accuracy fix — last-resort fallback only (never cached)

  const _applyFix=(lat,lng,cache)=>{
    gpsLat=lat; gpsLng=lng;
    if(cache)_cacheGps(lat,lng);
    locationSource='gps';
    if(btn){btn.classList.remove('locating');btn.classList.add('located');}
    updateGpsDot();
    if(_homeWantGps){
      _homeWantGps=false;
      if(cache){homeSave(lat,lng);return;} // homeSave moves the map
      toast('📍 Couldn\'t pin your exact spot — please type your area');
      if(_needHome)return;
    }
    // Silent GPS refresh while the home-base screen is up → use it. 700 ms = after showApp()'s 150/600 ms first-load setView.
    if(_needHome&&cache){setTimeout(()=>{if(_needHome)homeSave(lat,lng);},700);return;}
    // Move only if meaningfully different from where the map already sits
    if(map&&haversineKm(userLat,userLng,lat,lng)*1000>50)
      map.flyTo({center:[lng,lat],zoom:map.getZoom()}); // moveend handles userLat/userLng + loadJobs
    else
      updateCircleOverlay();
  };

  // iOS safety net — watchPosition timeout unreliable after backgrounding
  const _safetyTimer=setTimeout(()=>{
    if(_resolved)return;
    _resolved=true;
    if(_geoWatchId!==null){navigator.geolocation.clearWatch(_geoWatchId);_geoWatchId=null;}
    if(_coarseFix){
      // No GPS-grade fix arrived (e.g. desktop, no GPS hardware) — use best coarse fix, never cache it
      _applyFix(_coarseFix.lat,_coarseFix.lng,false);
    } else {
      if(btn)btn.classList.remove('locating');
      if(!silent)toast('📍 Location timed out — try again');
    }
  },10000);

  _geoWatchId=navigator.geolocation.watchPosition(
    pos=>{
      if(_resolved)return;
      const newLat=pos.coords.latitude, newLng=pos.coords.longitude;
      if(pos.coords.accuracy>2000){
        // Coarse network/IP estimate — hold as fallback only; no movement, no cache
        _coarseFix={lat:newLat,lng:newLng};
        return;
      }
      _resolved=true;
      clearTimeout(_safetyTimer);
      navigator.geolocation.clearWatch(_geoWatchId);
      _geoWatchId=null;
      _applyFix(newLat,newLng,true);
    },
    err=>{
      if(_resolved)return;
      _resolved=true;
      clearTimeout(_safetyTimer);
      if(_geoWatchId!==null){navigator.geolocation.clearWatch(_geoWatchId);_geoWatchId=null;}
      if(btn)btn.classList.remove('locating');
      if(err.code===1){
        if(!silent)toast('📍 Tap AA in address bar → Website Settings → Location → Allow');
      } else {
        if(!silent)toast('📍 Location unavailable — try again');
      }
    },
    {timeout:9000,enableHighAccuracy:true,maximumAge:0}
  );
}

function showDbError() {
  const ltc=document.getElementById('list-tab-content');
  if(ltc)ltc.innerHTML=emptyState('🔌', 'Database not connected', 'Check Supabase configuration');
}

function showGeoFallback() {
  console.warn("Geolocation not available");
}


// Pixel radius: circle fills ~88% of the shorter screen dimension
function updateGpsDot() {
  if(userMarker){userMarker.remove();userMarker=null;}
  if(!gpsLat||!gpsLng||!map)return;
  userMarker=_htmlMarker('<div class="user-ring"></div>',20,20,gpsLat,gpsLng,{className:'yoodle-pin',z:3});
}

function getPixelRadius() {
  const el=document.getElementById('map');
  return Math.min(el.clientWidth,el.clientHeight)*0.44;
}

// Ring on screen → RADIUS_KM (1 km steps, 1–25). Used on every zoomend and at login; true if it changed.
function _syncRadiusToMap(){
  if(!map||getPixelRadius()<50)return false; // map hidden — nothing to measure
  const r=Math.min(25,Math.max(1,Math.round(getCircleKm())));
  const changed=r!==RADIUS_KM;
  RADIUS_KM=r;
  updateZoomLimits();
  return changed;
}
// Reverse-project fixed pixel radius → km at current zoom + latitude
function getCircleKm() {
  if(!map)return RADIUS_KM;
  const r=getPixelRadius();
  const el=document.getElementById('map');
  const northLL=map.unproject([el.clientWidth/2,el.clientHeight/2-r]);
  const c=map.getCenter();
  return haversineKm(c.lat,c.lng,northLL.lat,northLL.lng);
}

// Convert km radius to MapLibre zoom level at given latitude (512px tiles)
function kmToZoom(km,lat) {
  const r=getPixelRadius();
  const mpp=(km*1000)/r;
  return Math.log2(40075016.686*Math.cos(lat*Math.PI/180)/(mpp*512));
}

// Hard-stop zoom: can't zoom out past 25km or in past 1km
function updateZoomLimits() {
  if(!map)return;
  const lat=map.getCenter().lat;
  // MapLibre throws on invalid limits (e.g. hidden container → 0px radius) — validate first
  // Zoom out: stop at 25 km. Zoom in: allow STREET_ZOOM levels past the 1 km ring
  // so street names show (vector styles label side streets only when close in).
  // Search radius stays clamped at 1 km (RADIUS_KM); the ring fades out past it.
  const mn=kmToZoom(25,lat), mx=Math.min(kmToZoom(1,lat)+STREET_ZOOM,18);
  if(!isFinite(mn)||!isFinite(mx)||mn<0||mx>24||mn>=mx)return;
  try{
    if(mn>map.getMaxZoom()){map.setMaxZoom(mx);map.setMinZoom(mn);}
    else{map.setMinZoom(mn);map.setMaxZoom(mx);}
  }catch(e){}
}

var STREET_ZOOM=3; // extra zoom-in beyond the 1 km ring (3 ≈ 8× closer)
function updateCircleOverlay() {
  if(!map)return;
  const mask=document.getElementById('map-overlay-mask');
  const ring=document.getElementById('map-overlay-ring');
  if(!mask||!ring)return;
  const r=getPixelRadius(); // fixed size — circle fills screen edge-to-edge
  const d=r*2;
  mask.style.background='none';
  ring.style.borderColor=locationSource==='gps'?'rgba(74,158,122,0.7)':'rgba(150,150,160,0.65)';
  ring.style.width=d+'px';
  ring.style.height=d+'px';
  ring.style.left='50%';
  ring.style.top='50%';
  ring.style.marginLeft=(-r)+'px';
  ring.style.marginTop=(-r)+'px';
  // Past the 1 km level the ring no longer matches the 1 km search area → fade it out
  try{const over=map.getZoom()-kmToZoom(1,map.getCenter().lat);ring.style.opacity=over>0?String(Math.max(0,1-over)):'1';}catch(e){}
  // Update corner card radius label
  const corner=document.getElementById('map-radius-corner');
  if(corner)corner.textContent=`WITHIN ${RADIUS_KM} KM`;
}

// Max ~80m fuzzy offset — enough for privacy, not enough to jump streets
function fuzzyCoords(lat,lng){return[lat+(Math.random()-.5)*.0014,lng+(Math.random()-.5)*.0018];}
// Job pin position: imported employer jobs (isCommunityJob) show the employer's public worksite exactly, like Pros;
// neighbour and agency jobs keep the ~80 m privacy offset.
function jobPinCoords(j){return isCommunityJob(j)?[+j.lat,+j.lng]:(j._fuzzy||(j._fuzzy=fuzzyCoords(j.lat,j.lng)));}
