// Ready to work (Today / Tomorrow) and its email landings.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// ── READY TO WORK (Today / Tomorrow) ── which skills qualify is decided in SQL (table ready_to_work_categories), never here
// Backend: ready_to_work table + get_ready_ids() / get_my_ready_to_work() / set_ready_to_work(); kill switch feature_flags.ready_to_work.
// Server decides who is eligible and who shows; this code only mirrors it. Any RPC error = feature hidden (safe rollback).
let readyIds=new Map(); // profile id → {today,tomorrow}
let _rtwStatus=null;
async function loadReadyIds(){
  if(!sb||!me)return;
  try{
    const{data,error}=await sb.rpc('get_ready_ids');
    if(error)return;
    const m=new Map((data||[]).map(r=>[r.profile_id,{today:!!r.today,tomorrow:!!r.tomorrow}]));
    const changed=m.size!==readyIds.size||[...m].some(([k,v])=>{const o=readyIds.get(k);return !o||o.today!==v.today||o.tomorrow!==v.tomorrow;});
    readyIds=m;
    if(!changed)return;
    try{if(map&&(allHelpers||[]).length)renderMapPins();}catch(e){}
    try{if(_hsInList())renderListTabContent();}catch(e){} // keep ⚡ helpers on top of the List view (5 Nov 2026)
  }catch(e){}
}
function readyOf(id){const r=id&&readyIds.get(id);return r?(r.today?'today':(r.tomorrow?'tomorrow':null)):null;}
function rtwPulse(id){return readyOf(id)?'rtw-pulse':'';} // ⚡ ready today or tomorrow = same pulsing gold ring (Roman, 24 Oct: keep it simple)
function rtwBolt(id){return readyOf(id)?'<span class="rtw-in" title="Ready to work">⚡</span>':'';} // bolt INSIDE single/own helper pins (blue ID ✓ stays bottom-right)
function rtwChip(id,short){const r=readyOf(id);if(!r)return '';const both=readyIds.get(id);const lbl=short?'⚡':(both.today&&both.tomorrow?'⚡ Ready today & tomorrow':r==='today'?'⚡ Ready today':'⚡ Ready tomorrow');return `<span class="rtw-chip" title="Ready to work">${lbl}</span>`;}
const RTW_WHY={
  not_labour:{t:'Add a matching skill to your helper profile to use this.',b:'Edit helper profile',f:()=>nav('helper')},
  helper_off:{t:'Your helper profile needs to be active and on the map.',b:'Open helper profile',f:()=>nav('helper')},
  no_push:{t:'Turn on notifications — we send one reminder each evening so you stay listed.',b:'Turn on notifications',f:()=>requestNotifPermission()},
  suspended:{t:'Not available for this account.',b:null},
  paused:{t:'Ready to work is paused right now.',b:null}
};
async function renderRtwBlock(prof){
  const el=document.getElementById('rtw-block');if(!el)return;
  if(!prof?.visible_on_map){el.style.display='none';return;}
  let st=null;
  try{const{data,error}=await sb.rpc('get_my_ready_to_work');if(!error)st=data;}catch(e){}
  // server decides: no qualifying skill (not_labour) → no card
  if(!st||!st.enabled||st.eligible==='not_labour'){el.style.display='none';return;}
  _rtwStatus=st;
  const tmr=st.tomorrow_date?new Date(st.tomorrow_date+'T12:00:00').toLocaleDateString('en-CA',{weekday:'short',month:'short',day:'numeric'}):'';
  const line=st.today&&st.tomorrow?'Showing on the map today and tomorrow':st.today?'Showing on the map today':st.tomorrow?'Showing on the map for tomorrow':'Not showing — pick a day';
  el.innerHTML=`<div class="rtw-card">
    <div style="display:flex;align-items:center;gap:10px"><span class="rtw-bolt" style="position:static;width:24px;height:24px;font-size:13px;border:0">⚡</span>
      <div style="font-size:15px;font-weight:800;color:var(--text)">Ready to work</div></div>
    <div style="font-size:13.5px;font-weight:700;color:var(--muted);margin-top:4px;line-height:1.45">Show contractors and neighbours you're available to work.</div>
    <div class="rtw-seg">
      <button class="${st.today?'on':''}" onclick="rtwTap('today')">Today${st.today?' ✓':''}<small>until 11:59 pm</small></button>
      <button class="${st.tomorrow?'on':''}" onclick="rtwTap('tomorrow')">Tomorrow${st.tomorrow?' ✓':''}<small>${esc(tmr)}</small></button>
    </div>
    <div style="margin-top:10px;font-size:13px;font-weight:800;color:${st.today||st.tomorrow?'var(--lime)':'var(--muted)'}">● ${line}</div>
  </div>`;
  el.style.display='block';
}
function _rtwPushOk(){return !(isIos()&&!isInStandaloneMode())&&window.Notification?.permission==='granted';} // iPhone Safari tab can't get pushes even if a permission value exists
function _rtwIdvSkipped(){try{return Date.now()-(+localStorage.getItem('yoodle_rtw_idv_skip')||0)<7*864e5;}catch(e){return false;}}
async function rtwTap(day){
  const st=_rtwStatus;if(!st)return;
  if(st[day]){return rtwSet(day,false);} // turning off: no questions
  let why=st.eligible!=='ok'?st.eligible:(!_rtwPushOk()?'no_push':null);
  const myId=myProfileId||me?.id;
  if(!why&&(isIdVerified(myId)||_rtwIdvSkipped()))return rtwSet(day,true);
  rtwSheet(day,why);
}
function rtwSheet(day,why){
  if(why==='no_push')return rtwPushSheet(day);
  const _l=document.getElementById('rtw-later');if(_l)_l.style.display='none';
  const w=why&&RTW_WHY[why];
  document.getElementById('rtw-title').textContent=day==='today'?'Ready to work today':'Ready to work tomorrow';
  document.getElementById('rtw-why').innerHTML=w?`<div style="font-size:14px;font-weight:700;color:var(--text);line-height:1.5;margin-bottom:12px">${w.t}</div>`:'';
  document.getElementById('rtw-idv').style.display=(!w&&!isIdVerified(myProfileId||me?.id))?'block':'none';
  const go=document.getElementById('rtw-go');
  if(w){go.textContent=w.b||'OK';go.onclick=()=>{closeOv('rtw-modal');if(w.f)w.f();};}
  else{go.textContent=day==='today'?'Turn on for today':'Turn on for tomorrow';go.onclick=()=>{closeOv('rtw-modal');rtwSet(day,true);};}
  window._rtwDay=day;
  openOv('rtw-modal');
}
// ── Ready to work: notifications not ready (25 Oct 2026) — no dead ends ──
// ios = iPhone Safari tab (needs Home Screen) · blocked = denied · ask = never asked · granted = allowed but the server
// hasn't got the phone's push id yet · unsupported = browser has no notifications
function _rtwPushState(){
  if(isIos()&&!isInStandaloneMode())return 'ios';
  if(!('Notification' in window))return 'unsupported';
  const p=Notification.permission;
  return p==='denied'?'blocked':p==='granted'?'granted':'ask';
}
const RTW_PUSH={
  ask:{warn:'🔔 Turn on notifications to use this',p:'We send one reminder each evening so you stay listed.',btn:'Turn on notifications',act:'ask',later:true},
  blocked:{warn:'🔕 Notifications are blocked for yoodle.ca',p:'We send one reminder each evening so you stay listed. To allow them:',
    steps:['Tap the <b>🔒 lock</b> (or <b>ⓘ</b>) next to <b>yoodle.ca</b> in the address bar','Tap <b>Permissions</b> or <b>Site settings</b>','Set <b>Notifications</b> to <b>Allow</b>'],
    btn:"I've allowed them — turn on",act:'recheck',later:true},
  ios:{warn:'📲 On iPhone, add Yoodle to your Home Screen first',p:'iPhone only sends notifications to apps on the Home Screen. It takes 10 seconds:',
    steps:['Tap <b>Share</b> at the bottom of Safari','Tap <b>Add to Home Screen</b> → <b>Add</b>','Open <b>Yoodle</b> from your Home Screen and tap <b>Ready to work</b> again'],btn:'Got it',act:'close'},
  unsupported:{warn:"🔕 This browser can't show notifications",p:'Open yoodle.ca in Chrome or Safari to use Ready to work.',btn:'Got it',act:'close'}
};
function rtwPushSheet(day,note){
  const st=_rtwPushState();
  if(st==='granted'){closeOv('rtw-modal');return _rtwEnableAfterPush(day);} // allowed — just finish the set-up
  const c=RTW_PUSH[st];
  document.getElementById('rtw-title').textContent=day==='today'?'Ready to work today':'Ready to work tomorrow';
  document.getElementById('rtw-why').innerHTML=
    `<div style="background:rgba(245,184,46,.12);border:1px solid rgba(245,184,46,.4);color:var(--text);border-radius:12px;padding:10px 12px;font-weight:800;font-size:14.5px;margin-bottom:10px">${c.warn}</div>`
    +`<div style="font-size:14px;font-weight:700;color:var(--muted);line-height:1.5;margin-bottom:8px">${c.p}</div>`
    +(c.steps?`<ol style="margin:0 0 12px 20px;font-size:14px;font-weight:700;color:var(--text);line-height:1.6">${c.steps.map(x=>`<li>${x}</li>`).join('')}</ol>`:'')
    +(note?`<div style="font-size:13.5px;font-weight:800;color:#D97706;margin-bottom:10px">${note}</div>`:'');
  document.getElementById('rtw-idv').style.display='none';
  const l=document.getElementById('rtw-later');if(l)l.style.display=c.later?'block':'none';
  const go=document.getElementById('rtw-go');go.disabled=false;go.textContent=c.btn;
  go.onclick=()=>{
    if(c.act==='close')return closeOv('rtw-modal');
    if(c.act==='recheck'){
      if(_rtwPushState()==='granted'){closeOv('rtw-modal');_rtwEnableAfterPush(day);}
      else rtwPushSheet(day,'Still blocked — follow the steps above, then tap again.');
      return;
    }
    _rtwAskPush(day); // 'ask' — must run straight from the tap so the browser shows its prompt
  };
  window._rtwDay=day;
  openOv('rtw-modal');
}
function _rtwAskPush(day){
  const go=document.getElementById('rtw-go');go.disabled=true;go.textContent='Waiting for your answer…';
  let done=false;
  const finish=p=>{
    if(done)return;done=true;go.disabled=false;
    try{updateNotifNudge();}catch(e){}
    if(p==='granted'){closeOv('rtw-modal');_rtwEnableAfterPush(day);}
    else if(p==='denied')rtwPushSheet(day);              // they said Block → show how to undo it
    else rtwPushSheet(day,'No answer yet — tap again to see the question.');
  };
  try{
    if(window.OneSignalDeferred){window.OneSignalDeferred.push(async os=>{try{await os.Notifications.requestPermission();}catch(e){}finish(Notification.permission);});}
    else Notification.requestPermission().then(finish,()=>finish(Notification.permission));
  }catch(e){finish(Notification.permission);}
  // the prompt can be dismissed without the promise settling — check again after 20 s
  setTimeout(()=>finish(Notification.permission),20000);
}
// Allowed → make sure OneSignal saved this phone (profiles.onesignal_id), then turn the day on. The id can take a few
// seconds to reach the server, so try up to 4 times.
async function _rtwEnableAfterPush(day){
  toast('🔔 Notifications on — setting you up…');
  try{if(window.OneSignalDeferred)window.OneSignalDeferred.push(async os=>{try{await os.User.PushSubscription.optIn();}catch(e){}});}catch(e){}
  for(let i=0;i<4;i++){
    await new Promise(r=>setTimeout(r,i?2500:1200));
    try{registerOneSignal();}catch(e){}
    let res=null;try{res=await sb.rpc('set_ready_to_work',{p_day:day,p_on:true});}catch(e){}
    const data=res&&res.data;
    if(data&&data.ok){
      toast(day==='today'?'⚡ You\'re showing as ready today':'⚡ You\'re showing as ready tomorrow');
      _rtwStatus=data;
      try{const{data:prof}=await sb.from('profiles').select('helper_categories,visible_on_map').eq('id',myProfileId||me.id).maybeSingle();renderRtwBlock(prof);}catch(e){}
      loadReadyIds();return true;
    }
    if(data&&data.ok===false&&data.reason!=='no_push'){rtwSheet(day,data.reason);return false;}
  }
  toast("Almost there — tap Tomorrow again in a minute");
  return false;
}
function rtwIdvLater(){try{localStorage.setItem('yoodle_rtw_idv_skip',String(Date.now()));}catch(e){}closeOv('rtw-modal');rtwSet(window._rtwDay||'tomorrow',true);}
async function rtwSet(day,on){
  try{
    const{data,error}=await sb.rpc('set_ready_to_work',{p_day:day,p_on:on});
    if(error){toast('Could not update — try again');return;}
    if(data&&data.ok===false){const w=RTW_WHY[data.reason];if(w)rtwSheet(day,data.reason);else toast('Could not update — try again');return;}
    toast(on?(day==='today'?'⚡ You\'re showing as ready today':'⚡ You\'re showing as ready tomorrow'):'Turned off');
    _rtwStatus=data;
  }catch(e){toast('Could not update — try again');return;}
  try{const{data:prof}=await sb.from('profiles').select('helper_categories,visible_on_map').eq('id',myProfileId||me.id).maybeSingle();renderRtwBlock(prof);}catch(e){}
  loadReadyIds();
}
// Evening push "Ready to work tomorrow?" → ?ready=tomorrow → one tap = on (if eligible), else the Profile card explains why
// Expiry reminder email links (saved in DOMContentLoaded): edit the job (saving also keeps it up 14 more days) or post a new one.
async function handleEmailJobLanding(){
  if(!sb||!me)return;
  let d=null;
  try{d=JSON.parse(localStorage.getItem('yoodle_job_land')||'null');localStorage.removeItem('yoodle_job_land');}catch(e){}
  if(!d||Date.now()-(d.ts||0)>7*24*60*60*1000)return;
  // restoreGuestDraft() may already have opened the form with a draft — don't reset it
  if(d.p){if(!document.getElementById('app-postjob')?.classList.contains('active'))nav('postjob');return;}
  if(!d.e)return;
  const{data:j,error}=await sb.from('tasks').select('id,poster_id,status,type,expires_at').eq('id',d.e).maybeSingle();
  if(error||!j)return toast('This job is no longer available');
  if(j.poster_id!==(myProfileId||me.id))return showRenewNote('This job was posted from a different account — sign in with that one to edit it.');
  if((j.type||'job')!=='job'||(j.status!=='open'&&j.status!=='paused'&&j.status!=='expired'))return showRenewNote('This job is already closed. You can post a new one any time.');
  nav('myjobs');
  setTimeout(async()=>{
    await openEditModal(j.id);
    window._editRenew={id:j.id,exp:j.expires_at}; // saveEdit() also keeps it up 14 more days
  },600);
}

async function handleReadyLanding(){
  const d=window._readyLand;window._readyLand=null;
  if(d!=='today'&&d!=='tomorrow')return;
  nav('profile');
  try{
    const{data,error}=await sb.rpc('set_ready_to_work',{p_day:d,p_on:true});
    if(!error&&data&&data.ok)toast(d==='today'?'⚡ You\'re showing as ready today':'⚡ You\'re showing as ready tomorrow');
  }catch(e){}
  loadReadyIds();
}
