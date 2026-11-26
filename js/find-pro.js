// Find a pro: trades grid and pro list cards.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// ══ FIND A PRO (Oct 2026) ══
// "PRO" button (top bar) → popup of trades that have at least one approved pro NEAR the map (allPros /
// get_pros_near, same distance as helpers) → pick one: pros of that trade appear on the map (glowing orange) and in the List's Help tab
// (regular helpers drop out of the list; on the map they fade). Pro pins are hidden until a trade is picked —
// except pros whose paid plan includes always_on_map (get_pros_near.always_on_map, from pro_plans.benefits), shown always (30 Oct 2026).
// One filter at a time: picking a pro trade clears the helper category and vice versa.
// Tracking: log_search('pro:<trade>') for picks, log_tap('pro', …) for pin/card taps (filter = trade).
let psTrade=null;
function psMatch(p){return !!psTrade&&(p.trades||[]).includes(psTrade);}
function psList(){return (allPros||[]).filter(psMatch);}
function psCounts(){const c={};(allPros||[]).forEach(p=>new Set(p.trades||[]).forEach(k=>{c[k]=(c[k]||0)+1;}));return c;}
function psRenderGrid(){
  const el=document.getElementById('ps-grid');if(!el)return;
  const c=psCounts();
  const keys=Object.keys(c).sort((a,b)=>c[b]-c[a]||proTrade(a).label.localeCompare(proTrade(b).label));
  const n=(allPros||[]).length,sub=document.getElementById('ps-sub');
  if(sub)sub.textContent=n?`${n} approved ${n===1?'pro':'pros'} near you`:'Yoodle Pros';
  el.innerHTML=keys.length?keys.map(k=>{const t=proTrade(k);
    return `<button class="hs-cat ps-cat${psTrade===k?' on':''}" onclick="psPick('${ysAttr(k)}')"><span class="e">${t.emoji}</span><span class="t">${esc(t.label)}</span><span class="n">${c[k]}</span></button>`;
  }).join(''):'<div class="ps-empty">No pros near you yet — check back soon.</div>';
}
// one Filter button + popup now (15 Nov 2026): the pro step lives inside #hs-ov
function psOpen(){hsOpen('pro');}
function psClose(){hsClose();}
function psToggle(){hsToggle();}
function psSetBtn(){
  const btn=document.getElementById('hs-btn'),lbl=document.getElementById('hs-label'),x=document.getElementById('hs-x');if(!btn)return;
  if(psTrade){const t=proTrade(psTrade);btn.classList.add('on','pro-on');lbl.textContent=`${t.emoji} ${t.label}`;btn.title=t.label;x.style.display='inline-flex';}
  else if(!hsCat){btn.classList.remove('on','pro-on');lbl.textContent='Filter';btn.title='';x.style.display='none';}
}
function psPick(k){
  psTrade=k||null;psClose();
  if(psTrade&&hsCat)hsPick(null); // one filter at a time: a pro pick clears the helper category
  psSetBtn();
  if(psTrade){
    const list=psList(),t=proTrade(psTrade);
    if(_hsInList()){if(listTab!=='helpers')switchListTab('helpers');}
    else{if(!document.getElementById('app-map').classList.contains('active'))nav('map');psFit(list);}
    logSearch('pro:'+psTrade,list.length);
    toast(list.length?`🔧 ${list.length} ${t.label} ${list.length===1?'pro':'pros'} on Yoodle`:`No ${t.label} pros on Yoodle yet`);
  }
  renderMapPins();
  renderListTabContent();
}
// pros can be anywhere (whole map): if none of the picked trade is on screen, zoom out to show them
function psFit(list){
  try{
    if(!map||!list.length)return;
    const b=map.getBounds();
    if(list.some(p=>b.contains([p.lng,p.lat])))return;
    const c=map.getCenter(),bb=new maplibregl.LngLatBounds([c.lng,c.lat],[c.lng,c.lat]);
    list.forEach(p=>bb.extend([p.lng,p.lat]));
    map.fitBounds(bb,{padding:70,maxZoom:13,duration:800});
  }catch(e){}
}
function proListCard(p){
  const t=proTrade((p.trades||[])[0]);
  const title=p.business_name||p.name||'Yoodle Pro';
  const ver=p.licence_verified_at?'<span style="font-size:11.5px;font-weight:800;color:#1F8E5A;margin-left:6px">✓ Verified licence</span>':'';
  let dist='';const oLat=gpsLat||userLat,oLng=gpsLng||userLng;
  if(oLat&&oLng&&p.lat&&p.lng){const d=haversineKm(oLat,oLng,p.lat,p.lng);dist=d<=1?'Less than 1 km away':`${d<100?d.toFixed(1):Math.round(d)} km away`;}
  return `<div onclick="logTap('pro','${p.profile_id}','card');openOtherProfile('${p.profile_id}','pro')" style="background:var(--surface);border-radius:var(--radius-sm);padding:14px 16px;border:1.5px solid rgba(245,138,7,.45);display:flex;flex-direction:column;gap:6px;cursor:pointer">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:30px;height:30px;border-radius:50%;background:${PRO_PIN};display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">${t.emoji}</div>
          <div style="min-width:0;flex:1">
            <div style="font-size:15px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(title)}${idvChip(p.profile_id,true)}</div>
            <div style="font-size:13px;font-weight:800;color:#B45F06">${esc(proTradesText(p.trades))}${ver}</div>
          </div>
          <div style="font-size:13.5px;color:var(--muted);font-weight:800;flex-shrink:0">View ›</div>
        </div>
        ${dist?`<div style="font-size:12.5px;color:var(--muted);font-weight:700">${esc(dist)}</div>`:''}
      </div>`;
}
