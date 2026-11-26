// Contact support chat: a member's own "Yoodle support" thread with the Yoodle team (26 Nov 2026).
// Plan and decisions: project library claude/yoodle_app_support_chat_2026-11.md.
//
// How it fits in (Roman, 26 Nov 2026):
//  * Opened from Yoodi's "Contact support" quick button (js/yoodi.js). It's a separate chat, not Yoodi's.
//  * It opens in the EXISTING chat screen (#chat-modal), like Yoodi: Messages list, unread badge, realtime and
//    push already work. This file only changes how that screen looks and sends for a support chat.
//  * Messages go through public.support_send() (signed-in members, 20/hour, 2000 characters; it creates the
//    member's support chat on the first message). Thread = tasks row type 'support_chat', title 'Yoodle support',
//    poster = the support@yoodle.ca account (shown as "Yoodle support"), doer = member.
//  * No emails either way (trigger trg_stamp_quiet_thread_no_email). The team's replies push, but not while the
//    member is in the chat.
//  * Swipe-left "Clear" (js/swipe-actions.js) starts fresh, like Yoodi; old messages stay for admin.
//  * Admin reads and replies in admin.html → CONTACT SUPPORT.
//  * Avatar: white chat bubble with a question mark on an orange circle (Roman picked option B, 26 Nov).
//    Icon: Tabler "message-question" (MIT licence, (c) Paweł Kuna).
// Loaded as a classic deferred script (NOT a module). index.html / js files call it through guarded hooks
// (if(window.supportX)…). If this file fails to load, the app works as before, without Contact support.

var SUPPORT_TEAM_ID='7b9f8ba7-da35-4b75-9619-4c44879a900a';   // public.support_team_id() = support@yoodle.ca (26 Nov 2026)
var SUPPORT_TITLE='Yoodle support';                             // tasks.title set by support_send / admin_support_reply
var SUPPORT={active:false,MAX:2000};
var SUPPORT_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 9h8"/><path d="M8 13h6"/><path d="M14 18h-1l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v4.5"/><path d="M19 22v.01"/><path d="M19 19a2.003 2.003 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483"/></svg>';

(function(){ // styles live here so index.html stays untouched
  var css=`
.sp-av{width:28px;height:28px;border-radius:50%;background:var(--orange);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sp-av svg{width:17px;height:17px}
#chat-modal.support-chat #chat-more-wrap,#chat-modal.support-chat #chat-actions{display:none!important}
#chat-modal.support-chat #chat-av{background:var(--orange)!important;cursor:default}
#chat-modal.support-chat #chat-av svg{width:19px;height:19px}
#chat-modal.support-chat #chat-other{cursor:default}
.sp-intro{display:flex;justify-content:flex-start;margin-bottom:10px}
.sp-intro>div{max-width:80%;padding:10px 14px;border-radius:18px 18px 18px 4px;background:var(--surface2);color:var(--text);font-size:14px;font-weight:600;line-height:1.4}
`;
  var s=document.createElement('style');s.textContent=css;document.head.appendChild(s);
})();

function _spPid(){return (typeof myProfileId!=='undefined'&&myProfileId)||(typeof me!=='undefined'&&me&&me.id)||null;}
function _spReady(){return typeof sb!=='undefined'&&sb&&typeof me!=='undefined'&&me;}

// Messages list avatar (js/messages.js)
function supportAvatar(){return '<div class="sp-av">'+SUPPORT_ICON+'</div>';}

// Is this the member's support chat? The Yoodle team account itself sees it as a normal chat.
function supportOwnsChat(posterId,otherId,title){
  return posterId===SUPPORT_TEAM_ID&&title===SUPPORT_TITLE&&_spPid()!==SUPPORT_TEAM_ID;
}

// ---------- open ----------
// From Yoodi's "Contact support" button: the member's open support chat, or a blank one.
async function supportOpen(){
  if(!_spReady()){if(typeof toast==='function')toast('Sign in to contact support');return;}
  var t=null;
  try{var r=await sb.rpc('support_my_thread');if(!r.error)t=r.data||null;}catch(e){}
  await supportOpenChat(t&&t.conversation_id,t&&t.task_id);
}

// Also called by js/chat.js openChat() for a support chat (Messages list, push tap).
async function supportOpenChat(convId,taskId){
  if(window.yoodiOnClose)yoodiOnClose();   // coming from Yoodi's chat
  SUPPORT.active=true;
  activeChatTaskId=taskId||null;activeChatPosterId=SUPPORT_TEAM_ID;activeChatDoerId=null;   // null: header doesn't open a profile
  activeChatConvId=convId||null;activeChatOtherName=SUPPORT_TITLE;activeChatSafetyTip=false;
  var modal=document.getElementById('chat-modal');modal.classList.add('support-chat');
  document.getElementById('chat-title').textContent=SUPPORT_TITLE;
  document.getElementById('chat-av').innerHTML=SUPPORT_ICON;
  document.getElementById('chat-other').textContent='The Yoodle team replies here';
  var acts=document.getElementById('chat-actions');acts.innerHTML='';acts.style.display='none';
  var inp=document.getElementById('chat-input');inp.placeholder='Message Yoodle support…';inp.maxLength=SUPPORT.MAX;
  openOv('chat-modal');
  document.getElementById('chat-input-bar').style.display='flex';
  if(activeChatConvId){
    try{await sb.rpc('mark_conversation_read',{p_conversation_id:activeChatConvId,p_user_id:_spPid()});
        if(typeof refreshUnreadCount==='function')refreshUnreadCount();}catch(e){}
    loadChatMessages();
  }else{
    document.getElementById('chat-messages').innerHTML='';
    supportAfterRender([]);
  }
  setTimeout(function(){try{inp.focus();}catch(e){}},350);
}

// js/messages.js closeChat(), js/chat.js openChat() for any other chat, js/yoodi.js when Yoodi opens
function supportOnClose(){
  if(!SUPPORT.active)return;
  SUPPORT.active=false;
  var modal=document.getElementById('chat-modal');modal.classList.remove('support-chat');
  var inp=document.getElementById('chat-input');if(inp){inp.placeholder='Type a message…';inp.removeAttribute('maxlength');}
}

// ---------- messages ----------
// js/chat.js loadChatMessages(): one bubble. Always a normal bubble here, so a team reply that starts with
// "Thanks for…" isn't drawn as a grey system line. Returns null outside a support chat.
function supportMsgHtml(m,isMe){
  if(!SUPPORT.active)return null;
  return `<div data-mid="${esc(m.id)}" data-me="${isMe?1:0}" style="display:flex;justify-content:${isMe?'flex-end':'flex-start'};margin-bottom:10px"><div style="max-width:75%;padding:10px 14px;border-radius:${isMe?'18px 18px 4px 18px':'18px 18px 18px 4px'};background:${isMe?'var(--btn-a)':'var(--surface2)'};color:${isMe?'#fff':'var(--text)'};font-size:14px;font-weight:600;line-height:1.4">${linkify(esc(m.body||''))}<div style="font-size:11.5px;opacity:.6;margin-top:4px;text-align:right">${timeAgo(m.created_at)}</div></div></div>`;
}

// js/chat.js loadChatMessages(), after drawing: intro bubble on top (shown by the app, not stored).
function supportAfterRender(data){
  if(!SUPPORT.active)return;
  var el=document.getElementById('chat-messages');if(!el)return;
  if(!el.querySelector('.sp-intro')){
    var w=document.createElement('div');w.className='sp-intro';
    w.innerHTML='<div>Tell us what\'s not working, or ask us anything about Yoodle. The Yoodle team replies here.</div>';
    el.insertBefore(w,el.firstChild);
  }
  el.scrollTop=el.scrollHeight;
}

// js/chat.js sendMessage(): returns true when it handled the send (support chat).
function supportSendHook(){if(!SUPPORT.active)return false;supportSend();return true;}
async function supportSend(){
  var inp=document.getElementById('chat-input');
  var text=(inp.value||'').trim();if(!text||!_spReady())return;
  if(text.length>SUPPORT.MAX)return toast('Please keep it under '+SUPPORT.MAX+' characters');
  inp.value='';
  var r;
  try{r=await sb.rpc('support_send',{p_body:text});}catch(e){r={error:e};}
  if(r.error){inp.value=text;toast('❌ '+(r.error.message||'Could not send'));return;}
  if(!SUPPORT.active)return;   // chat was closed while sending
  if(r.data){activeChatConvId=r.data.conversation_id||activeChatConvId;activeChatTaskId=r.data.task_id||activeChatTaskId;}
  loadChatMessages(true);
  if(typeof maybeAskPushAfterSend==='function')maybeAskPushAfterSend();
}
