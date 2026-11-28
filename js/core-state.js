// Shared app state used across features (Supabase client, signed-in user, map, location).
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

let sb, me, myProfileId, activeJob, mapCatFilter='all', listCatFilter='all';
let ratingTaskId=null, ratingRatedId=null, selectedRating=0;
let map, userMarker, radiusCircle, jobMarkers=[], allJobs=[], myAppliedTaskIds=new Set();
let userLat=null, userLng=null;
const MAP_BLANK_CENTER={lat:56,lng:-96}; // drawing only, behind the home-base screen (no Toronto default) — never used to load data
let _needHome=false,_homeWantGps=false,myHomeHasAddr=false; // home base: see HOME BASE below
let gpsLat=null, gpsLng=null, locVerified=false;

// Tab lists (idea board #9, 27 Nov 2026): Messages and Activity keep what they last showed. Opening the tab shows it
// straight away (no spinner); within a minute of the last load there's no call at all; otherwise it reloads in the
// background and redraws only if something changed. Any direct loadMessages() / loadMyJobs() call (after an action,
// a realtime message, closing a chat) always reloads, so actions don't need to mark anything. Keyed by account:
// another account never sees the last one's list, and signOut() clears them (tabClearAll).
const TAB_FRESH_MS=60000;
const tabCache={messages:{at:0,owner:null,el:'conversations-list'},myjobs:{at:0,owner:null,el:'my-grid'}};
function _tabOwner(){return me?(myProfileId||me.id):null;}
// Opened from the nav: true when the list on screen is this account's and under a minute old (skip the reload)
function tabFresh(k){const c=tabCache[k];return !!c.owner&&c.owner===_tabOwner()&&Date.now()-c.at<TAB_FRESH_MS;}
// Start of a load: spinner only if nothing of this account's is on screen. Returns true if a list is showing.
function tabBegin(k,el){
  const c=tabCache[k];
  if(c.owner&&c.owner===_tabOwner()&&el._tabHtml!=null)return true;
  el._tabHtml=null;el.innerHTML=spin();return false;
}
// End of a load: draw html unless it's what's already there. Returns true if it redrew.
function tabShow(k,el,html){
  const c=tabCache[k];c.at=Date.now();c.owner=_tabOwner();
  if(el._tabHtml===html)return false;
  el.innerHTML=html;el._tabHtml=html;return true;
}
// A failed load: keep the list on screen if there is one, else show the error. Not counted as fresh.
function tabError(k,el,html){if(el._tabHtml==null)el.innerHTML=html;}
function tabClearAll(){
  Object.values(tabCache).forEach(c=>{c.at=0;c.owner=null;const el=document.getElementById(c.el);if(el){el._tabHtml=null;el.innerHTML='';}});
}
// Something changed elsewhere (a new message, an action on another screen): the next visit reloads. No args = both.
function tabDirty(...ks){(ks.length?ks:Object.keys(tabCache)).forEach(k=>{if(tabCache[k])tabCache[k].at=0;});}
// Messages: what the list was drawn from (chat, last message time, unread). refreshUnreadCount() compares it with
// the get_conversations result it already fetches, so a change seen by the 60 s poll marks the list for reload.
function tabConvSig(rows){return (rows||[]).map(c=>c.conversation_id+':'+(c.last_msg_created_at||'')+':'+(c.has_unread?1:0)).join('|');}
