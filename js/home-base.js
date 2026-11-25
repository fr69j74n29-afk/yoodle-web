// Home base location (one per member) and the home-base screen.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// ── HOME BASE ── one location per user: profiles.helper_lat/lng. Saved here rounded to ~1 km (it only centres the map);
// a helper address saved on the helper screen keeps full precision. helper_address is never written here, so the
// helper screen still asks for (and confirms) the address. Required once when there's no saved location.
// Changing it later: saving a helper profile (full address) or, for non-helpers, posting a job (see postJob).
const homeAddr=makeAddrSearch({sugId:'home-loc-suggestions',statusId:'home-loc-status',pickFn:'homePick',
  noResults:'No places found — try a city or postal code',
  format:item=>{const a=item.address||{};
    const main=a.neighbourhood||a.suburb||a.city||a.town||a.village||a.postcode||item.display_name.split(',')[0];
    const sub=[a.city||a.town||a.village||a.county,a.state,a.country_code?.toUpperCase()].filter(Boolean).join(', ');
    return{main,sub:sub||item.display_name};}});
function homeLocInput(v){homeAddr.input(v);}
function openHomeGate(){
  document.getElementById('home-loc').value='';
  document.getElementById('home-loc-status').textContent='';
  document.getElementById('home-loc-suggestions').classList.remove('open');
  document.getElementById('home-gate').style.display='flex';
}
function closeHomeGate(){document.getElementById('home-gate').style.display='none';}
function homeUseGps(){_homeWantGps=true;locateUser();}
function homePick(i){const it=homeAddr.item(i);if(it)homeSave(+it.lat,+it.lon);}
async function homeSave(lat,lng){
  if(!isFinite(lat)||!isFinite(lng))return;
  const pid=myProfileId||me?.id;
  if(sb&&pid){
    const{error}=await sb.from('profiles').update({helper_lat:Math.round(lat*100)/100,helper_lng:Math.round(lng*100)/100}).eq('id',pid);
    if(error)return toast('❌ '+error.message);
  }
  closeHomeGate();
  _needHome=false; userLat=lat; userLng=lng;
  if(map)_mapSetView(lat,lng,getPixelRadius()>50?kmToZoom(RADIUS_KM,lat):map.getZoom()); // moveend saves the view + runs loadJobs()
  else loadJobs();
}
// Move the map to the user's own location when GPS isn't on.
// Without this, users outside the GTA stayed on the Toronto default and saw Toronto jobs as "nearby".
// minKm: only move if the map centre is further than this from home. moveend saves the view + runs loadJobs().
// Returns true if the map moved.
function _centerOnHome(lat,lng,minKm){
  if(!map||isDemoAccount||locationSource==='gps')return false;
  if(!isFinite(lat)||!isFinite(lng))return false;
  if(haversineKm(userLat,userLng,lat,lng)<=minKm)return false;
  // Map hidden (e.g. saving from the helper screen) → width 0, kmToZoom can't measure; keep the current zoom.
  const z=getPixelRadius()>50?kmToZoom(RADIUS_KM,lat):map.getZoom();
  userLat=lat; userLng=lng; // nav() restores the view from userLat/userLng when the map is shown again
  _mapSetView(lat,lng,z);
  return true;
}
