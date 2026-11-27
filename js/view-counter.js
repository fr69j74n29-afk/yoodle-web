// Views of my helper profile (eye badge in the top bar).
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// ── VIEW COUNTER (15 Nov 2026) ── my_view_stats(): all-time views (tap_events) of my helper profile + my posted jobs.
// One small call after sign-in; refreshed when Profile or Activity opens and when the app comes back after 15+ min.
let myViewStats=null,_viewStatsAt=0;
// Line icons (Feather style, same weight as the Filter magnifier). Eye = views; eye-off = profile hidden.
const EYE_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
// Yoodle Shield (26 Nov 2026): shield-check line icon, same weight as the eye.
const SHIELD_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>';
const EYE_OFF_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
async function loadViewStats(){
  if(!sb||!me)return null;
  const{data,error}=await sb.rpc('my_view_stats');
  if(error){console.warn('[log] my_view_stats: '+error.message);return null;}
  myViewStats=data||null;_viewStatsAt=Date.now();
  renderViewBadge();
  return myViewStats;
}
function renderViewBadge(){
  renderShieldBadge();
  const b=document.getElementById('vw-btn');if(!b)return;
  const h=myViewStats?.helper;
  b.classList.toggle('on',!!h);
  b.classList.toggle('off',!!h&&!h.active);
  if(h){document.getElementById('vw-n').textContent=h.views;document.getElementById('vw-ic').innerHTML=h.active?EYE_SVG:EYE_OFF_SVG;}
}
function openViewPanel(){
  const h=myViewStats?.helper;if(!h)return;
  const n=h.views,times=`<b>${n}</b> ${n===1?'time':'times'}`;
  let html=`<div class="vw-big">Your helper profile was viewed ${times}.</div>`;
  if(!h.active){
    html+=`<div class="vw-note">Your profile is hidden right now, so neighbours can't find you.</div>
      <button class="pf-btn" onclick="closeViewPanel();nav('helper')">Resume listing</button>`;
  }else{
    html+=`<div class="vw-note">${n<3?'New profiles get noticed faster when shared.':'Each view is a neighbour who opened your profile.'}</div>
      <button class="pf-btn" onclick="closeViewPanel();shareMyHelperPage(null)">Share my page</button>`;
  }
  document.getElementById('vw-ttl').innerHTML=(h.active?EYE_SVG:EYE_OFF_SVG)+'Your views';document.getElementById('vw-ttl').classList.remove('sh');
  document.querySelector('#vw-ov .hs-pop')?.setAttribute('aria-label','Your views');
  document.getElementById('vw-body').innerHTML=html;
  document.getElementById('vw-ov').classList.add('open');
}
// ── YOODLE SHIELD (26 Nov 2026) ── my_view_stats().shield = messages sent to me by members suspended right now.
// Those chats are already hidden from Messages by get_conversations; this badge just tells the member about it.
// Shown only when 1+. Hover (computer) = title tooltip; tap = small popup (reuses the views popup).
function _shieldText(n){return `${n} ${n===1?'message':'messages'} held by Yoodle Shield`;}
const SHIELD_NOTE='When Yoodle puts a member\'s account under review, their messages are held out of your mailbox for your protection.';
function renderShieldBadge(){
  const b=document.getElementById('sh-btn');if(!b)return;
  const n=+(myViewStats?.shield||0);
  b.classList.toggle('on',n>0);
  if(n>0){document.getElementById('sh-n').textContent=n;document.getElementById('sh-ic').innerHTML=SHIELD_SVG;b.title=_shieldText(n)+'. '+SHIELD_NOTE;b.setAttribute('aria-label',_shieldText(n));}
}
// fromLink=true: opened from a push/email link to a held chat (js/messages.js), shown even if the count isn't loaded yet.
function openShieldPanel(fromLink){
  const n=+(myViewStats?.shield||0);if(!n&&!fromLink)return;
  const t=document.getElementById('vw-ttl');t.innerHTML=SHIELD_SVG+'Yoodle Shield';t.classList.add('sh');
  document.getElementById('vw-body').innerHTML=(fromLink?`<div class="vw-big">This message is held by Yoodle Shield.</div>`:`<div class="vw-big"><b>${n}</b> ${n===1?'message':'messages'} held by Yoodle Shield.</div>`)+`<div class="vw-note">${SHIELD_NOTE}</div>`;
  document.querySelector('#vw-ov .hs-pop')?.setAttribute('aria-label','Yoodle Shield');
  document.getElementById('vw-ov').classList.add('open');
}
function closeViewPanel(){document.getElementById('vw-ov')?.classList.remove('open');}
