// Another member's profile sheet.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

async function openOtherProfile(userId, mode){ // mode 'pro' = Pro card only (pro pin / pro share link)
  if(hiddenUserIds.has(userId)&&!iBlockedIds.has(userId)){toast('This profile is not available');return;}
  // Remember whichever modal is currently open so we can restore it on close
  _opParentModal=document.querySelector('.modal-ov.open')||null;
  // Hide it so only the profile modal shows
  if(_opParentModal)_opParentModal.classList.remove('open');

  const modal=document.getElementById('op-modal');
  const content=document.getElementById('op-content');
  content.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const opShareBtn=document.getElementById('op-share-btn');
  if(opShareBtn)opShareBtn.style.display='none';
  window._opShare=null;
  modal.classList.add('open');

  const [profRes,lastActiveRes,proRes]=await Promise.all([
    sb.from('profiles').select('id,name,bio,rating,task_count,avatar_color,helper_categories,helper_bio,helper_rate,helper_rate_type,visible_on_map,helper_address').eq('id',userId).maybeSingle(),
    sb.rpc('get_last_active',{p_user:userId}),
    sb.rpc('get_public_pros',{p_profile:userId}).maybeSingle()   // approved pros only (database-enforced)
  ]);

  const prof=profRes.data;
  // Last active: coarse bucket only — today / week / month / older; blank if unknown or RPC missing
  const _la=lastActiveRes&&!lastActiveRes.error?lastActiveRes.data:null;
  const _laTxt={today:'Active today',week:'Active this week',month:'Active this month',older:'Last active over a month ago'}[_la]||'';
  const lastActiveHtml=(_laTxt&&userId!==(myProfileId||me?.id))?`<div class="op-active${_la==='today'?' on':''}"><span class="dot"></span>${_laTxt}</div>`:'';
  if(!prof){content.innerHTML='<div style="text-align:center;padding:60px 20px;color:var(--muted);font-size:14px;font-weight:700">👤 Profile not found.</div>';return;}

    const initial=((prof.name||'?')[0]).toUpperCase();
    window._opName=prof.name||'this person';
    // Share button (header): only for active helpers — their public page yoodle.ca/helpers/{id} needs visible_on_map
    if(prof.visible_on_map&&userId!==(myProfileId||me?.id)&&!iBlockedIds.has(userId)){
      window._opShare={id:userId,address:prof.helper_address,categories:prof.helper_categories};
      if(opShareBtn)opShareBtn.style.display='flex';
    }

  // Pro listing block (pro.yoodle.ca) — shown when the person has a live Pro listing
  const _pro=proRes&&!proRes.error?proRes.data:null;
  const _proLive=_pro&&_pro.visible&&_pro.status==='approved'&&_pro.expires_at&&new Date(_pro.expires_at)>new Date();
  const proHtml=_proLive?(()=>{
    const isMe=userId===(myProfileId||me?.id);
    const area=String(_pro.address||'').trim(); // full business address (public per Yoodle Pro Terms)
    return `<div class="op-bio" style="margin-top:12px;border-top:1px solid var(--border);padding-top:16px">
      <div class="op-bio-lbl" style="color:${PRO_PIN}">Yoodle Pro</div>
      ${_pro.business_name?`<div style="font-size:15px;font-weight:800;margin-bottom:6px">${esc(_pro.business_name)}</div>`:''}
      <div style="font-size:14px;font-weight:800;margin-bottom:8px">${esc(proTradesText(_pro.trades))}</div>
      <!-- licence pill: ✓ if verified; "not verified" only for trades that need a licence. ID pill always (Roman, 25 Oct 2026) -->
      <div style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:6px">${_pro.licence_verified_at
        ?'<span style="font-size:12.5px;font-weight:800;color:#1F8E5A;background:rgba(31,142,90,.1);border-radius:100px;padding:3px 10px">✓ Verified licence</span>'
        :proNeedsLicence(_pro.trades)?'<span style="font-size:12.5px;font-weight:800;color:var(--muted);background:rgba(127,127,127,.12);border-radius:100px;padding:3px 10px">Licence not verified</span>':''}${isIdVerified(userId)
        ?'<span style="font-size:12.5px;font-weight:800;color:var(--idv);background:var(--idv-soft);border:1px solid var(--idv-line);border-radius:100px;padding:2px 10px">✓ ID verified</span>'
        :'<span style="font-size:12.5px;font-weight:800;color:var(--muted);background:rgba(127,127,127,.12);border-radius:100px;padding:3px 10px">ID not verified</span>'}</div>
      ${_pro.bio?`<div class="op-bio-text" style="margin-bottom:10px">${esc(_pro.bio)}</div>`:''}
      <div style="font-size:13px;color:var(--muted)">📍 ${area?`<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(area)}" target="_blank" rel="noopener" style="color:inherit">${esc(area)}</a>`:'Address not set'}<br>Travels up to ${Number(_pro.service_radius_km)||25} km</div>
      ${!isMe?`<button onclick="openContactModal('${userId}','${escJs(prof.name||'Pro')}',true)" style="width:100%;margin-top:16px;padding:14px;border-radius:var(--radius);background:${PRO_PIN};border:none;color:#fff;font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;cursor:pointer">Contact Pro</button>`:''}
    </div>`;
  })():'';
  const proMode=mode==='pro'&&_proLive;
  // Share (header button) on the Pro card — also on your own Pro card so pros can promote themselves.
  // No public /pros page yet, so the link opens the Pro card in the app: yoodle.ca/?helper={id}&s=pro
  if(proMode&&!iBlockedIds.has(userId)){
    const _sa=_pro.address?helperShareArea(_pro.address):'';   // same rule as helper shares: neighbourhood, never the street
    window._opShare={id:userId,pro:{trades:_pro.trades,business:_pro.business_name,verified:!!_pro.licence_verified_at,area:_sa&&_sa!=='my area'?_sa:''}};
    if(opShareBtn)opShareBtn.style.display='flex';
  }

  content.innerHTML=`
    <div class="op-hero">
      <div class="op-av">${esc(initial)}</div>
      <div style="min-width:0">
        <div class="op-name">${esc(prof.name||'Yoodler')}${idvChip(userId)}${rtwChip(userId)}</div>
        <div style="font-size:14px;font-weight:800;margin-top:3px;color:${prof.rating?'var(--yellow)':'var(--muted)'}">${prof.rating?`★ ${prof.rating}`:'New'}</div><!-- one blended rating, profiles.rating -->
        ${lastActiveHtml}
        ${(me&&userId!==(myProfileId||me.id))?`<div class="op-mod-links">
          <button onclick="openReport('${userId}',window._opName,null,null)">Report</button>
          <span aria-hidden="true">·</span>
          ${iBlockedIds.has(userId)
            ?`<button class="op-mod-unblock" onclick="unblockUser('${userId}')">Unblock</button>`
            :`<button class="op-mod-block" onclick="openBlock('${userId}',window._opName)">Block</button>`}
        </div>`:''}
      </div>
    </div>
    <!-- 21 Nov 2026: fixed-price services right under the name (was at the bottom of the helper block); js/home-services.js relabels .op-rate "Other jobs: …" when there are services -->
    ${prof.visible_on_map&&window.hsvcProfileSlot?hsvcProfileSlot(userId,true):''}
    ${_proLive?`<button onclick="openOtherProfile('${userId}','pro')" style="width:100%;margin-top:12px;padding:12px 14px;border-radius:var(--radius);background:transparent;border:1.5px solid ${PRO_PIN};color:${PRO_PIN};font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer;text-align:left">🔧 Also a Yoodle Pro — ${esc(proTradesText(_pro.trades))} ›</button>`:''}
    ${(prof.bio||!prof.visible_on_map)?`<div class="op-bio">
      <div class="op-bio-lbl">About</div>
      ${prof.bio?`<div class="op-bio-text">${esc(prof.bio)}</div>`:`<div class="op-bio-empty">No bio yet.</div>`}
    </div>`:''}<!-- About hidden when empty and the helper listing below has its own description -->
    ${prof.visible_on_map?(()=>{
      const cats=(prof.helper_categories||[]);
      const rateLabel=prof.helper_rate_type==='free'||!prof.helper_rate
        ?'Willing to help free of charge'
        :`$${prof.helper_rate}${prof.helper_rate_type==='hourly'?' / hour':prof.helper_rate_type==='daily'?' / day':' flat rate'}`;
      const isMe=userId===(myProfileId||me?.id);
      return `<div class="op-bio" style="margin-top:12px;border-top:1px solid var(--border);padding-top:16px">
        <div class="op-bio-lbl" style="color:var(--lime)">Available as Helper</div>
        ${cats.length?`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">${cats.map(c=>`<span style="font-size:12.5px;font-weight:800;color:var(--purple);background:rgba(92,138,106,.08);border:1px solid rgba(92,138,106,.18);border-radius:100px;padding:3px 10px">${c}</span>`).join('')}</div>`:''}
        ${prof.helper_bio?`<div class="op-bio-text" style="margin-bottom:10px">${esc(prof.helper_bio)}</div>`:''}
        <div class="op-rate" style="font-size:14px;font-weight:800;color:var(--lime)">${rateLabel}</div>
        ${!isMe?`<button onclick="openContactModal('${userId}','${escJs(prof.name||'Helper')}')" style="width:100%;margin-top:16px;padding:14px;border-radius:var(--radius);background:linear-gradient(135deg,var(--btn-a),var(--btn-b));border:none;color:#fff;font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;cursor:pointer">Contact Helper</button>`:''}
      </div>`;
    })():''}
`;
  // Pro card: keep only the name/last-active/report-block header + the Pro block —
  // no poster/helper stats, About or helper listing (those belong to the person's yoodle.ca profile).
  if(proMode){
    const hero=content.querySelector('.op-hero');
    content.innerHTML='';
    if(hero)content.appendChild(hero);
    content.insertAdjacentHTML('beforeend',proHtml);
  }
}
