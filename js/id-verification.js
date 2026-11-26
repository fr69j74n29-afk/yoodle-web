// ID verification (Stripe Identity) and verified badges.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// Show / hide a popup, sheet or dropdown by id via its "open" class. Missing element → no-op.
// ── ID VERIFICATION (Stripe Identity) ──
// Any signed-in member pays $2.99 + tax (Stripe Tax picks GST/HST from the billing address), then Stripe checks a photo ID + live selfie. Backend: Edge Functions
// identity-checkout → identity-start → identity-webhook (writes identity_verifications). Members can only READ their own row.
// Badge (Option A): "an ID-checked person owns this account" — not tied to the display name.
let verifiedIds=new Set();
async function loadVerifiedIds(){
  if(!sb)return;
  try{
    const{data,error}=await sb.rpc('get_verified_ids');
    if(error)return;
    const s=new Set((data||[]).map(x=>typeof x==='string'?x:(x&&(x.get_verified_ids||x.id))).filter(Boolean));
    const changed=s.size!==verifiedIds.size||[...s].some(id=>!verifiedIds.has(id));
    verifiedIds=s;
    if(!changed)return;
    try{if(map&&(allHelpers||[]).length)renderMapPins();}catch(e){}
    try{if(document.getElementById('app-list')?.classList.contains('active'))renderListTabContent();}catch(e){}
  }catch(e){}
}
function isIdVerified(id){return !!id&&verifiedIds.has(id);}
function idvChip(id,short){return isIdVerified(id)?`<span class="idv-chip" title="ID checked by Stripe">✓ ${short?'ID':'ID verified'}</span>`:'';}
// Stripe Identity last_error.code → plain words
const IDV_ERR={
  document_expired:'Your ID has expired.',
  document_type_not_supported:"That type of ID isn't accepted — use a driver's licence, passport or provincial ID card.",
  document_unverified_other:"Stripe couldn't verify that ID.",
  selfie_face_mismatch:"The selfie didn't match the photo on your ID.",
  selfie_document_missing_photo:'The ID has no photo of you.',
  selfie_manipulated:"The selfie couldn't be used.",
  selfie_unverified_other:"Stripe couldn't verify the selfie.",
  under_supported_age:'You need to be 18 or older.',
  consent_declined:'The check was stopped before it finished.',
  abandoned:"The check wasn't finished.",
  camera_not_supported:"Your camera isn't supported — try another phone.",
  device_not_supported:"Your device isn't supported — try another phone.",
  country_not_supported:"ID from that country isn't supported."
};
const IDV_CALL_ERR={
  not_signed_in:'Please sign in again',
  already_verified:"You're already ID verified ✓",
  not_paid:"Payment hasn't arrived yet — try again in a moment",
  no_attempts_left:'No tries left — get verified again for 3 more',
  processing:'Stripe is still checking your last try',
  server:'Something went wrong — please try again',
  network:'No connection — please try again'
};
let _idvRow=null;
async function loadIdvRow(){
  const pid=myProfileId||me?.id;
  if(!sb||!pid)return null;
  const{data}=await sb.from('identity_verifications').select('status,paid_at,attempts_used,max_attempts,last_error_code,verified_at').eq('profile_id',pid).maybeSingle();
  _idvRow=data||null;
  return _idvRow;
}
// verified | processing | paid | retry | new | used_up  (open to every member)
function idvState(row){
  if(row?.status==='verified')return 'verified';
  if(row?.status==='processing')return 'processing';
  if(row?.paid_at&&row.attempts_used<row.max_attempts)return row.status==='requires_input'?'retry':'paid';
  if(row?.paid_at&&row.attempts_used>=row.max_attempts)return 'used_up';
  return 'new';
}
function _idvLeft(row){const n=Math.max(0,(row?.max_attempts||3)-(row?.attempts_used||0));return `${n} ${n===1?'try':'tries'} left`;}
function _idvBox(icon,title,sub,btnHtml){
  return `<div class="pf-card">
    <div class="pf-row">
      <div class="pf-ic b" aria-hidden="true">${icon}</div>
      <div style="flex:1;min-width:0">
        <div class="pf-t">${title}</div>
        <div class="pf-d">${sub}</div>
      </div>
    </div>${btnHtml||''}</div>`;
}
function _idvBtn(label,fn,ghost){
  return `<button onclick="${fn}" class="pf-btn ${ghost?'sec':'idv'}">${label}</button>`;
}
async function renderIdvBlock(){
  const el=document.getElementById('idv-block');
  const badgeEl=document.getElementById('p-idv');
  if(!el)return;
  const row=await loadIdvRow();
  const st=idvState(row);
  if(badgeEl){
    badgeEl.innerHTML=st==='verified'?'<span class="idv-chip" title="ID checked by Stripe">✓ ID verified</span>':'';
    badgeEl.style.display=st==='verified'?'block':'none';
  }
  if(st==='verified'){
    const d=row?.verified_at?new Date(row.verified_at).toLocaleDateString('en-CA',{month:'short',year:'numeric'}):'';
    el.innerHTML=`<div class="pf-card" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px"><span class="idv-chip" style="margin-left:0">✓ ID verified</span><span style="font-size:13px;font-weight:700;color:var(--muted)">Checked by Stripe${d?' · '+esc(d):''}</span></div>`;
    return;
  }
  if(st==='processing'){el.innerHTML=_idvBox('⏳','Checking your ID…','Stripe is checking your ID and selfie — usually a few minutes.',_idvBtn('Refresh','refreshIdv()',true));return;}
  if(st==='paid'){el.innerHTML=_idvBox('🛡️','Continue your ID check',`You've paid — the ID and selfie check is next. ${_idvLeft(row)}.`,_idvBtn('Continue verification',"startIdvCheck('profile')"));return;}
  if(st==='retry'){el.innerHTML=_idvBox('⚠️',"Your ID check didn't go through",`${esc(IDV_ERR[row?.last_error_code]||"Stripe couldn't finish the check.")} ${_idvLeft(row)} — no extra charge.`,_idvBtn('Try again',"startIdvCheck('profile')"));return;}
  // App: don't offer the $2.99 purchase (Apple rules; Roman's decision 22 Nov). Paid-on-the-website states above still show.
  if(IS_NATIVE){el.innerHTML='';return;}
  const sub=(st==='used_up'?"Your 3 tries are used up. ":'')+'Neighbours see a <span class="idv-chip" style="margin-left:0">✓ ID verified</span> badge on your profile and in chats. Checked by Stripe — takes about 2 minutes.';
  el.innerHTML=_idvBox('🛡️','Get ID verified',sub,_idvBtn('Get verified · $2.99 + tax',"openIdvConsent('profile')"));
}
// + screen card: every signed-in member who isn't verified yet
async function updateForkIdvCard(){
  const el=document.getElementById('fork-idv-card');
  if(!el)return;
  if(!sb||!me){el.innerHTML='';return;}
  const row=await loadIdvRow();
  const st=idvState(row);
  const cfg={
    new:['Get ID verified','Show neighbours a ✓ badge · $2.99 + tax',"openIdvConsent('plus')",true],
    used_up:['Get ID verified','Show neighbours a ✓ badge · $2.99 + tax',"openIdvConsent('plus')",false],
    paid:['Continue your ID check',"You've paid — the ID + selfie check is next","startIdvCheck('plus')",false],
    retry:['Try your ID check again',`${_idvLeft(row)} · no extra charge`,"startIdvCheck('plus')",false],
    processing:['Checking your ID…','Usually a few minutes',"nav('profile')",false]
  }[st];
  if(!cfg||(IS_NATIVE&&(st==='new'||st==='used_up'))){el.innerHTML='';return;} // app: no purchase offer
  const[title,sub,fn,isNew]=cfg;
  el.innerHTML=`<button onclick="${fn}" style="position:relative;width:100%;min-height:95px;display:flex;align-items:center;gap:16px;padding:20px;margin-top:16px;border-radius:16px;border:1.5px solid var(--idv-line);background:var(--idv-soft);cursor:pointer;text-align:left;font-family:'Nunito',sans-serif">
    ${isNew?`<span style="position:absolute;top:-9px;right:14px;background:var(--idv);color:#fff;font-size:10.5px;font-weight:800;letter-spacing:.5px;padding:2px 8px;border-radius:100px">NEW</span>`:''}
    <div style="width:52px;height:52px;border-radius:14px;background:var(--idv);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:24px">${st==='processing'?'⏳':'🛡️'}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:17px;font-weight:800;color:var(--text);margin-bottom:2px">${title}</div>
      <div style="font-size:14px;font-weight:700;color:var(--muted)">${sub}</div>
    </div>
    <span style="font-size:20px;color:var(--idv);font-weight:800;flex-shrink:0">›</span>
  </button>`;
}
async function refreshIdv(){
  const pid=myProfileId||me?.id;
  if(!sb||!pid)return;
  await renderIdvBlock();
  if(document.getElementById('app-post')?.classList.contains('active'))updateForkIdvCard();
}
// Tap tracking: open (from + or Profile) → pay (Continue to payment) → start (Continue verification / Try again / auto after paying) → cancel (back from Stripe). Admin: admin_idv_taps().
// Returns a promise that never rejects; before a redirect to Stripe we wait for it (max 1.5 s) so the tap isn't dropped.
let _idvSrc=null;
function logIdvTap(step,src){try{if(sb&&me)return sb.rpc('log_idv_tap',{p_step:step,p_source:src===undefined?_idvSrc:src}).then(()=>{},()=>{});}catch(e){}return Promise.resolve();}
const _idvLogged=p=>Promise.race([p,new Promise(r=>setTimeout(r,1500))]);
function openIdvConsent(src){
  if(IS_NATIVE)return; // app: no paid ID verification (all entry points are hidden; this is the safety net)
  if(!me){toast('Sign in first');return;}
  _idvSrc=src==='plus'||src==='profile'?src:null;
  logIdvTap('open');
  const c=document.getElementById('idv-consent');if(c)c.checked=false;
  const g=document.getElementById('idv-go');if(g){g.disabled=true;g.textContent='Continue to payment';}
  openOv('idv-modal');
}
async function _idvCall(fn){
  try{
    const{data:{session}}=await sb.auth.getSession();
    if(!session)return{error:'not_signed_in'};
    const r=await fetch(SUPABASE_URL+'/functions/v1/'+fn,{method:'POST',
      headers:{'Authorization':'Bearer '+session.access_token,'apikey':SUPABASE_ANON,'Content-Type':'application/json'},body:'{}'});
    let b={};try{b=await r.json();}catch(e){}
    return b||{};
  }catch(e){return{error:'network'};}
}
// App only: Stripe opens in the in-app browser sheet. A page navigation would be thrown out to Safari, and Stripe's
// ?idv=paid|done return would then land on the website instead of the app. Stripe's return page loads inside the sheet;
// when the user closes the sheet, check the result here and continue as handleIdvReturn() does on the website.
// kind: 'pay' (Stripe Checkout) | 'check' (Stripe Identity)
async function _idvOpenInSheet(url,kind){
  const B=window.Capacitor.Plugins.Browser;
  if(!B){window.location.href=url;return;}
  const paidBefore=_idvRow?.paid_at||null; // a member buying a new set of tries already has an older paid_at
  let l=null;
  try{l=await B.addListener('browserFinished',async()=>{
    if(l)l.remove();
    // the webhook can land a few seconds after the sheet closes
    for(let i=0;i<5;i++){
      const row=await loadIdvRow();
      if(kind==='pay'&&(row?.status==='verified'||(row?.paid_at&&row.paid_at!==paidBefore))){window._idvReturn='paid';return handleIdvReturn();}
      if(kind==='check'&&(row?.status==='processing'||row?.status==='verified')){window._idvReturn='done';return handleIdvReturn();}
      await _idvSleep(2000);
    }
    if(kind==='pay')logIdvTap('cancel');
    refreshIdv(); // closed without finishing: the profile card shows where they are
  });}catch(e){}
  try{await B.open({url});}catch(e){if(l)l.remove();toast('❌ '+IDV_CALL_ERR.server);}
}
async function startIdvPayment(){
  const g=document.getElementById('idv-go');
  if(!document.getElementById('idv-consent')?.checked)return;
  const logged=logIdvTap('pay');   // runs alongside the checkout call
  g.disabled=true;g.textContent='Opening Stripe…';
  const b=await _idvCall('identity-checkout');
  if(b.url){
    await _idvLogged(logged);
    if(IS_NATIVE){closeOv('idv-modal');g.disabled=false;g.textContent='Continue to payment';return _idvOpenInSheet(b.url,'pay');}
    window.location.href=b.url;return;   // Stripe Checkout → back to ?idv=paid|cancel
  }
  if(b.already_paid){closeOv('idv-modal');return startIdvCheck(_idvSrc);}
  g.disabled=false;g.textContent='Continue to payment';
  if(b.error==='already_verified'){closeOv('idv-modal');toast('✅ '+IDV_CALL_ERR.already_verified);refreshIdv();return;}
  toast('❌ '+(IDV_CALL_ERR[b.error]||IDV_CALL_ERR.server));
}
let _idvStarting=false;
async function startIdvCheck(src){
  if(_idvStarting)return;
  _idvStarting=true;toast('Opening Stripe…');
  const logged=logIdvTap('start',src==='plus'||src==='profile'?src:null);   // src: 'plus' | 'profile' | none (auto-start after paying)
  const b=await _idvCall('identity-start');
  _idvStarting=false;
  if(b.url){
    await _idvLogged(logged);
    if(IS_NATIVE)return _idvOpenInSheet(b.url,'check');
    window.location.href=b.url;return;   // Stripe Identity → back to ?idv=done (link is single-use, never stored)
  }
  toast('❌ '+(IDV_CALL_ERR[b.error]||IDV_CALL_ERR.server));
  refreshIdv();
}
const _idvSleep=ms=>new Promise(r=>setTimeout(r,ms));
async function handleIdvReturn(){
  const r=window._idvReturn;window._idvReturn=null;
  if(!r)return;
  if(r==='cancel'){_idvSrc=null;logIdvTap('cancel');toast('Payment cancelled — nothing was charged');return;}
  nav('profile');
  if(r==='paid'){
    // the webhook can land a few seconds after Stripe sends you back
    for(let i=0;i<8;i++){const row=await loadIdvRow();if(row?.paid_at||row?.status==='verified')break;await _idvSleep(2000);}
    await refreshIdv();
    if(_idvRow?.paid_at&&_idvRow.status!=='verified'){toast('✅ Payment received — starting your ID check');setTimeout(()=>startIdvCheck(),1200);}
    else toast('Payment is processing — tap Continue in a moment');
    return;
  }
  // r==='done': back from Stripe Identity
  toast('Thanks! Stripe is checking your ID…');
  for(let i=0;i<10;i++){await _idvSleep(2500);const row=await loadIdvRow();if(row&&row.status!=='pending'&&row.status!=='processing')break;}
  await refreshIdv();
  await loadVerifiedIds();
  if(_idvRow?.status==='verified')toast("✅ You're ID verified!");
}
