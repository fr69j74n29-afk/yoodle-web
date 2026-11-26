// Fire-and-forget logging (taps, searches, agency events, active members, business events).
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// Opens + Apply taps → public.agency_events via log_agency_event() (signed-out viewers counted by a random browser id). Never blocks the UI.
function yAnonId(){try{let a=localStorage.getItem('yoodle_anon');if(!a){a=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(36).slice(2));localStorage.setItem('yoodle_anon',a);}return a;}catch(e){return null;}}
// Fire-and-forget logging: never blocks or breaks the UI. A failed call leaves a console warning
// (prefix "[log]") so broken tracking is visible in DevTools instead of failing silently.
function fireRpc(name,args){
  try{if(!sb)return;sb.rpc(name,args).then(r=>{if(r&&r.error)console.warn('[log] '+name+': '+r.error.message);},e=>console.warn('[log] '+name+': '+(e&&e.message||e)));}catch(e){}
}
function logAgency(taskId,ev){
  if(taskId)fireRpc('log_agency_event',{p_task:taskId,p_event:ev,p_anon:me?null:yAnonId()});
}
function logTap(kind,id,src){
  if(me&&id){const a={p_kind:kind,p_target:id,p_src:src};if(kind==='helper'&&hsCat)a.p_filter=hsCat;if(kind==='pro'&&psTrade)a.p_filter=psTrade;fireRpc('log_tap',a);}
}
// Find-a-helper category picks → public.search_events via log_search() (server skips repeats within 10 min). Never blocks the UI.
function logSearch(cat,n){
  if(me&&cat)fireRpc('log_search',{p_category:cat,p_helpers:n|0,p_radius:Math.round(RADIUS_KM)||0});
}

// Active-member tracking → public.daily_active via log_active() (one row per person per Toronto day). At most once per 15 min per tab. Never blocks the UI.
let _lastActivePing=0;
function logActive(){
  if(sb&&me){const n=Date.now();if(n-_lastActivePing<15*60*1000)return;_lastActivePing=n;fireRpc('log_active');}
}

function logBizEvent(listingId,eventType){
  fireRpc('log_business_event',{p_listing_id:listingId,p_event_type:eventType,p_viewer_id:myProfileId||me?.id||null});
}
