// Business listings, pin stacks, agency and community jobs.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// ── BUSINESS LISTING MODAL & TRACKING ──
function openBizListing(biz){
  const initial=(biz.business_name||'B').charAt(0).toUpperCase();
  document.getElementById('biz-avatar').textContent=initial;
  document.getElementById('biz-name').textContent=biz.business_name||'';
  document.getElementById('biz-category').textContent=biz.business_category||'';
  document.getElementById('biz-desc').textContent=biz.business_description||'';
  const actions=document.getElementById('biz-actions');
  actions.innerHTML='';
  if(biz.business_website){
    const aWeb=document.createElement('a');
    aWeb.href=biz.business_website;aWeb.target='_blank';aWeb.rel='noopener';
    aWeb.style.cssText='display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--surface2);border-radius:12px;text-decoration:none;color:var(--fg);font-size:14px;font-weight:600;border:1px solid var(--surface2)';
    aWeb.innerHTML=`<span style="font-size:18px">🌐</span><span style="flex:1">${esc(biz.business_website.replace(/^https?:\/\//,''))}</span><span style="color:var(--muted);font-size:14px">↗</span>`;
    aWeb.onclick=()=>logBizEvent(biz.id,'url_tap');
    actions.appendChild(aWeb);
  }
  if(biz.business_phone){
    const aPhone=document.createElement('a');
    aPhone.href='tel:'+biz.business_phone;
    aPhone.style.cssText='display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--surface2);border-radius:12px;text-decoration:none;color:var(--fg);font-size:14px;font-weight:600;border:1px solid var(--surface2)';
    aPhone.innerHTML=`<span style="font-size:18px">📞</span><span>${esc(biz.business_phone)}</span>`;
    aPhone.onclick=()=>logBizEvent(biz.id,'phone_tap');
    actions.appendChild(aPhone);
  }
  if(biz.lat&&biz.lng){
    const aDir=document.createElement('a');
    aDir.href=`https://www.google.com/maps/dir/?api=1&destination=${biz.lat},${biz.lng}`;
    aDir.target='_blank';aDir.rel='noopener';
    aDir.style.cssText='display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--surface2);border-radius:12px;text-decoration:none;color:var(--fg);font-size:14px;font-weight:600;border:1px solid var(--surface2)';
    aDir.innerHTML=`<span style="font-size:18px">📍</span><span>${esc(biz.address||'Get directions')}</span>`;
    aDir.onclick=()=>logBizEvent(biz.id,'directions_tap');
    actions.appendChild(aDir);
  }
  openOv('biz-modal');
  logBizEvent(biz.id,'pin_tap');
}

// Tap tracking → public.tap_events via log_tap() (server skips self-taps and repeats within 10 min). Never blocks the UI.
// p_filter = Find-a-helper category active when a helper is tapped (only sent when one is on).
// Agency jobs: tasks.type='agency_job' with tasks.url = the agency's apply link.
// get_open_jobs_near doesn't return type, so a job with a url is treated as an agency job.
const AGENCY_PIN='#2563EB'; // agency job bubbles (blue) — regular jobs stay red #EF4444
function openJobStack(g){
  const place=(g[0].address||'').split(',')[0].trim();
  document.getElementById('stack-title').textContent=`${g.length} jobs${place?' in '+place:' here'}`;
  document.getElementById('stack-list').innerHTML=g.map(j=>listCard(j,j.profiles)).join('');
  openOv('stack-modal');
}
// Helper stack: helpers sharing one spot (usually city-only addresses). Search matches first; own row on top.
function openHelperStack(g){
  const mine=myHelperPin&&g.find(h=>h.id===myHelperPin.id);
  const others=g.filter(h=>h!==mine).sort((a,b)=>(hsMatch(b)?1:0)-(hsMatch(a)?1:0));
  document.getElementById('stack-title').textContent=`${g.length} helpers in this area`;
  const vague=mine&&hpIsVagueText(mine.helper_address);
  const meRow=mine?`<div onclick="closeOv('stack-modal');${vague?"hpFocusAreaNext=true;nav('helper')":`openOtherProfile('${mine.id}')`}" style="background:rgba(92,138,106,.08);border-radius:var(--radius-sm);padding:12px 16px;border:1.5px solid #2E7D52;display:flex;align-items:center;gap:12px;cursor:pointer">
      ${avatarCircle(mine.name||'You',mine.avatar_color,'28px','12px')}
      <div style="flex:1;min-width:0;font-size:14px;font-weight:800">You're in this group${vague?'<div style="font-size:13px;font-weight:700;color:var(--muted)">Add your street so neighbours nearby can find you</div>':''}</div>
      <div style="font-size:13.5px;color:var(--purple);font-weight:800;flex-shrink:0">${vague?'Add street ›':'View ›'}</div>
    </div>`:'';
  document.getElementById('stack-list').innerHTML=meRow+others.map(helperCard).join('');
  openOv('stack-modal');
}
function isAgencyJob(j){return !!(j&&(j.type==='agency_job'||j.url));}
function agencyPay(j){return j.price!=null?`$${j.price}/hr`:'See posting';}
// Community jobs: tasks.type='community_job', posted by the hidden "Yoodle Community" account, imported from an employer's
// own careers site (jobs-ingest). Same blue pin as agency jobs (isAgencyJob → url); the card names the employer instead.
const COMMUNITY_POSTER_ID='3aa7ad98-895c-4d67-bd83-f467b755d8d4';
function isCommunityJob(j){return !!(j&&(j.type==='community_job'||j.poster_id===COMMUNITY_POSTER_ID));}
function communityCompany(j){const c=(((j&&j.description)||'').split('\n')[0].split(' · ')[0]||'').trim();return c&&c.length<=100?c:'the employer';}
