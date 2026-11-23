// ══ YOODI LIVE (23 Nov 2026) ══
// Yoodi, Yoodle's assistant, floats on the map. Members tap her to chat; the Ryzen Halo box answers
// (yoodle-halo repo, yoodi.py) and her reply arrives as a normal chat message, with the usual push.
// Concept and decisions: yoodle-docs app/2026-11-22-yoodi-live-concept.md and app/2026-11-23-yoodi-step6-staging.md.
//
// How it fits in (Roman, 23 Nov 2026):
//  * Her chat opens in the EXISTING chat screen (#chat-modal), not a new sheet: unread badge, realtime, push
//    and emails already work. This file only changes how that screen looks and sends for a Yoodi chat.
//  * Messages go through public.yoodi_ask() (signed-in members, 30/hour, 1000 characters; it creates the
//    member's Yoodi chat on the first message). Supabase also enforces the same limits on direct inserts.
//  * The reply box stays open while she works. "Yoodi is thinking…" is shown by the app, not stored.
//  * Halo offline: Yoodi is grey but still tappable; messages wait and are answered when Halo is back.
//  * Drafts: her links https://yoodle.ca/?yoodi_draft=<id> fill in Post a Job or the helper bio. The member
//    picks the address and posts (or saves) themselves. Yoodi never posts. Drafts are single use, 24 h.
//  * Shortcuts: "Ask Yoodi" under Budget on Post a Job, and "Tune up my bio" on the helper profile.
// Loaded as a classic deferred script (NOT a module): index.html calls these by name through guarded hooks
// (if(window.yoodiX)…), and this file reads index.html globals (sb, me, myProfileId, activeChat*, esc,
// linkify, toast, nav, openOv, loadChatMessages, ysSetPostCat, ysKey) at call time.
// If this file fails to load, the app works exactly as before, just without Yoodi.

var YOODI_ID='149e5443-528f-4106-871b-890d7fe1f93b';
var YOODI={active:false,online:null,chips:false,checkedAt:0,lastMsgs:[],waitTimer:null,pollTimer:null,
  TIP_KEY:'yoodi_tip_seen_v1',DRAFT_KEY:'yoodi_draft_land',BIO_KEY:'yoodi_bio_pending',
  THINK_S:90};          // after this long without a reply, the "thinking" bubble says it's taking longer
// Links in Yoodi's replies that become buttons: her drafts, and helper / Pro profiles (?helper=<id>[&s=pro])
var YOODI_LINK_RE=/https:\/\/yoodle\.ca\/\?(?:yoodi_draft=([0-9a-f-]{36})|helper=([0-9a-f-]{36})(&s=pro)?)/gi;

(function(){ // styles live here so index.html stays untouched
  var css=`
#yoodi-fab{position:absolute;right:12px;bottom:76px;z-index:11;width:60px;height:60px;border-radius:50%;border:2.5px solid #2E7D52;
  background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;
  transition:transform .15s,filter .3s}
#yoodi-fab:active{transform:scale(.94)}
#yoodi-fab img{width:44px;height:auto;display:block;pointer-events:none}
#yoodi-fab .yd-dot{position:absolute;top:1px;right:1px;width:14px;height:14px;border-radius:50%;background:#22C55E;border:2.5px solid #fff}
#yoodi-fab.off{filter:grayscale(1);opacity:.8;border-color:#9CA3AF}
#yoodi-fab.off .yd-dot{background:#9CA3AF}
#yoodi-tip{position:absolute;right:80px;bottom:84px;z-index:11;max-width:220px;background:var(--surface);color:var(--text);
  border:1.5px solid var(--border);border-radius:16px 16px 4px 16px;padding:12px 30px 12px 14px;box-shadow:0 6px 18px rgba(0,0,0,.18);
  font-family:'Nunito',sans-serif;font-size:14px;font-weight:600;line-height:1.35;cursor:pointer}
#yoodi-tip b{display:block;font-size:15.5px;font-weight:800;margin-bottom:2px}
#yoodi-tip .x{position:absolute;top:6px;right:8px;border:none;background:none;color:var(--muted);font-size:17px;cursor:pointer;padding:2px 4px}
#chat-modal.yoodi-chat #chat-more-wrap,#chat-modal.yoodi-chat #chat-actions{display:none!important}
#chat-modal.yoodi-chat #chat-av{background:#fff!important;border:2px solid #2E7D52!important;overflow:hidden;cursor:default;width:38px!important;height:38px!important}
#chat-modal.yoodi-chat #chat-av img{width:28px;height:auto}
#chat-modal.yoodi-chat #chat-other{cursor:default}
#chat-modal .yd-foot{display:none}
#chat-modal.yoodi-chat .yd-foot{display:block;padding:0 16px 12px;font-size:12px;color:var(--muted);font-weight:700;text-align:center;background:var(--surface);flex-shrink:0}
.yd-status{display:inline-flex;align-items:center;gap:5px}
.yd-status i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#22C55E}
.yd-status.off i{background:#9CA3AF}
.yd-b{white-space:pre-wrap;word-wrap:break-word}
.yd-draft{display:block;margin:8px 0 2px;padding:10px 14px;border-radius:12px;border:none;width:100%;
  background:linear-gradient(135deg,var(--btn-a),var(--btn-b));color:#fff;font-family:'Nunito',sans-serif;font-size:14.5px;font-weight:800;cursor:pointer;text-align:center}
.yd-prof{display:inline-block;margin:6px 0 4px;padding:7px 12px;border-radius:100px;border:1.5px solid var(--lime);
  background:transparent;color:var(--lime);font-family:'Nunito',sans-serif;font-size:13.5px;font-weight:800;cursor:pointer}
.yd-chips{display:flex;flex-wrap:wrap;gap:8px;margin:-2px 0 14px}
.yd-chips button{padding:8px 14px;border-radius:100px;border:1.5px solid var(--border);background:transparent;color:var(--lime);
  font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer}
.yd-think{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:18px 18px 18px 4px;background:var(--surface2);
  color:var(--muted);font-size:13.5px;font-weight:700;margin-bottom:10px}
.yd-think span{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--lime);opacity:.35;animation:ydPulse 1.2s infinite}
.yd-think span:nth-child(2){animation-delay:.2s}.yd-think span:nth-child(3){animation-delay:.4s}
@keyframes ydPulse{0%,100%{opacity:.25}50%{opacity:1}}
.yd-ask{display:inline-block;margin-top:8px;padding:0;border:none;background:none;color:var(--lime);font-family:'Nunito',sans-serif;
  font-size:14px;font-weight:800;cursor:pointer;text-align:left}
`;
  var st=document.createElement('style');st.id='yoodi-css';st.textContent=css;document.head.appendChild(st);
})();

// ---------- tiny helpers ----------
function _ydPid(){return (typeof myProfileId!=='undefined'&&myProfileId)||(typeof me!=='undefined'&&me&&me.id)||null;}
function _ydReady(){return typeof sb!=='undefined'&&sb&&typeof me!=='undefined'&&me;}
function _ydGet(k){try{return JSON.parse(localStorage.getItem(k)||'null');}catch(e){return null;}}
function _ydSet(k,v){try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v));}catch(e){}}

// Is this chat a Yoodi chat? (index.html openChat / loadMessages)
function yoodiOwnsChat(posterId,otherId){return posterId===YOODI_ID||otherId===YOODI_ID;}

// ---------- online / offline ----------
async function yoodiCheckOnline(force){
  if(!_ydReady())return YOODI.online;
  if(!force&&Date.now()-YOODI.checkedAt<60000)return YOODI.online;
  YOODI.checkedAt=Date.now();
  try{const{data,error}=await sb.rpc('yoodi_online');if(!error)YOODI.online=data===true;}catch(e){}
  _ydPaintOnline();
  return YOODI.online;
}
function _ydPaintOnline(){
  var on=YOODI.online!==false;   // unknown → shown as online (no grey flash at start)
  var fab=document.getElementById('yoodi-fab');if(fab)fab.classList.toggle('off',!on);
  if(YOODI.active){
    var o=document.getElementById('chat-other');
    if(o)o.innerHTML=`<span>Yoodle's assistant · <span class="yd-status${on?'':' off'}"><i></i>${on?'online':'resting'}</span></span>`;
  }
}

// ---------- floating Yoodi + first-time tip ----------
function _ydMountFab(){
  if(document.getElementById('yoodi-fab'))return;
  var host=document.querySelector('#app-map > div');if(!host)return;
  host.insertAdjacentHTML('beforeend',
    `<button id="yoodi-fab" onclick="yoodiFabTap()" aria-label="Chat with Yoodi, Yoodle's assistant"><img src="yoodi.png?v=20261123" alt=""><span class="yd-dot"></span></button>`);
  if(!_ydGet(YOODI.TIP_KEY))setTimeout(_ydShowTip,4000);
}
function _ydShowTip(){
  if(_ydGet(YOODI.TIP_KEY)||document.getElementById('yoodi-tip'))return;
  var host=document.querySelector('#app-map > div');if(!host)return;
  host.insertAdjacentHTML('beforeend',
    `<div id="yoodi-tip" onclick="yoodiFabTap()"><b>Need a hand? 👋</b>Post a job, check a price or polish your bio.`+
    `<button class="x" onclick="event.stopPropagation();yoodiHideTip()" aria-label="Close">✕</button></div>`);
}
function yoodiHideTip(){_ydSet(YOODI.TIP_KEY,1);var t=document.getElementById('yoodi-tip');if(t)t.remove();}
function yoodiFabTap(){yoodiHideTip();yoodiOpen();}

// ---------- open the chat ----------
// opts.text: put this in the reply box (member reviews and sends).
async function yoodiOpen(opts){
  opts=opts||{};
  if(!_ydReady()){if(typeof toast==='function')toast('Sign in to chat with Yoodi');return;}
  var pid=_ydPid(),conv=null;
  try{
    var r=await sb.from('conversations').select('id,task_id').eq('poster_id',YOODI_ID).eq('applicant_id',pid)
      .eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle();
    conv=r.data||null;
  }catch(e){}
  await yoodiOpenChat(conv&&conv.id,conv&&conv.task_id,opts);
}

// Also called by index.html openChat() for a Yoodi chat (Messages list, push tap).
async function yoodiOpenChat(convId,taskId,opts){
  opts=opts||{};
  YOODI.active=true;YOODI.chips=!opts.text;   // quick buttons on every visit, until they type
  activeChatTaskId=taskId||null;activeChatPosterId=YOODI_ID;activeChatDoerId=YOODI_ID;
  activeChatConvId=convId||null;activeChatOtherName='Yoodi';activeChatSafetyTip=false;
  var modal=document.getElementById('chat-modal');modal.classList.add('yoodi-chat');
  if(!modal.querySelector('.yd-foot'))
    modal.querySelector('.modal-sheet').insertAdjacentHTML('beforeend',
      `<div class="yd-foot">Yoodi is an AI helper and can make mistakes. Nothing is posted until you tap Post.</div>`);
  document.getElementById('chat-title').textContent='Yoodi';
  document.getElementById('chat-av').innerHTML='<img src="yoodi.png?v=20261123" alt="">';
  document.getElementById('chat-actions').style.display='none';
  var inp=document.getElementById('chat-input');inp.placeholder='Message Yoodi…';inp.maxLength=1000;
  if(!inp._ydTyping){inp._ydTyping=true;inp.addEventListener('input',function(){   // chat started: hide the quick buttons
    if(YOODI.active&&YOODI.chips&&inp.value.trim()){YOODI.chips=false;var c=document.querySelector('#chat-messages .yd-chips-end');if(c)c.remove();}});}
  if(opts.text)inp.value=opts.text;
  _ydPaintOnline();
  openOv('chat-modal');
  document.getElementById('chat-input-bar').style.display='flex';
  if(activeChatConvId){
    try{await sb.rpc('mark_conversation_read',{p_conversation_id:activeChatConvId,p_user_id:_ydPid()});
        if(typeof refreshUnreadCount==='function')refreshUnreadCount();}catch(e){}
    loadChatMessages();
  }else{
    document.getElementById('chat-messages').innerHTML='';
    yoodiAfterRender([]);
  }
  yoodiCheckOnline(true).then(function(){if(YOODI.active)yoodiAfterRender(YOODI.lastMsgs);});
  if(opts.text){setTimeout(function(){try{inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length);}catch(e){}},350);}
}

// index.html closeChat()
function yoodiOnClose(){
  if(!YOODI.active)return;
  YOODI.active=false;clearTimeout(YOODI.waitTimer);
  var modal=document.getElementById('chat-modal');modal.classList.remove('yoodi-chat');
  var inp=document.getElementById('chat-input');if(inp){inp.placeholder='Type a message…';inp.removeAttribute('maxlength');}
}

// ---------- messages ----------
function _ydIntroHtml(withChips){
  var intro=`<div style="display:flex;justify-content:flex-start;margin-bottom:10px"><div class="yd-b" style="max-width:80%;padding:10px 14px;border-radius:18px 18px 18px 4px;background:var(--surface2);color:var(--text);font-size:14px;font-weight:600;line-height:1.4">Hi! I'm Yoodi. I can turn a few words into a job post, check if a price is fair, or polish your helper profile.</div></div>`;
  return withChips?intro+_ydChipsHtml():intro;
}
function _ydChipsHtml(){
  return `<div class="yd-chips">`+
    `<button onclick="yoodiChip('I need help with ')">Post a job</button>`+
    `<button onclick="yoodiChip('Is $ fair for ')">Is my price fair?</button>`+
    `<button onclick="yoodiChip('Can you help me tune up my helper bio? I do ')">Tune up my bio</button>`+
    `<button onclick="yoodiChip('Is Yoodle free?',true)">Is Yoodle free?</button></div>`;
}
function yoodiChip(text,send){
  YOODI.chips=false;var c=document.querySelector('#chat-messages .yd-chips-end');if(c)c.remove();
  var inp=document.getElementById('chat-input');inp.value=text;
  if(send){yoodiSend();return;}
  inp.focus();try{inp.setSelectionRange(text.length,text.length);}catch(e){}
}

// index.html loadChatMessages(): one message bubble. Returns HTML, or null to use the normal bubble.
function yoodiMsgHtml(m,isMe){
  if(!YOODI.active)return null;
  var body=String(m.body||''),html='',last=0,match;
  var isBio=/bio/i.test(body.slice(0,60));
  YOODI_LINK_RE.lastIndex=0;
  while((match=YOODI_LINK_RE.exec(body))){
    html+=linkify(esc(body.slice(last,match.index)));
    if(match[1])html+=`<button class="yd-draft" onclick="yoodiTakeDraft('${match[1]}')">${isBio?'✨ Open my bio draft':'📝 Open my job, filled in'}</button>`;
    else html+=`<button class="yd-prof" onclick="yoodiOpenProfile('${match[2]}',${match[3]?'true':'false'})">${match[3]?'View Pro profile':'View profile &amp; message'} ›</button>`;
    last=match.index+match[0].length;
  }
  html+=linkify(esc(body.slice(last)));
  return `<div style="display:flex;justify-content:${isMe?'flex-end':'flex-start'};margin-bottom:10px"><div class="yd-b" style="max-width:80%;padding:10px 14px;border-radius:${isMe?'18px 18px 4px 18px':'18px 18px 18px 4px'};background:${isMe?'var(--btn-a)':'var(--surface2)'};color:${isMe?'#fff':'var(--text)'};font-size:14px;font-weight:600;line-height:1.4">${html.trim()}<div style="font-size:11.5px;opacity:.6;margin-top:4px;text-align:right">${timeAgo(m.created_at)}</div></div></div>`;
}

// index.html loadChatMessages(), after drawing: intro on top, "thinking" / "resting" at the bottom.
function yoodiAfterRender(data){
  if(!YOODI.active)return;
  data=data||[];YOODI.lastMsgs=data;
  var el=document.getElementById('chat-messages');if(!el)return;
  if(!el.querySelector('.yd-intro')){
    var w=document.createElement('div');w.className='yd-intro';w.innerHTML=_ydIntroHtml(false);
    el.insertBefore(w,el.firstChild);
  }
  var old=el.querySelector('.yd-wait');if(old)old.remove();
  var oc=el.querySelector('.yd-chips-end');if(oc)oc.remove();
  clearTimeout(YOODI.waitTimer);
  var last=data[data.length-1];
  if(last&&last.sender_id!==YOODI_ID){
    var age=(Date.now()-new Date(last.created_at).getTime())/1000;
    var html;
    if(YOODI.online===false){
      html=`<div class="yd-think">💤 Yoodi is resting. Your message is saved and she'll reply here when she's back.</div>`+
        `<div class="yd-chips"><button onclick="closeChat();nav('postjob')">Post a job myself</button><button onclick="closeChat();nav('browse')">Browse helpers</button></div>`;
    }else if(age<YOODI.THINK_S){
      html=`<div class="yd-think"><span></span><span></span><span></span> Yoodi is thinking · a few seconds</div>`;
      YOODI.waitTimer=setTimeout(function(){if(YOODI.active)yoodiCheckOnline(true).then(function(){yoodiAfterRender(YOODI.lastMsgs);});},(YOODI.THINK_S-age)*1000+500);
    }else{
      html=`<div class="yd-think">⏳ This is taking longer than usual. Yoodi will reply here, and you'll get a notification.</div>`;
    }
    el.insertAdjacentHTML('beforeend',`<div class="yd-wait">${html}</div>`);
  }else if(YOODI.chips){
    el.insertAdjacentHTML('beforeend',`<div class="yd-chips-end">${_ydChipsHtml()}</div>`);
  }
  el.scrollTop=el.scrollHeight;
}

// index.html sendMessage(): returns true when it handled the send (Yoodi chat).
function yoodiSendHook(){if(!YOODI.active)return false;yoodiSend();return true;}
async function yoodiSend(){
  var inp=document.getElementById('chat-input');
  var text=(inp.value||'').trim();if(!text||!_ydReady())return;
  if(text.length>1000)return toast('Please keep it under 1000 characters');
  inp.value='';YOODI.chips=false;
  var r;
  try{r=await sb.rpc('yoodi_ask',{p_body:text});}catch(e){r={error:e};}
  if(r.error){inp.value=text;toast('❌ '+(r.error.message||'Could not send'));return;}
  var d=r.data||{};
  activeChatConvId=d.conversation_id||activeChatConvId;activeChatTaskId=d.task_id||activeChatTaskId;
  YOODI.online=d.online===true;YOODI.checkedAt=Date.now();_ydPaintOnline();
  await loadChatMessages(true);
  if(typeof maybeAskPushAfterSend==='function')maybeAskPushAfterSend();
}

// Helper / Pro intro → their profile, over the chat (openOtherProfile brings the chat back on close)
function yoodiOpenProfile(id,pro){if(typeof openOtherProfile==='function')openOtherProfile(id,pro?'pro':undefined);}

// ---------- drafts (?yoodi_draft=<id>) ----------
(function(){ // read the link before sign-in (Google sign-in reloads the page), like ?edit= / ?helper=
  try{
    var p=new URLSearchParams(location.search),id=p.get('yoodi_draft');
    if(id&&/^[0-9a-f-]{36}$/i.test(id)){
      _ydSet(YOODI.DRAFT_KEY,{id:id,ts:Date.now()});
      p.delete('yoodi_draft');
      history.replaceState(null,'',location.pathname+(p.toString()?'?'+p:'')+location.hash);
    }
  }catch(e){}
})();

async function yoodiTakeDraft(id){
  if(!_ydReady())return;
  var r;
  try{r=await sb.rpc('yoodi_take_draft',{p_id:id});}catch(e){r={error:e};}
  if(r.error){toast(/expired|already/i.test(r.error.message||'')?'⏳ This draft has expired or was already used. Ask Yoodi for a new one.':'❌ '+(r.error.message||'Could not open the draft'));return;}
  var d=r.data||{},p=d.payload||{};
  if(d.kind==='job'){
    if(document.getElementById('chat-modal').classList.contains('open'))closeChat();
    nav('postjob');   // resetPost() runs inside nav, so fill the fields after it (like restoreGuestDraft)
    document.getElementById('p-title').value=p.title||'';
    document.getElementById('p-desc').value=p.description||'';
    document.getElementById('p-budget').value=p.budget||'';
    if(p.category&&typeof ysSetPostCat==='function'&&typeof ysKey==='function')ysSetPostCat(ysKey(p.category));
    toast('📝 Yoodi filled this in. Check it, add your location and tap Post Job');
  }else if(d.kind==='bio'){
    _ydSet(YOODI.BIO_KEY,{text:p.text||'',ts:Date.now()});
    if(document.getElementById('chat-modal').classList.contains('open'))closeChat();
    nav('helper');    // openHelperScreen() loads the saved profile, then calls yoodiAfterHelperLoad()
  }
}

// index.html openHelperScreen(), after the saved profile is filled in
function yoodiAfterHelperLoad(){
  var b=_ydGet(YOODI.BIO_KEY);if(!b)return;
  _ydSet(YOODI.BIO_KEY,null);
  if(!b.text||Date.now()-(b.ts||0)>60*60*1000)return;
  var ta=document.getElementById('hp-bio');if(!ta)return;
  ta.value=b.text;ta.dispatchEvent(new Event('input',{bubbles:true}));
  setTimeout(function(){ta.scrollIntoView({behavior:'smooth',block:'center'});},300);
  toast('✨ Yoodi wrote this bio draft. Change anything you like, then save');
}

// ---------- shortcuts ----------
function _ydMountShortcuts(){
  var bud=document.getElementById('p-budget');
  if(bud&&!document.getElementById('yd-ask-price'))
    bud.insertAdjacentHTML('afterend',`<button type="button" class="yd-ask" id="yd-ask-price" onclick="yoodiAskPrice()">💬 Not sure what to offer? Ask Yoodi</button>`);
  var bio=document.getElementById('hp-bio');
  if(bio&&!document.getElementById('yd-ask-bio'))
    bio.insertAdjacentHTML('afterend',`<button type="button" class="yd-ask" id="yd-ask-bio" onclick="yoodiAskBio()">✨ Tune up my bio with Yoodi</button>`);
}
function yoodiAskPrice(){
  var t=(document.getElementById('p-title').value||'').trim(),d=(document.getElementById('p-desc').value||'').trim();
  var b=(document.getElementById('p-budget').value||'').trim();
  var job=(t+(d?'. '+d:'')).slice(0,800);
  var text=job?(b?`Is $${b} fair for this job? ${job}`:`What should I offer for this job? ${job}`):'What should I offer for ';
  yoodiOpen({text:text});
}
function yoodiAskBio(){yoodiOpen({text:'Can you help me tune up my helper bio? I do '});}

// ---------- start ----------
// index.html showApp(), once signed in
async function yoodiInit(){
  _ydMountFab();_ydMountShortcuts();
  yoodiCheckOnline(true);
  if(!YOODI.pollTimer)YOODI.pollTimer=setInterval(function(){
    if(document.visibilityState==='visible'&&document.getElementById('app-map')?.classList.contains('active'))yoodiCheckOnline();
  },5*60*1000);
  var dl=_ydGet(YOODI.DRAFT_KEY);
  if(dl){_ydSet(YOODI.DRAFT_KEY,null);if(Date.now()-(dl.ts||0)<24*60*60*1000)yoodiTakeDraft(dl.id);}
}
