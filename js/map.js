// The map: MapLibre GL + OpenFreeMap style, sage colours, markers, initMap, radius counts.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

function normalizeCategory(cat) {
  if (['handyman', 'tech'].includes(cat)) return 'assembly';
  if (['garden'].includes(cat)) return 'yard';
  if (['cleaning', 'petcare', 'childcare'].includes(cat)) return 'errands';
  if (['moving'].includes(cat)) return 'moving';
  return cat || 'other';
}
let RADIUS_KM=10; // default search radius; user can zoom out to 25
let sheetTab='jobs';
let sheetJobs=[],sheetHelpers=[];

/* ── MAP: MapLibre GL JS + OpenFreeMap, no Leaflet ──
   Zoom note: MapLibre uses 512px tiles, so its zoom = Leaflet zoom − 1.
   'yoodle_map' in localStorage stays in Leaflet units so index.html and
   test2.html can share it (ZOFF converts on read/write). */
var ZOFF=1;
var OFM_STYLE={'sage-light':'https://tiles.openfreemap.org/styles/positron','sage-dark':'https://tiles.openfreemap.org/styles/dark'};
var SAGE_TINT={
  'sage-light':{bg:'#EEF2EC',water:'#CFE2DE',green:'#DCEADA'},
  'sage-dark':{bg:'#0D120F',water:'#0E2124',green:'#13201A',roads:{ // Sage Dark+: lift streets off the near-black background (OpenFreeMap 'dark' layer ids)
    highway_path:'#44544A',road_pier:'#5A6E60',highway_minor:'#5A6E60',
    highway_major_casing:'#26322B',highway_major_inner:'#7F9785',highway_major_subtle:'#667C6C',
    highway_motorway_casing:'#2A1D1C',highway_motorway_inner:'#8C4F4B',highway_motorway_subtle:'#5E3A37', // motorways: subtle muted red
    railway:'#3F4C43',railway_minor:'#3F4C43',railway_transit:'#3F4C43',
    railway_dashline:'#0D120F',railway_minor_dashline:'#0D120F',railway_transit_dashline:'#0D120F',
    highway_name_other:'#C4D4C8',highway_name_motorway:'#D8E4DB'
  }}
};
var OSM_RASTER_STYLE={version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© OpenStreetMap'}},layers:[{id:'osm',type:'raster',source:'osm'}]};
var _styleFallbackTimer=null, _usingRasterStyle=false;
function _curTheme(){return document.body.classList.contains('theme-sage-dark')?'sage-dark':'sage-light';}
function _webglOK(){
  try{
    if(!window.maplibregl)return false;
    const c=document.createElement('canvas');
    return !!(c.getContext('webgl2')||c.getContext('webgl'));
  }catch(e){return false;}
}
function _sageTint(){
  if(_usingRasterStyle)return;
  const p=SAGE_TINT[_curTheme()];
  try{
    map.getStyle().layers.forEach(ly=>{
      const id=ly.id.toLowerCase();
      try{
        const rc=p.roads&&p.roads[ly.id];
        if(rc){if(ly.type==='line')map.setPaintProperty(ly.id,'line-color',rc);else if(ly.type==='symbol')map.setPaintProperty(ly.id,'text-color',rc);return;}
        if(ly.type==='background')map.setPaintProperty(ly.id,'background-color',p.bg);
        else if(ly.type==='fill'&&id.includes('water'))map.setPaintProperty(ly.id,'fill-color',p.water);
        else if(ly.type==='fill'&&/(park|wood|grass|forest|landcover)/.test(id))map.setPaintProperty(ly.id,'fill-color',p.green);
      }catch(e){}
    });
  }catch(e){}
}
function _armStyleFallback(){
  clearTimeout(_styleFallbackTimer);
  // OpenFreeMap style not loaded in 8s → plain OSM raster inside MapLibre
  _styleFallbackTimer=setTimeout(()=>{
    try{if(map&&!map.isStyleLoaded()){_usingRasterStyle=true;map.setStyle(OSM_RASTER_STYLE);console.warn('[map] OSM raster fallback');}}catch(e){}
  },8000);
}
function _refreshBaseStyle(){
  try{
    if(!map||!map.setStyle||_usingRasterStyle)return;
    _armStyleFallback();
    map.setStyle(OFM_STYLE[_curTheme()],{diff:false});
  }catch(e){} // map not created yet (theme set on page load)
}
function _collapseAttrib(){
  try{document.querySelectorAll('#map .maplibregl-ctrl-attrib.maplibregl-compact-show').forEach(el=>el.classList.remove('maplibregl-compact-show'));}catch(e){}
}
// Build a DOM marker (replaces L.divIcon + L.marker)
function _htmlMarker(html,w,h,lat,lng,opts){
  opts=opts||{};
  const el=document.createElement('div');
  el.className=opts.className||'';
  el.style.width=w+'px';el.style.height=h+'px';
  if(opts.z)el.style.zIndex=Math.round(opts.z*10); // ×10 so half-steps fit between levels (5 Nov 2026: ready helpers z 1.5 → 15)
  el.innerHTML=html;
  if(opts.onClick)el.addEventListener('click',e=>{e.stopPropagation();opts.onClick();});
  const m=new maplibregl.Marker({element:el,anchor:opts.anchor||'center',offset:opts.offset||[0,0]}).setLngLat([lng,lat]).addTo(map);
  return m;
}
// Leaflet-style helpers used by the existing re-anchor code
function _mapResize(){try{map.resize();}catch(e){}}
function _mapSetView(lat,lng,z){try{map.jumpTo({center:[lng,lat],zoom:z});}catch(e){}}

function initMap() {
  // Restore last viewed position — instant, no network needed
  const _saved=JSON.parse(localStorage.getItem('yoodle_map')||'null');
  // No saved view → no location yet (no Toronto default). The map draws at a blank spot behind the
  // home-base screen and nothing loads until a location is set (GPS, saved helper location or home base).
  const _startLat=_saved?.lat??MAP_BLANK_CENTER.lat;
  const _startLng=_saved?.lng??MAP_BLANK_CENTER.lng;
  const _startZoom=(_saved?.zoom??13)-ZOFF; // stored in Leaflet units

  if(_saved){userLat=_startLat; userLng=_startLng;}

  // Restore cached GPS if fresh — avoids re-tap after reload/idle
  const _cachedGps=_restoreCachedGps();
  if(_cachedGps){
    gpsLat=_cachedGps.lat; gpsLng=_cachedGps.lng;
    userLat=gpsLat; userLng=gpsLng;
    locationSource='gps';
  }
  _needHome=userLat==null;

  if(!_webglOK()){
    // No WebGL (very old browser) → no map; List view still works
    document.getElementById('map').innerHTML='<div style="padding:40px 20px;text-align:center;color:var(--muted);font-weight:700">The map can\'t load on this browser. Tap <strong>List</strong> to see jobs and helpers nearby.</div>';
    return;
  }
  map=new maplibregl.Map({
    container:'map',
    style:OFM_STYLE[_curTheme()],
    center:[_cachedGps?userLng:_startLng,_cachedGps?userLat:_startLat],
    zoom:_startZoom,
    attributionControl:false,
    dragRotate:false,pitchWithRotate:false,touchPitch:false,
    fadeDuration:150
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>'}),'bottom-left');
  map.on('style.load',()=>{clearTimeout(_styleFallbackTimer);_sageTint();setTimeout(_collapseAttrib,300);});
  // Attribution starts collapsed as the small "i" button (MapLibre opens it on load); tap "i" to expand
  map.once('idle',_collapseAttrib);
  _armStyleFallback();
  // WebGL context lost (iOS backgrounding) → MapLibre restores it; force a redraw after
  map.on('webglcontextrestored',()=>{try{map.triggerRepaint();}catch(e){}});

  // Overlay divs go in the canvas container BEFORE any markers, so the ring
  // draws above the map but below the pins (DOM order, no z-index needed)
  const _cc=map.getCanvasContainer();
  const _mask=document.createElement('div');
  _mask.id='map-overlay-mask';
  _mask.style.cssText='position:absolute;inset:0;pointer-events:none;';
  _cc.appendChild(_mask);

  const _ring=document.createElement('div');
  _ring.id='map-overlay-ring';
  _ring.style.cssText='position:absolute;pointer-events:none;border-radius:50%;border:4px dashed rgba(92,138,106,0.65);box-sizing:border-box;';
  _cc.appendChild(_ring);

  let _moveEndTimer=null;
  map.on('move',updateCircleOverlay);
  map.on('zoomend',()=>{_syncRadiusToMap();updateCircleOverlay();});
  map.on('moveend',()=>{
    if(_needHome)return; // blank map behind the home-base screen — don't save it or load around it
    const c=map.getCenter();
    userLat=c.lat; userLng=c.lng;
    localStorage.setItem('yoodle_map',JSON.stringify({lat:c.lat,lng:c.lng,zoom:map.getZoom()+ZOFF})); // Leaflet units
    updateZoomLimits();
    // If GPS was active but user dragged map away, switch ring to grey
    if(locationSource==='gps'&&gpsLat!==null){
      if(haversineKm(userLat,userLng,gpsLat,gpsLng)*1000>100) locationSource='manual';
    }
    updateCircleOverlay();
    clearTimeout(_moveEndTimer);
    _moveEndTimer=setTimeout(()=>{
      if(!me)return;
  // Skip tiny pans (tap-to-centre, a nudge): same ring size and the centre moved less than
      // 5% of the radius (max 250 m) since the last load, so the loaded jobs/helpers still cover the ring.
      const L=_lastJobsLoad;
      if(L&&L.r===RADIUS_KM&&haversineKm(L.lat,L.lng,userLat,userLng)<Math.min(0.25,RADIUS_KM*0.05))return;
      loadJobs();
    },600);
  });

  setTimeout(()=>{
    _mapResize();
    updateZoomLimits();
    updateCircleOverlay();
    // Show GPS dot + located state if restored from cache
    if(gpsLat&&gpsLng){
      updateGpsDot();
      const _btn=document.getElementById('map-locate-btn');
      if(_btn)_btn.classList.add('located');
    }
  },200);
}



function updateRadiusCounts(){
  if(!userLat||!userLng)return;
  const pid=myProfileId||me?.id;
  // filter jobs within radius — exclude own jobs
  ysBaseJobs=(allJobs||[]).filter(j=>{
    if(!j.lat||!j.lng)return false;
    if(pid&&j.poster_id===pid)return false;
    return haversineKm(userLat,userLng,j.lat,j.lng)<=RADIUS_KM;
  });
  // filter helpers within radius — exclude self
  ysBaseHelpers=(allHelpers||[]).filter(h=>{
    if(!h.last_lat||!h.last_lng)return false;
    if(pid&&h.id===pid)return false;
    return haversineKm(userLat,userLng,h.last_lat,h.last_lng)<=RADIUS_KM;
  });
  // helper/job lists within the radius (everyone in range is kept)
  sheetJobs=ysBaseJobs.slice();
  sheetHelpers=ysBaseHelpers.slice();
  const jobCount=sheetJobs.length;
  const helperCount=sheetHelpers.length;
  // Corner card counts the same jobs the map pins (show_on_map, open, not the featured poster).
  // Red "need help" = neighbour jobs, blue "agency jobs" = isAgencyJob(); each row hidden at 0. Helpers line always shown.
  const pinnedJobs=sheetJobs.filter(j=>j.show_on_map&&j.status==='open'&&j.poster_id!==FEATURED_POSTER_ID);
  const pinnedAgencyCount=pinnedJobs.filter(isAgencyJob).length;
  const pinnedJobCount=pinnedJobs.length-pinnedAgencyCount;
  const jobsRow=document.getElementById('map-jobs-row');
  if(jobsRow){
    document.getElementById('map-jobs-count').textContent=pinnedJobCount;
    jobsRow.style.display=pinnedJobCount>0?'flex':'none';
  }
  const agencyRow=document.getElementById('map-agency-row');
  if(agencyRow){
    document.getElementById('map-agency-count').textContent=pinnedAgencyCount;
    agencyRow.style.display=pinnedAgencyCount>0?'flex':'none';
  }
  const _mhc=document.getElementById('map-helpers-count');if(_mhc)_mhc.textContent=helperCount;
  document.getElementById('sheet-jobs-count').textContent=jobCount;
  document.getElementById('sheet-helpers-count').textContent=helperCount;
  // show corner card, hide loading
  const countsEl=document.getElementById('map-counts');
  const loadingEl=document.getElementById('map-counts-loading');
  const dataEl=document.getElementById('map-counts-data');
  if(countsEl)countsEl.style.display='block';
  if(loadingEl)loadingEl.style.display='none';
  if(dataEl)dataEl.style.display='flex';
  // also refresh list view if visible
  renderListTabContent();
  ysRender();
}
