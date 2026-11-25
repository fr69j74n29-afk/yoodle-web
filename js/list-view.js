// List view, filters, radius sheet, helper cards, list tabs.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

function mapFilterCat(el,cat){document.querySelectorAll('.map-cat').forEach(c=>c.classList.remove('active'));el.classList.add('active');mapCatFilter=cat;}
function listFilterCat(el,cat){document.querySelectorAll('.cat-chip').forEach(c=>c.classList.remove('active'));el.classList.add('active');listCatFilter=cat;renderListGrid(allJobs);}

function openRadiusSheet(){
  openOv('radius-sheet');
  renderSheetContent();
}

function switchSheetTab(tab){
  sheetTab=tab;
  const jobBtn=document.getElementById('sheet-tab-jobs');
  const helperBtn=document.getElementById('sheet-tab-helpers');
  if(tab==='jobs'){
    jobBtn.style.background='var(--surface)';jobBtn.style.color='var(--text)';
    helperBtn.style.background='transparent';helperBtn.style.color='var(--muted)';
  } else {
    helperBtn.style.background='var(--surface)';helperBtn.style.color='var(--text)';
    jobBtn.style.background='transparent';jobBtn.style.color='var(--muted)';
  }
  renderSheetContent();
}

function renderSheetContent(){
  const el=document.getElementById('sheet-content');
  if(sheetTab==='jobs'){
    if(!sheetJobs.length){el.innerHTML=emptyState('🌱','No jobs in this area','Try expanding the radius');return;}
    el.innerHTML=`<div class="jobs-grid" style="padding-top:4px">${sheetJobs.map(j=>listCard(j,j.profiles)).join('')}</div>`;
  } else {
    if(!sheetHelpers.length){el.innerHTML=emptyState('💪','No helpers visible nearby','Helpers can enable visibility in their profile');return;}
    el.innerHTML=`<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">${sheetHelpers.map(helperCard).join('')}</div>`;
  }
}
// Helper list card (map sheet + helper stack sheet).
function helperCard(h){
      const name=h.name||'Helper';
      const rating=h.rating?`★ ${h.rating}`:'New';
      const cats=(h.helper_categories||[]).slice(0,4).map(c=>`<span style="font-size:11.5px;font-weight:800;color:var(--purple);background:rgba(92,138,106,.08);border:1px solid rgba(92,138,106,.18);border-radius:100px;padding:2px 8px;white-space:nowrap">${c}</span>`).join('');
      const rateLabel=h.helper_rate_type==='free'||!h.helper_rate?'Free':
        `$${h.helper_rate}${h.helper_rate_type==='hourly'?'/hr':h.helper_rate_type==='daily'?'/day':' flat'}`;
      return `<div onclick="logTap('helper','${h.id}','card');openOtherProfile('${h.id}')" style="background:var(--surface);border-radius:var(--radius-sm);padding:14px 16px;border:1.5px solid var(--border);display:flex;flex-direction:column;gap:8px;cursor:pointer">
        <div style="display:flex;align-items:center;gap:12px">
          ${avatarCircle(name,h.avatar_color,'28px','12px')}
          <div style="min-width:0;flex:1">
            <div style="font-size:15px;font-weight:800">${esc(name)}${idvChip(h.id,true)}${rtwChip(h.id)}</div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:13.5px;color:var(--yellow);font-weight:800">${rating}</span>
              <span style="font-size:13.5px;color:var(--lime);font-weight:800">${rateLabel}</span>
            </div>
          </div>
          <div style="font-size:13.5px;color:var(--muted);font-weight:800;flex-shrink:0">View ›</div>
        </div>
        ${cats?`<div style="display:flex;flex-wrap:wrap;gap:4px">${cats}</div>`:''}
        ${window.hsvcCardLine?hsvcCardLine(h.id):''}
      </div>`;
}

let listTab='jobs';

function switchListTab(tab){
  listTab=tab;
  const jobBtn=document.getElementById('list-tab-jobs');
  const helpBtn=document.getElementById('list-tab-helpers');
  if(!jobBtn)return;
  if(tab==='jobs'){
    jobBtn.style.background='var(--surface)';jobBtn.style.color='var(--text)';
    helpBtn.style.background='transparent';helpBtn.style.color='var(--muted)';
  } else {
    helpBtn.style.background='var(--surface)';helpBtn.style.color='var(--text)';
    jobBtn.style.background='transparent';jobBtn.style.color='var(--muted)';
  }
  renderListTabContent();
}

function renderListTabContent(){
  const el=document.getElementById('list-tab-content');
  if(!el)return;
  // update header label
  const lbl=document.getElementById('list-sub');
  if(lbl)lbl.textContent=`Within ${RADIUS_KM} km · map area`;
  // update counts
  const jc=document.getElementById('list-jobs-count');
  const hc=document.getElementById('list-helpers-count');
  // Find-a-helper filter applies to the Helpers tab too
  const listHelpers=hsCat?sheetHelpers.filter(hsMatch):sheetHelpers.slice();
  // ⚡ Available now first (ready today, then tomorrow), rest keep their order (stable sort) (5 Nov 2026)
  const _rk=h=>{const r=readyOf(h.id);return r==='today'?0:r==='tomorrow'?1:2;};
  listHelpers.sort((a,b)=>_rk(a)-_rk(b));
  if(jc)jc.textContent=sheetJobs.length;
  // Find-a-PRO filter: the Help tab lists only pros of that trade (whole map, closest first)
  const listPros=psTrade?psList():null;
  if(listPros){const oLat=gpsLat||userLat,oLng=gpsLng||userLng;listPros.sort((a,b)=>(!!b.listed_first-!!a.listed_first)||(oLat&&oLng?haversineKm(oLat,oLng,a.lat,a.lng)-haversineKm(oLat,oLng,b.lat,b.lng):0));}  // paid (listed_first) first, then closest (30 Oct 2026)
  if(hc)hc.textContent=listPros?listPros.length:listHelpers.length;

  if(listTab==='jobs'){
    if(!sheetJobs.length){el.innerHTML=emptyState('🌱','No jobs in this area','Move the map or try a larger radius');return;}
    el.innerHTML=`<div class="jobs-grid">${sheetJobs.map(j=>listCard(j,j.profiles)).join('')}</div>`;
  } else if(listPros){
    el.innerHTML=listPros.length
      ?`<div style="display:flex;flex-direction:column;gap:10px">${listPros.map(proListCard).join('')}</div>`
      :emptyState('🔧',`No ${esc(proTrade(psTrade).label)} pros yet`,'Tap ✕ on the filter to see helpers again');
  } else {
    if(!listHelpers.length){
      el.innerHTML=hsCat
        ?emptyState('🔍',FS_READY[hsCat]?`No standby helpers for ${hsCat==='ready:today'?'today':'tomorrow'} nearby`:`No ${esc(hsName(hsCat))} helpers nearby`,'Tap ✕ to see all helpers, or try a larger radius')
        :emptyState('💪','No helpers nearby','Helpers can enable visibility in their profile');
      return;
    }
    el.innerHTML=`<div style="display:flex;flex-direction:column;gap:10px">${listHelpers.map(h=>{
      const name=h.name||'Helper';
      const rating=h.rating?`★ ${h.rating}`:'New';
      // Find-a-helper on: matching category first + amber, so it's never cut off by the 4-tag limit
      const _hc=(h.helper_categories||[]).slice();
      if(hsCat){const mi=_hc.findIndex(c=>ysKey(c)===hsCat);if(mi>0)_hc.unshift(_hc.splice(mi,1)[0]);}
      const cats=_hc.slice(0,4).map(c=>hsCat&&ysKey(c)===hsCat
        ?`<span style="font-size:11.5px;font-weight:800;color:var(--purple);background:rgba(92,138,106,.08);border:1px solid rgba(92,138,106,.18);border-radius:100px;padding:2px 8px;white-space:nowrap;color:#fff;background:#F59E0B;border-color:#F59E0B">${c}</span>`
        :`<span style="font-size:11.5px;font-weight:800;color:var(--purple);background:rgba(92,138,106,.08);border:1px solid rgba(92,138,106,.18);border-radius:100px;padding:2px 8px;white-space:nowrap">${c}</span>`).join('');
      const rateLabel=h.helper_rate_type==='free'||!h.helper_rate?'Free':`$${h.helper_rate}${h.helper_rate_type==='hourly'?'/hr':h.helper_rate_type==='daily'?'/day':' flat'}`;
      let distLabel='';
      if(gpsLat&&gpsLng&&h.last_lat&&h.last_lng){const d=haversineKm(gpsLat,gpsLng,h.last_lat,h.last_lng);distLabel=d<=1?'Less than 1 km away':`${d.toFixed(1)} km away`;}
      return `<div onclick="logTap('helper','${h.id}','card');openOtherProfile('${h.id}')" style="background:var(--surface);border-radius:var(--radius-sm);padding:14px 16px;border:1.5px solid var(--border);display:flex;flex-direction:column;gap:8px;cursor:pointer">
        <div style="display:flex;align-items:center;gap:12px">
          ${avatarCircle(name,h.avatar_color,'28px','12px')}
          <div style="min-width:0;flex:1">
            <div style="font-size:15px;font-weight:800">${esc(name)}${idvChip(h.id,true)}${rtwChip(h.id)}</div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:13.5px;color:var(--yellow);font-weight:800">${rating}</span>
              <span style="font-size:13.5px;color:var(--lime);font-weight:800">${rateLabel}</span>
            </div>
          </div>
          <div style="font-size:13.5px;color:var(--muted);font-weight:800;flex-shrink:0">View ›</div>
        </div>
        ${cats?`<div style="display:flex;flex-wrap:wrap;gap:4px">${cats}</div>`:''}
        ${window.hsvcCardLine?hsvcCardLine(h.id):''}
        ${distLabel?`<div style="font-size:12.5px;color:var(--muted);font-weight:700">${esc(distLabel)}</div>`:''}
      </div>`;
    }).join('')}</div>`;
  }
}

function renderListGrid(jobs){
  renderListTabContent(); // list = jobs inside the ring only (updateRadiusCounts); an empty ring shows "No jobs in this area"
}

let _opParentModal=null;

function closeOtherProfile(){
  closeOv('op-modal');
  if(_opParentModal){
    _opParentModal.classList.add('open');
    _opParentModal=null;
  }
}
