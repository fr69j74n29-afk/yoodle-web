// Notifications bell (public.notifications).
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// ── NOTIFICATIONS BELL (15 Nov 2026) ── public.notifications (supabase/migrations/20261115_001_notifications.sql).
// Bell in the top bar with a red unread count; tap → #nt-sheet list (newest first, unread ones dotted).
// Tapping a notification marks it read (notification_dismiss) and opens its link in a new tab, if it has one.
// Links are only followed when they're https://yoodle.ca or a *.yoodle.ca subdomain (the table checks this too).

let _notifs=[];
const NT_LINK_OK=/^https:\/\/([a-z0-9-]+\.)*yoodle\.ca(\/|$)/i;
const NT_EMOJI={'invite:tutor_profile':'📚',test:'🧪',announcement:'📣',friend_request:'👥'};
async function loadNotifications(){
  if(!sb||!me)return;
  try{
    const{data,error}=await sb.from('notifications').select('id,kind,title,body,link,link_label,created_at,read_at')
      .eq('profile_id',me.id).order('created_at',{ascending:false}).limit(50);
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
  el.innerHTML=_notifs.map(n=>{
    const link=n.link&&NT_LINK_OK.test(n.link)?n.link:null;
    return `<button class="nt-row${n.read_at?'':' unread'}" data-id="${esc(n.id)}">
      <span class="e" aria-hidden="true">${NT_EMOJI[n.kind]||'🔔'}</span>
      <span class="nt-txt"><b>${esc(n.title)}</b>${n.body?`<span>${esc(n.body)}</span>`:''}
        ${link?`<span class="nt-link">${esc(n.link_label||'Open')} ↗</span>`:''}<small>${timeAgo(n.created_at)}</small></span>
    </button>`;}).join('');
  el.querySelectorAll('.nt-row').forEach(r=>r.onclick=()=>openNotif(r.dataset.id));
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
