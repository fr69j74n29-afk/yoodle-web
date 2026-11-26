// Map pins: helpers, own pins, Yoodle Pros, job glow, renderMapPins.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

let helperMarkers=[];
let myHelperPin=null,myJobPins=[],hpFocusAreaNext=false,myIsTester=false; // own helper pin: drawn for the helper themself; tap may open the area field
let allBizListings=[], bizMarkers=[];
// ── YOODLE PROS: pro listings from pro.yoodle.ca — orange pins, separate from helper pins ──
const PRO_PIN='#EA6A12';
const PRO_TRADE_FALLBACK={plumber:{emoji:'🚰',label:'Plumber',lic:true},hvac:{emoji:'❄️',label:'HVAC',lic:true},electrician:{emoji:'⚡',label:'Electrician',lic:true}};
let PRO_TRADES=null, allPros=[], proMarkers=[];
var _lastJobsLoad=null; // {lat,lng,r}: map centre + ring radius of the last loadJobs() (small-pan skip)
function proTrade(k){return (PRO_TRADES&&PRO_TRADES[k])||PRO_TRADE_FALLBACK[k]||{emoji:'🔧',label:k};}
function proNeedsLicence(arr){return (arr||[]).some(k=>!!proTrade(k).lic);} // pro_trades.licence_required (plumber, HVAC, electrician)
function proTradesText(arr){return (arr||[]).map(k=>{const t=proTrade(k);return t.emoji+' '+t.label;}).join(' · ');}

// Job glow: non-agency job pins only
const JOB_GLOW_SHADOW='0 0 0 3px rgba(239,68,68,.25),0 0 14px 4px rgba(239,68,68,.55)';
let _jobGlowIntroDone=false;
function jobIsNew(j){const t=Date.parse(j&&j.created_at);return !isNaN(t)&&Date.now()-t<48*3600e3;}
function jobGlowClass(isNew){return isNew?'job-glow-new':(_jobGlowIntroDone?'':'job-glow-intro');}
function renderMapPins(){
  // clear existing
  if(!map)return;
  jobMarkers.forEach(m=>m.remove());jobMarkers=[];
  helperMarkers.forEach(m=>m.remove());helperMarkers=[];

  // ── JOB BUBBLES (tasks with show_on_map=true) ──
  const publicJobs=(allJobs||[]).filter(j=>j.show_on_map&&j.lat&&j.lng&&j.status==='open'&&j.poster_id!==FEATURED_POSTER_ID);
  // Stacks: jobs on the same spot (~10 m, e.g. agency jobs at a city centre) → one bubble
  // with a count; tap opens #stack-modal listing them. Agency jobs use a plain blue bubble.
  const _jGroups={};
  publicJobs.forEach(j=>{const k=(+j.lat).toFixed(4)+','+(+j.lng).toFixed(4);(_jGroups[k]=_jGroups[k]||[]).push(j);});
  Object.values(_jGroups).filter(g=>g.length>1).forEach(g=>{
    const allAgency=g.every(isAgencyJob);
    const color=allAgency?AGENCY_PIN:'#EF4444';
    const[fLat,fLng]=g.every(isCommunityJob)?[+g[0].lat,+g[0].lng]:(g[0]._fuzzy||(g[0]._fuzzy=fuzzyCoords(g[0].lat,g[0].lng)));
    const _gNb=g.filter(j=>!isAgencyJob(j)); // neighbour jobs in this stack → glow
    const _gShadow=_gNb.length?JOB_GLOW_SHADOW:'0 2px 8px rgba(0,0,0,.15)';
    const _gCls=_gNb.length?jobGlowClass(_gNb.some(jobIsNew)):'';
    const html=`<div class="${_gCls}" style="position:relative;width:38px;height:38px;border-radius:50%;background:${color};border:3px solid rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:${_gShadow};cursor:pointer">${allAgency?'':'📋'}<span style="position:absolute;top:-6px;right:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#fff;color:#111;font:800 12px/20px 'Nunito',sans-serif;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.25)">${g.length}</span></div>`;
    jobMarkers.push(_htmlMarker(html,38,38,fLat,fLng,{z:2,onClick:()=>openJobStack(g)}));
  });
  // Own jobs (myJobPins, 29 Oct 2026) use the same loop: white ring + "You" tag, no pulse, z:4, never dimmed.
  publicJobs.filter(j=>_jGroups[(+j.lat).toFixed(4)+','+(+j.lng).toFixed(4)].length===1).concat(myJobPins).forEach(job=>{
    const _mine=myJobPins.includes(job);
    const _ag=isAgencyJob(job);
    const color=_ag?AGENCY_PIN:'#EF4444';
    const emoji=_ag?'':(CAT_EMOJI[job.category]||ysEmoji(job.category)||'📋');
    const[fLat,fLng]=jobPinCoords(job);
    const icon=({ // was L.divIcon — same html/size/anchor, rendered by _htmlMarker
      html:`<div class="${_ag||_mine?'':jobGlowClass(jobIsNew(job))}" style="position:relative;width:38px;height:38px;border-radius:50%;background:${color};border:3px solid ${_mine?'#fff':'rgba(255,255,255,.25)'};display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:${_mine?`0 0 0 2px ${color},0 2px 8px rgba(0,0,0,.25)`:_ag?'0 2px 8px rgba(0,0,0,.15)':JOB_GLOW_SHADOW};cursor:pointer">${emoji}${_mine?`<span style="position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);background:#1F3D2B;color:#fff;font-size:10px;font-weight:900;line-height:14px;padding:0 5px;border-radius:6px;font-family:'Nunito',sans-serif">You</span>`:''}</div>`,
      iconSize:[38,38],iconAnchor:[19,19]
    });
    // z:2 → job bubbles sit in front of ⚡ ready helpers (z:1.5) and regular helper pins (z:1); search-matched helpers (z:3) still on top
    const marker=_htmlMarker(icon.html,38,38,fLat,fLng,{z:_mine?4:2,onClick:()=>{if(!_mine)logTap('job',job.id,'pin');openJob(job);}});
    marker._mine=_mine;
    jobMarkers.push(marker);
  });
  // Find-a-helper filter on: fade all job pins (neighbour + agency, single + stacks) and stop their pulse,
  // so the matching helpers stand out. Cleared when the filter is removed (hsPick → renderMapPins).
  if(hsCat||psTrade)jobMarkers.forEach(m=>{if(m._mine)return;const d=m.getElement().firstElementChild;if(d){d.classList.remove('job-glow-new','job-glow-intro');d.classList.add('hs-pin-dim');}});
  if(publicJobs.some(j=>!isAgencyJob(j)))_jobGlowIntroDone=true; // later re-renders don't replay the 3 pulses

  // ── HELPER PINS (profiles with visible_on_map=true AND show_on_map=true) ──
  const publicHelpers=(allHelpers||[]).filter(h=>h.show_on_map&&h.last_lat&&h.last_lng);
  // Stacks: helpers who entered only a city (e.g. "Toronto, Ontario")
  // share one geocode. Group identical spots (~10 m) into one green count bubble; tap → #stack-modal list.
  // Category search: bubble glows with "matches/total" if any member matches, else dims.
  const _hGroups={};
  [...publicHelpers,...(myHelperPin?[myHelperPin]:[])].forEach(h=>{const k=(+h.last_lat).toFixed(4)+','+(+h.last_lng).toFixed(4);(_hGroups[k]=_hGroups[k]||[]).push(h);});
  const _hStacked=new Set(); // helper ids drawn inside a bubble
  Object.values(_hGroups).forEach(g=>{
    if(g.length<2)return;
    g.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    g.forEach(h=>_hStacked.add(h.id));
    const[cLat,cLng]=g[0]._fuzzy||(g[0]._fuzzy=fuzzyCoords(g[0].last_lat,g[0].last_lng));
    const hasMe=!!myHelperPin&&g.some(h=>h.id===myHelperPin.id);
    const nMatch=hsCat?g.filter(h=>h!==myHelperPin&&hsMatch(h)).length:0;
    const label=hsCat&&nMatch?`${nMatch}/${g.length}`:String(g.length);
    const you=hasMe?`<span style="position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);background:#1F3D2B;color:#fff;font-size:10px;font-weight:900;line-height:14px;padding:0 5px;border-radius:6px">You</span>`:'';
    const html=`<div class="${g.some(h=>readyOf(h.id))?'rtw-pulse':''}" style="position:relative;width:38px;height:38px;border-radius:50%;background:#5C8A6A;border:3px solid ${hasMe?'#fff':'rgba(255,255,255,.6)'};box-shadow:${hasMe?'0 0 0 2px #2E7D52,':''}0 2px 8px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;font-size:${label.length>2?12:15}px;font-weight:900;color:#fff;cursor:pointer;font-family:'Nunito',sans-serif">${label}${you}${g.some(h=>readyOf(h.id))?'<span class="rtw-bolt" title="Ready to work">⚡</span>':''}</div>`;
    const marker=_htmlMarker(html,38,38,cLat,cLng,{z:hasMe?4:(nMatch?3:(g.some(h=>readyOf(h.id))?1.5:1)),onClick:()=>openHelperStack(g)});
    if(hsCat){const d=marker.getElement().firstElementChild;if(d)d.classList.add(nMatch?'hs-pin-glow':'hs-pin-dim');}
    else if(psTrade){const d=marker.getElement().firstElementChild;if(d)d.classList.add('hs-pin-dim');}
    helperMarkers.push(marker);
  });
  publicHelpers.forEach(h=>{
    if(_hStacked.has(h.id))return; // drawn inside a count bubble
    const[fLat,fLng]=h._fuzzy||(h._fuzzy=fuzzyCoords(h.last_lat,h.last_lng));
    const icon=({ // was L.divIcon — same html/size/anchor, rendered by _htmlMarker
      html:`<div class="${rtwPulse(h.id)}" style="position:relative;width:38px;height:38px;border-radius:50%;background:#5C8A6A;border:3px solid rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.15);cursor:pointer;font-family:'Nunito',sans-serif">${isIdVerified(h.id)?'<span class="idv-tick">✓</span>':''}${rtwBolt(h.id)}</div>`,
      iconSize:[38,38],iconAnchor:[19,19]
    });
    const marker=_htmlMarker(icon.html,38,38,fLat,fLng,{z:hsMatch(h)?3:(readyOf(h.id)?1.5:1),onClick:()=>{logTap('helper',h.id,'pin');openOtherProfile(h.id);}});
    // chosen category → matching helpers glow amber, others fade
    if(hsCat){const d=marker.getElement().firstElementChild;if(d)d.classList.add(hsMatch(h)?'hs-pin-glow':'hs-pin-dim');}
    else if(psTrade){const d=marker.getElement().firstElementChild;if(d)d.classList.add('hs-pin-dim');}
    helperMarkers.push(marker);
  });
  // Own helper pin: white ring + "You" tag, never dimmed by search. If stacked, the bubble carries the "You" tag instead.
  // Tap: city-only location → helper profile with the area field ready; otherwise my profile as neighbours see it.
  if(myHelperPin&&!_hStacked.has(myHelperPin.id)){
    const m=myHelperPin;
    const[fLat,fLng]=m._fuzzy||(m._fuzzy=fuzzyCoords(m.last_lat,m.last_lng));
    const html=`<div class="${rtwPulse(m.id)}" style="position:relative;width:38px;height:38px;border-radius:50%;background:#5C8A6A;border:3px solid #fff;box-shadow:0 0 0 2px #2E7D52,0 2px 8px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:#fff;cursor:pointer;font-family:'Nunito',sans-serif">${isIdVerified(m.id)?'<span class="idv-tick">✓</span>':''}${rtwBolt(m.id)}<span style="position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);background:#1F3D2B;color:#fff;font-size:10px;font-weight:900;line-height:14px;padding:0 5px;border-radius:6px">You</span></div>`;
    const vague=hpIsVagueText(m.helper_address);
    helperMarkers.push(_htmlMarker(html,38,38,fLat,fLng,{z:4,onClick:()=>{if(vague){hpFocusAreaNext=true;nav('helper');}else openOtherProfile(m.id);}}));
  }

  // ── PRO PINS (orange; paid plan (always_on_map) = bold "PRO" label, free plan = trade emoji (25 Nov 2026); ✓ = licence checked) — hidden until a trade is picked in Find a PRO,
  //    except paid pros with always_on_map: always shown; they glow only when their trade is picked (30 Oct 2026) ──
  proMarkers.forEach(m=>m.remove());proMarkers=[];
  const _helperAt=new Set([...publicHelpers,...(myHelperPin?[myHelperPin]:[])].map(h=>h.id));
  (allPros||[]).forEach(p=>{
    const _match=psMatch(p);
    if(!_match&&!p.always_on_map)return;
    const t=proTrade((p.trades||[])[0]);
    const[fLat,fLng]=[p.lat,p.lng]; // business address is public (Yoodle Pro Terms) — exact pin, no offset
    const ver=p.licence_verified_at?`<span style="position:absolute;right:-5px;bottom:-5px;width:17px;height:17px;border-radius:50%;background:#1F8E5A;color:#fff;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid #fff">✓</span>`:'';
    const idv=isIdVerified(p.profile_id)?'<span class="idv-tick" style="left:-5px;right:auto" title="ID checked by Stripe">✓</span>':'';
    const you=p.mine?`<span style="position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);background:#000;color:#fff;font-size:10px;font-weight:900;line-height:14px;padding:0 5px;border-radius:6px">You</span>`:'';
    const html=`<div class="${_match?'ps-pin-glow':''}" style="position:relative;width:38px;height:38px;border-radius:50%;background:${PRO_PIN};border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-family:'Nunito',sans-serif;font-size:${p.always_on_map?'12.5px;font-weight:900;letter-spacing:.3px;color:#fff':'17px'};box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer" title="${esc(t.label||'Pro')}">${p.always_on_map?'PRO':t.emoji}${ver}${idv}${you}</div>`;
    // same person also listed as a helper → nudge the pro pin so the two never sit exactly on top of each other
    const off=_helperAt.has(p.profile_id)?[24,-24]:[0,0];
    proMarkers.push(_htmlMarker(html,38,38,fLat,fLng,{z:p.mine?5:(_match?4:3),offset:off,onClick:()=>{logTap('pro',p.profile_id,'pin');openOtherProfile(p.profile_id,'pro');}}));
  });

  // ── BUSINESS FLAG PINS ──
  bizMarkers.forEach(m=>m.remove());bizMarkers=[];
  (allBizListings||[]).forEach(biz=>{
    const initial=(biz.business_name||'B').charAt(0).toUpperCase();
    const icon=({ // was L.divIcon — same html/size/anchor, rendered by _htmlMarker
      html:`<div style="display:flex;align-items:flex-start;cursor:pointer;filter:drop-shadow(0 1px 3px rgba(0,0,0,.2))">
        <div style="width:3px;height:44px;background:#854F0B;border-radius:1px"></div>
        <div style="display:flex;flex-direction:column;align-items:center">
          <div style="width:40px;height:26px;background:linear-gradient(135deg,#FAEEDA,#FAC775);border:1.5px solid #BA7517;border-left:none;border-radius:0 4px 4px 0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#633806;font-family:'Nunito',sans-serif">${initial}</div>
          <div style="font-size:10.5px;color:#633806;background:rgba(250,238,218,.9);padding:1px 4px;border-radius:2px;margin-top:1px;white-space:nowrap;max-width:60px;overflow:hidden;text-overflow:ellipsis">${esc(biz.business_name||'')}</div>
        </div>
      </div>`,
      iconSize:[46,52],iconAnchor:[3,44]
    });
    const marker=_htmlMarker(icon.html,46,52,biz.lat,biz.lng,{z:2,anchor:'top-left',offset:[-3,-44],onClick:()=>openBizListing(biz)});
    bizMarkers.push(marker);
  });
}

let allHelpers=[];
