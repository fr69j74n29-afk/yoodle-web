// Post a job: category picker, location, address, posting.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// ── Post a Job: category picker ──
function ysRenderPostCats(){
  const el=document.getElementById('p-cat-grid');if(!el)return;
  const cur=ysKey(document.getElementById('p-cat').value);
  el.innerHTML=ysCats.map(c=>{
    const k=ysKey(c.name);
    return `<button type="button" class="${cur===k?'on':''}" onclick="ysSetPostCat('${ysAttr(k)}')">${c.emoji||''} ${esc(c.name)}</button>`;
  }).join('');
}
function ysSetPostCat(k){
  const c=ysCats.find(x=>ysKey(x.name)===k);
  document.getElementById('p-cat').value=c?c.name:'';
  ysRenderPostCats();
}
function selCat(el){document.querySelectorAll('.cat-opt').forEach(c=>c.classList.remove('sel'));el.classList.add('sel');selCatVal=el.dataset.cat;}

async function detectLocation(){
  const inp=document.getElementById('p-loc');const st=document.getElementById('loc-status');
  if(isDemoAccount){demoLocationNote();gpsLat=DEMO_CENTER.lat;gpsLng=DEMO_CENTER.lng;inp.value='Downtown Toronto, ON';locVerified=false;st.textContent='📍 Demo account — job placed in downtown Toronto';st.className='loc-status manual';return;}
  // Same street-level GPS check as the helper profile: hold the result until the poster confirms it
  gpsStreetLookup('gps-btn','loc-status',p=>{
    inp.value=p.display;gpsLat=null;gpsLng=null;locVerified=false;
    jobGpsPending=p;
    document.getElementById('p-gps-confirm-addr').textContent=p.display;
    document.getElementById('p-gps-confirm').style.display='block';
    st.textContent='Please confirm the address below';st.className='loc-status manual';
  });
}

let jobGpsPending=null;
let jobLocSet=false; // job address picked from suggestions or GPS-confirmed (gpsLat alone can be the user's own GPS reading)
function jobGpsConfirm(ok){
  const p=jobGpsPending;jobGpsPending=null;
  document.getElementById('p-gps-confirm').style.display='none';
  if(!p)return;
  const st=document.getElementById('loc-status');
  if(ok){
    gpsLat=p.exactLat;gpsLng=p.exactLng;locVerified=true;jobLocSet=true; // jobs keep the exact GPS position (Roman, 11 Oct)
    st.textContent='✅ GPS verified — street only, no house number';st.className='loc-status verified';
  }else{
    const inp=document.getElementById('p-loc');
    inp.value='';inp.placeholder=`Job address in ${p.city||'your city'}`;
    gpsLat=null;gpsLng=null;locVerified=false;
    st.textContent='Type the job address and pick it from the suggestions';st.className='loc-status';
    try{inp.focus({preventScroll:true});}catch(e){inp.focus();}
    try{inp.scrollIntoView({block:'center'});}catch(e){}
  }
}

// Job address suggestion format + saved text — shared by Post a Job and Edit Job
function jobAddrFormat(item){const a=item.address||{};
    const main=a.house_number?`${a.house_number} ${a.road||a.pedestrian||''}`:(a.road||a.pedestrian||a.footway||a.path||a.neighbourhood||a.suburb||item.display_name.split(',')[0]);
    const sub=[a.suburb||a.neighbourhood,a.city||a.town||a.village||a.county,a.state||a.state_code,a.country_code?.toUpperCase()].filter(Boolean).join(', ');
    return{main:main.trim()||item.display_name.split(',')[0],sub:sub||item.display_name};}
function jobAddrText(item){
  const a=item.address||{};
  const road=a.house_number?`${a.house_number} ${a.road||''}`.trim():(a.road||a.pedestrian||a.footway||a.path||'');
  const area=a.suburb||a.neighbourhood||a.city_district||'';
  const city=a.city||a.town||a.village||a.municipality||'';
  const prov=a.state_code||a.state||'';
  return addrDisplay([road,area,city,prov])||item.display_name.split(',').slice(0,3).join(',').trim();
}
const jobAddr=makeAddrSearch({sugId:'loc-suggestions',statusId:'loc-status',pickFn:'selectLocSuggestion',
  noResults:'No addresses found — try a different search',format:jobAddrFormat});

function onLocInput(val){
  locVerified=false;jobLocSet=false;
  if(jobGpsPending){jobGpsPending=null;document.getElementById('p-gps-confirm').style.display='none';}
  const st=document.getElementById('loc-status');
  if(val.length>=3){st.textContent='Searching…';st.className='loc-status loading';}
  jobAddr.input(val);
}

function selectLocSuggestion(i){
  const item=jobAddr.item(i);if(!item)return;
  document.getElementById('p-loc').value=jobAddrText(item);
  gpsLat=parseFloat(item.lat);gpsLng=parseFloat(item.lon);locVerified=false;jobLocSet=true;
  const st=document.getElementById('loc-status');
  st.innerHTML=`📍 Address confirmed: <span style="color:var(--text)">${esc(item.display_name.split(',').slice(0,3).join(',').trim())}</span>`;
  st.className='loc-status manual';
  hideLocSuggestions();
}

function showLocSuggestions(){openOv('loc-suggestions');}
function hideLocSuggestions(){closeOv('loc-suggestions');}

async function postJob(){
  const title=document.getElementById('p-title').value.trim();const desc=document.getElementById('p-desc').value.trim();const budget=document.getElementById('p-budget').value;const loc=document.getElementById('p-loc').value.trim();
  if(!title)return toast('Add a job title!');
  if(!desc)return toast('Describe the job!');
  const cat=document.getElementById('p-cat').value||'';
  if(!cat)return toast('Pick a category!');
  if(!loc)return toast('Add your location!');
  if(jobGpsPending)return toast('⚠️ Please confirm your GPS address first');
  if(!jobLocSet||!gpsLat||!gpsLng)return toast('⚠️ Please select an address from the suggestions or use GPS');
  if(!sb||!me){toast('🚀 Job posted! (demo mode)');resetPost();nav('browse');return;}
  const until=jobExpiryValue('p-exp'); // "How long should your job stay up?" (js/job-expiry.js): 2 weeks or a picked day
  if(!until)return toast('Pick the last day for your job');
  if(typeof postOffer!=='undefined'&&postOffer&&window.ctSendOffer)return ctSendOffer({title,desc,cat,budget,loc,until}); // private offer to a contact (js/contacts.js)
  const btn=document.getElementById('post-btn');btn.disabled=true;btn.textContent='Posting…';
  const{error}=await sb.from('tasks').insert({poster_id:myProfileId||me.id,title,description:desc,category:cat,price:budget?parseFloat(budget):0,address:loc,location_verified:locVerified,lat:gpsLat||null,lng:gpsLng||null,status:'open',...jobExpiryFields(until,jobExpiryPicked('p-exp')),show_on_map:true}); // jobs always pinned on the map
  btn.disabled=false;btn.textContent='Post Job';
  if(error)return toast('❌ '+error.message);
  // Non-helpers: the job's area becomes their home base (~1 km). Helpers keep their helper address.
  if(!myHomeHasAddr)sb.from('profiles').update({helper_lat:Math.round(gpsLat*100)/100,helper_lng:Math.round(gpsLng*100)/100}).eq('id',myProfileId||me.id).then(()=>{},()=>{});
  toast('🎉 Job posted! It stays up until '+jobExpiryShort(until)+'.');resetPost();nav('browse');
}

function resetPost(){
  gpsLat=null;gpsLng=null;locVerified=false;jobLocSet=false;
  jobGpsPending=null;document.getElementById('p-gps-confirm').style.display='none';
  ['p-title','p-desc','p-budget','p-cat'].forEach(id=>document.getElementById(id).value='');
  ysRenderPostCats();
  jobExpiryRender('p-exp');
  const loc=document.getElementById('p-loc');loc.value='';loc.placeholder='Start typing your address…';
  const st=document.getElementById('loc-status');st.textContent='Type an address and select from suggestions, or tap GPS';st.className='loc-status';
  document.getElementById('gps-btn').innerHTML=ICO.nav+'GPS';
  hideLocSuggestions();
  if(window.ctOfferFormSetup)ctOfferFormSetup(); // private offer mode on/off (js/contacts.js)
}
