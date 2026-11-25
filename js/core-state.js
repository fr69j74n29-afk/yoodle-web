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
