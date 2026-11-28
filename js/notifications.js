// Notifications bell (public.notifications).
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// ── NOTIFICATIONS BELL (15 Nov 2026) ── public.notifications (supabase/migrations/20261115_001_notifications.sql).
// Bell in the top bar with a red unread count; tap → #nt-sheet list (newest first, unread ones dotted).
// Tapping a notification marks it read (notification_dismiss) and opens its link in a new tab, if it has one.
// Links are only followed when they're https://yoodle.ca or a *.yoodle.ca subdomain (the table checks this too).
// 27 Nov 2026 (Rhea): each one leaves the bell 3 days after it arrived (deleted hourly by the database), 🗑 deletes it
// now, 📌 keeps it until unpinned; unpinning starts a fresh 3 days (clock_at). Migration 20261127_004.

let _notifs=[];
const NT_LINK_OK=/^https:\/\/([a-z0-9-]+\.)*yoodle\.ca(\/|$)/i;
const NT_KEEP_MS=3*24*60*60*1000; // 3 days from clock_at, unless pinned
const NT_EMOJI={shield:'🛡️','invite:tutor_profile':'📚',test:'🧪',announcement:'📣',friend_request:'👥'};
async function loadNotifications(){
  if(!sb||!me)return;
  try{
    const cutoff=new Date(Date.now()-NT_KEEP_MS).toISOString();
    const{data,error}=await sb.from('notifications').select('id,kind,title,body,link,link_label,created_at,read_at,pinned_at,clock_at')
      .eq('profile_id',me.id).or(`pinned_at.not.is.null,clock_at.gt.${cutoff}`) // past 3 days: hidden even before the hourly clean-up
      .order('created_at',{ascending:false}).limit(50);
    _notifs=error?[]:(data||[]); // table missing (migration not run) → empty bell
  }catch(e){_notifs=[];}
  renderNotifBadge();
  if(document.getElementById('nt-sheet')?.classList.contains('open'))renderNotifList();
}
function renderNotifBadge(){
  const b=document.getElementById('nt-badge');if(!b)return;
  const n=_notifs.filter(x=>!x.read_at).length;
  b.textContent=n>9?'9+':n;b.style.display=n?'block':'none';
  const btn=document.getElementById('nt-btn');if(btn)btn.setAttribute('aria-label',n?`Notifications, ${n} unread`:'Notifications');
  _setMessageBadge(_msgUnread); // redraw the Messages tab dot
}
function openNotifications(){renderNotifList();openOv('nt-sheet');loadNotifications();}
function renderNotifList(){
  const el=document.getElementById('nt-list');if(!el)return;
  document.getElementById('nt-markall').style.display=_notifs.some(x=>!x.read_at)?'':'none';
  if(!_notifs.length){el.innerHTML=emptyState('🔔','No notifications yet','Updates from Yoodle show up here.');return;}
  const list=[..._notifs].sort((a,b)=>(!!b.pinned_at-!!a.pinned_at)||(Date.parse(b.created_at)-Date.parse(a.created_at))); // pinned first
  el.innerHTML=list.map(n=>{
    const link=n.link&&NT_LINK_OK.test(n.link)?n.link:null;
    return `<div class="nt-row${n.read_at?'':' unread'}${n.pinned_at?' pinned':''}" data-id="${esc(n.id)}">
      <button class="nt-main" type="button" data-act="open"><span class="e" aria-hidden="true">${NT_EMOJI[n.kind]||'🔔'}</span>
      <span class="nt-txt"><b>${esc(n.title)}</b>${n.body?`<span>${esc(n.body)}</span>`:''}
        ${link?`<span class="nt-link">${esc(n.link_label||'Open')} ↗</span>`:''}<small>${timeAgo(n.created_at)} · ${ntLeft(n)}</small></span></button>
      <div class="nt-acts"><button class="nt-act${n.pinned_at?' on':''}" type="button" data-act="pin" aria-label="${n.pinned_at?'Unpin':'Pin: keep it past 3 days'}" aria-pressed="${!!n.pinned_at}">📌</button>
        <button class="nt-act" type="button" data-act="del" aria-label="Delete">🗑</button></div>
    </div>`;}).join('');
  el.querySelectorAll('.nt-row').forEach(r=>r.onclick=e=>{
    const a=e.target.closest('[data-act]')?.dataset.act,id=r.dataset.id;
    if(a==='pin')ntPin(id);else if(a==='del')ntDelete(id);else if(a==='open')openNotif(id);
  });
}
// "Pinned" / "Gone in 2 days" / "Gone in 5 h"
function ntLeft(n){
  if(n.pinned_at)return'📌 Pinned';
  const ms=Date.parse(n.clock_at||n.created_at)+NT_KEEP_MS-Date.now(),h=Math.max(1,Math.ceil(ms/36e5));
  return h>=48?`Gone in ${Math.round(h/24)} days`:h>=24?'Gone in 1 day':`Gone in ${h} h`;
}
function ntDelete(id){
  _notifs=_notifs.filter(x=>x.id!==id);renderNotifBadge();renderNotifList();
  fireRpc('notification_delete',{p_id:id});
}
// Pin: keep it. Unpin: a fresh 3 days, like a new notification.
function ntPin(id){
  const n=_notifs.find(x=>x.id===id);if(!n)return;
  const pin=!n.pinned_at,now=new Date().toISOString();
  if(pin)n.pinned_at=now;else{n.pinned_at=null;n.clock_at=now;}
  renderNotifList();toast(pin?'📌 Pinned: it stays until you unpin it':'Unpinned: it goes in 3 days');
  fireRpc('notification_pin',{p_id:id,p_pin:pin});
}
function openNotif(id){
  const n=_notifs.find(x=>x.id===id);if(!n)return;
  const link=n.link&&NT_LINK_OK.test(n.link)?n.link:null;
  if(link&&TUTOR_SITE_RE.test(link))openTutorSignedIn(null,link); // tutor invite: arrive signed in
  else if(link)window.open(link,'_blank','noopener'); // open first (same tap) so popup blockers allow it
  if(!n.read_at){n.read_at=new Date().toISOString();renderNotifBadge();renderNotifList();fireRpc('notification_dismiss',{p_id:id});}
}
function markAllNotifsRead(){
  _notifs.filter(x=>!x.read_at).forEach(n=>{n.read_at=new Date().toISOString();fireRpc('notification_dismiss',{p_id:n.id});});
  renderNotifBadge();renderNotifList();
}
// Coming back to the tab refreshes the count (no polling)
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&me)loadNotifications();});
