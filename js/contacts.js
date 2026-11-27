// Contacts tab on the Messages page: friend requests by email, your friends list, friend chats.
// Part of the app's main code. Classic script, same global scope as the other js/ files: see js/README.md.
//
// How it works (26 Nov 2026):
//  - Messages page has two tabs: Chats (the conversations list, as before) and Contacts.
//  - The search bar at the top of Contacts filters your friends by name. Typing a full email shows
//    "Send friend request to …" (Enter does the same). Requests need the other person to accept.
//  - No account with that email → "Invite them to join?" card → Send invite emails them (friend_invite). When they
//    join with that email, the invite becomes a contact request from you. Accepting any request opens your chat.
//  - Sections: Requests (sent to you: Accept / Decline), Contacts (tap = open your chat; Remove),
//    Sent (waiting for them: Cancel). The Contacts tab shows a count of requests waiting for you.
//  - A friend chat is a normal chat anchored on a hidden task of type 'direct' (like Yoodi's chat), so it
//    also shows in Chats once it has messages. No job buttons or swipe actions on it.
//  - In a job chat, once both people have written: "＋ Connect" in the chat header (friend_connect). Declines are
//    silent (the asker keeps seeing "Request sent"), requests expire after 30 days, no new ask for 60 days.
//  - Contacts show last active, "Not taking jobs right now", the job you connected on, and a private note.
//  - Contact chats have the safety card and "Offer a job": a private job only the two of you can see
//    (status 'offered'), Accept / Decline, Make public. Database: 20261126_005_contacts_connect_offers.sql.
// Database: supabase/migrations/20261126_001_contacts.sql (friendships table, friend_request,
// friend_respond, friend_remove, get_friends, friend_open_chat). Uses globals sb, me, esc, toast, openChat.

let ctRows=[];            // last get_friends() result
let ctTabNow='chats';
let ctBusy=false;
let ctInvites=[];         // my open email invites (people not on Yoodle yet)
let ctInviteAsk=null;     // email waiting for the "Invite them?" confirmation
let ctLoaded=false;       // get_friends() has run for this account
let ctNoteEdit=null;      // contact whose private note is being edited
const CT_EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

(function ctCss(){
  const s=document.createElement('style');
  s.textContent=`
.msg-tabs{display:flex;gap:6px;background:var(--surface2);border-radius:12px;padding:4px;margin-bottom:14px}
.msg-tabs button{flex:1;padding:9px;border-radius:8px;border:none;background:transparent;color:var(--muted);font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px}
.msg-tabs button.on{background:var(--surface);color:var(--text)}
.ct-badge{display:none;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--pink);color:#fff;font-size:11px;font-weight:900;line-height:18px}
.ct-badge.show{display:inline-block}
.ct-search{position:relative;margin-bottom:14px}
.ct-search input{width:100%;box-sizing:border-box;padding:12px 14px 12px 38px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);font-family:'Nunito',sans-serif;font-size:15px;font-weight:700;outline:none}
.ct-search input:focus{border-color:var(--btn-a)}
.ct-search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:17px;height:17px;color:var(--muted)}
.ct-h{font-size:11.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin:16px 2px 8px}
.ct-row{display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface);border-radius:var(--radius-sm);border:1.5px solid var(--border);margin-bottom:8px}
.ct-row.tap{cursor:pointer}
.ct-row.tap:active{transform:scale(.98)}
.ct-name{flex:1;min-width:0;font-size:15px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ct-name small{display:block;font-size:12.5px;font-weight:700;color:var(--muted)}
.ct-btn{padding:8px 12px;border-radius:10px;border:1.5px solid var(--border);background:transparent;color:var(--muted);font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;cursor:pointer;flex-shrink:0;white-space:nowrap}
.ct-btn.go{background:linear-gradient(135deg,var(--btn-a),var(--btn-b));border:none;color:#fff}
.ct-add{width:100%;text-align:left;display:flex;align-items:center;gap:12px;padding:12px 14px;margin-bottom:8px;border-radius:var(--radius-sm);border:1.5px dashed var(--btn-a);background:transparent;color:var(--text);font-family:'Nunito',sans-serif;font-size:14.5px;font-weight:800;cursor:pointer}
.ct-add b{color:var(--btn-a);font-size:20px;line-height:1}
.ct-add span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ct-inv{padding:14px;margin-bottom:8px;border-radius:var(--radius-sm);border:1.5px solid var(--btn-a);background:rgba(92,138,106,.08)}
.ct-inv p{margin:0 0 10px;font-size:14px;font-weight:700;line-height:1.45;color:var(--text)}
.ct-inv p small{display:block;margin-top:4px;font-size:12.5px;color:var(--muted)}
.ct-inv div{display:flex;gap:8px;justify-content:flex-end}
.ct-meta{display:block;font-size:12.5px;font-weight:700;color:var(--muted)}
.ct-src{display:block;margin-top:3px;padding:0;border:none;background:none;text-align:left;font:700 12.5px 'Nunito',sans-serif;color:var(--muted);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
button.ct-src:hover{color:var(--text)}
.ct-pn{display:block;margin-top:3px;padding:0;border:none;background:none;text-align:left;font:700 12.5px 'Nunito',sans-serif;color:var(--btn-a);cursor:pointer;white-space:normal}
.ct-pn.has{color:var(--text2)}
.ct-pn-edit{display:flex;gap:6px;margin-top:6px}
.ct-pn-edit input{flex:1;min-width:0;padding:7px 10px;border-radius:9px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);font:700 13.5px 'Nunito',sans-serif}
.chat-connect{padding:7px 12px;border-radius:100px;border:1.5px solid var(--btn-a);background:transparent;color:var(--btn-a);font:800 13px 'Nunito',sans-serif;cursor:pointer;white-space:nowrap;flex-shrink:0}
.chat-connect:disabled{opacity:.6;border-color:var(--border);color:var(--muted);cursor:default}
.ct-offer-btn{display:block;width:100%;margin-top:8px;padding:8px 12px;border-radius:10px;border:1.5px solid currentColor;background:transparent;color:inherit;font:800 13.5px 'Nunito',sans-serif;cursor:pointer}
.p-offer{margin:4px 0 14px;padding:12px 14px;border-radius:var(--radius-sm);border:1.5px solid var(--purple);background:rgba(92,138,106,.08);font-size:13.5px;font-weight:700;line-height:1.45;color:var(--text)}
.ct-note{font-size:13.5px;color:var(--muted);font-weight:700;text-align:center;padding:18px 10px;line-height:1.45}`;
  document.head.appendChild(s);
})();

function msgTab(tab){
  ctTabNow=tab==='contacts'?'contacts':'chats';
  document.getElementById('msg-tab-chats')?.classList.toggle('on',ctTabNow==='chats');
  document.getElementById('msg-tab-contacts')?.classList.toggle('on',ctTabNow==='contacts');
  const list=document.getElementById('conversations-list'),pane=document.getElementById('contacts-pane');
  if(list)list.style.display=ctTabNow==='chats'?'':'none';
  if(pane)pane.style.display=ctTabNow==='contacts'?'':'none';
  if(ctTabNow==='contacts')ctLoad();
}

// get_friends(); also used by loadMessages() to label friend chats in the Chats list.
async function ctFetch(){
  if(!sb||!me){ctRows=[];ctSetBadge();return ctRows;}
  const[{data,error},inv]=await Promise.all([sb.rpc('get_friends'),
    sb.from('friend_invites').select('id,email,created_at').is('claimed_at',null).order('created_at',{ascending:false})]);
  if(!inv.error)ctInvites=inv.data||[];
  if(error){console.warn('contacts',error);return ctRows;}
  ctRows=data||[];ctLoaded=true;
  ctSetBadge();
  if(ctTabNow==='contacts')ctRender(); // keep the visible list in step (e.g. after switching accounts)
  return ctRows;
}
function ctSetBadge(){
  const n=ctRows.filter(r=>r.status==='pending'&&r.incoming).length,b=document.getElementById('ct-badge');
  if(b){b.textContent=n;b.classList.toggle('show',n>0);}
}
// Sign-out (js/auth.js): forget this account's contacts and go back to Chats
function ctReset(){
  ctRows=[];ctInvites=[];ctInviteAsk=null;ctLoaded=false;ctNoteEdit=null;ctSetBadge();
  const pane=document.getElementById('contacts-pane');if(pane)pane.innerHTML='';
  msgTab('chats');
}
// conversation ids of friend chats (for the Chats list)
function ctDirectConvIds(){return new Set(ctRows.filter(r=>r.conversation_id).map(r=>r.conversation_id));}

async function ctLoad(){
  const pane=document.getElementById('contacts-pane');if(!pane)return;
  if(!pane.querySelector('#ct-q')){
    pane.innerHTML=`<div class="ct-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="ct-q" type="search" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false"
          placeholder="Search contacts or add by email" aria-label="Search contacts or add someone by email"
          oninput="ctRender()" onkeydown="if(event.key==='Enter'){event.preventDefault();ctAddFromBox();}">
      </div><div id="ct-list">${spin()}</div>`;
  }
  await ctFetch();
  ctRender();
}

function ctRender(){
  const el=document.getElementById('ct-list');if(!el)return;
  const q=(document.getElementById('ct-q')?.value||'').trim(),ql=q.toLowerCase();
  const match=r=>!ql||(r.other_name||'').toLowerCase().includes(ql);
  const incoming=ctRows.filter(r=>r.status==='pending'&&r.incoming&&match(r));
  const friends=ctRows.filter(r=>r.status==='accepted'&&match(r));
  const sent=ctRows.filter(r=>r.status==='pending'&&!r.incoming&&match(r));
  const invited=ctInvites.filter(i=>!ql||i.email.includes(ql));
  const av=r=>avatarCircle(r.other_name,null,'34px','14px',true,r.avatar_color||'#5C8A6A');
  let h='';
  if(ctInviteAsk&&ctInviteAsk===ql)   // not on Yoodle: offer an invite email (needs a tap to confirm)
    h+=`<div class="ct-inv"><p>No Yoodle account uses ${esc(q)}. Invite them to join?<small>We'll email them an invite from you. When they join with this email, your contact request is waiting for them, and accepting it opens a chat with you.</small></p>
      <div><button class="ct-btn" type="button" onclick="ctInviteAsk=null;ctRender()">Not now</button><button class="ct-btn go" type="button" onclick="ctSendInvite(this)">Send invite</button></div></div>`;
  else if(CT_EMAIL_RE.test(q))
    h+=`<button class="ct-add" type="button" onclick="ctAddFromBox()"><b>＋</b><span>Send friend request to ${esc(q)}</span></button>`;
  if(incoming.length){
    h+=`<div class="ct-h">Requests</div>`+incoming.map(r=>`<div class="ct-row">${av(r)}
      <div class="ct-name">${esc(r.other_name)}<small>wants to add you</small></div>
      <button class="ct-btn" type="button" onclick="ctRespond('${r.friendship_id}',false,this)">Decline</button>
      <button class="ct-btn go" type="button" onclick="ctRespond('${r.friendship_id}',true,this)">Accept</button></div>`).join('');
  }
  if(friends.length){
    h+=`<div class="ct-h">Contacts</div>`+friends.map(r=>`<div class="ct-row tap" onclick="ctOpenChat('${r.other_id}')">${av(r)}
      <div class="ct-name">${esc(r.other_name)}${idvChip(r.other_id,true)}<span class="ct-meta">${ctMeta(r)}</span>${ctSourceHtml(r)}${ctNoteHtml(r)}</div>
      <button class="ct-btn" type="button" onclick="event.stopPropagation();tapConfirm(this,'Tap again to remove',()=>ctRemove('${r.other_id}'))">Remove</button></div>`).join('');
  }
  if(sent.length||invited.length){
    h+=`<div class="ct-h">Sent</div>`+invited.map(i=>`<div class="ct-row">${avatarCircle(i.email,null,'34px','14px',true,'#9CA3AF')}
      <div class="ct-name">${esc(i.email)}<small>Invited by email, waiting for them to join</small></div>
      <button class="ct-btn" type="button" onclick="tapConfirm(this,'Tap again to cancel',()=>ctCancelInvite('${i.id}'))">Cancel</button></div>`).join('')+sent.map(r=>`<div class="ct-row">${av(r)}
      <div class="ct-name">${esc(r.other_name)}<small>Request sent, waiting for them to accept</small></div>
      <button class="ct-btn" type="button" onclick="tapConfirm(this,'Tap again to cancel',()=>ctRemove('${r.other_id}'))">Cancel</button></div>`).join('');
  }
  if(!incoming.length&&!friends.length&&!sent.length&&!invited.length&&ctInviteAsk!==ql){
    h+=q&&!CT_EMAIL_RE.test(q)
      ?`<div class="ct-note">No contacts match "${esc(q)}".<br>To add someone new, type their full email.</div>`
      :(q?'':emptyState('👥','No contacts yet','Type a friend\'s email above. If they\'re on Yoodle they get a contact request; if not, you can invite them'));
  }
  el.innerHTML=h;
}

const CT_RESULT={
  sent:n=>`✅ Friend request sent to ${n}`,
  accepted:n=>`🎉 You and ${n} are now contacts`,
  already_friends:n=>`${n} is already in your contacts`,
  already_sent:n=>`You already sent ${n} a request`,
  self:()=>`That's your own email`,
  too_many:()=>`Too many lookups today. Try again tomorrow`
};
async function ctAddFromBox(){
  const inp=document.getElementById('ct-q');const email=(inp?.value||'').trim();
  if(!CT_EMAIL_RE.test(email))return toast('Type their full email to add someone');
  if(ctBusy||!sb||!me)return;ctBusy=true;
  const{data,error}=await sb.rpc('friend_request',{p_email:email});
  ctBusy=false;
  if(error)return toast('❌ '+error.message);
  if(data?.result==='not_found'){ctInviteAsk=email.toLowerCase();return ctRender();} // offer an invite instead
  const f=CT_RESULT[data?.result];toast(f?f(data.name||'them'):'Done');
  if(data&&['sent','accepted','already_friends','already_sent'].includes(data.result)){inp.value='';await ctFetch();}
  ctRender();
}
async function ctRespond(id,accept,btn,noOpen){
  if(btn)btn.disabled=true;
  const r=ctRows.find(x=>x.friendship_id===id);
  const{data,error}=await sb.rpc('friend_respond',{p_id:id,p_accept:accept});
  if(error){if(btn)btn.disabled=false;return toast('❌ '+error.message);}
  toast(accept?'🎉 Added to your contacts':'Request declined');
  await ctFetch();ctRender();
  // accepting starts your chat with them (friend_respond returns it): open it straight away
  if(accept&&!noOpen&&data&&data.conversation_id&&r)openChat(data.task_id,r.other_name,r.other_name,data.poster_id,data.other_id,'',data.conversation_id);
}
const CT_INVITE_RESULT={
  sent:e=>`📧 Invite sent to ${e}`,
  already_invited:e=>`You already invited ${e}`,
  self:()=>`That's your own email`,
  invalid:()=>`That email doesn't look right`,
  too_many:()=>`You've sent 10 invites today. Try again tomorrow`
};
async function ctSendInvite(btn){
  const email=ctInviteAsk;if(!email||ctBusy||!sb||!me)return;
  ctBusy=true;if(btn)btn.disabled=true;
  const{data,error}=await sb.rpc('friend_invite',{p_email:email});
  ctBusy=false;
  if(error){if(btn)btn.disabled=false;return toast('❌ '+error.message);}
  const f=CT_INVITE_RESULT[data?.result];toast(f?f(email):'Done');
  if(data&&(data.result==='sent'||data.result==='already_invited')){
    ctInviteAsk=null;const inp=document.getElementById('ct-q');if(inp)inp.value='';
    await ctFetch();
  }
  ctRender();
}
async function ctCancelInvite(id){
  const{error}=await sb.from('friend_invites').delete().eq('id',id);
  if(error)return toast('❌ '+error.message);
  await ctFetch();ctRender();
}
async function ctRemove(otherId){
  const{error}=await sb.rpc('friend_remove',{p_other:otherId});
  if(error)return toast('❌ '+error.message);
  await ctFetch();ctRender();
}
async function ctOpenChat(otherId){
  const r=ctRows.find(x=>x.other_id===otherId);if(!r||!sb)return;
  const{data,error}=await sb.rpc('friend_open_chat',{p_other:otherId});
  const c=Array.isArray(data)?data[0]:data;
  if(error||!c)return toast('❌ '+(error?.message||'Could not open the chat'));
  r.conversation_id=c.conversation_id;r.task_id=c.task_id;
  openChat(c.task_id,r.other_name,r.other_name,c.poster_id,otherId,'',c.conversation_id);
}


// ── Contact details (26 Nov 2026): last active, not taking jobs, where you connected, private note ──
const CT_ACTIVE={today:'Active today',week:'Active this week',month:'Active this month',older:'Active a while ago'};
function ctMeta(r){
  const bits=[CT_ACTIVE[r.last_active],r.taking_jobs?'':'Not taking jobs right now'].filter(Boolean);
  return esc(bits.length?bits.join(' · '):'Tap to message');
}
function ctDay(t){try{return new Date(t).toLocaleDateString('en-CA',{day:'numeric',month:'short',year:'numeric'});}catch(e){return'';}}
// Auto note (not editable): the job you connected on opens that job
function ctSourceHtml(r){
  const when=ctDay(r.connected_at||r.created_at);
  if(r.source_task_id&&r.source_title)
    return `<button type="button" class="ct-src" onclick="event.stopPropagation();ctOpenJobById('${r.source_task_id}')">Connected on “${esc(r.source_title)}” · ${esc(when)}</button>`;
  return `<span class="ct-meta">Connected ${esc(when)}</span>`;
}
// Private note: only you see it
function ctNoteHtml(r){
  if(ctNoteEdit===r.other_id)
    return `<div class="ct-pn-edit" onclick="event.stopPropagation()"><input id="ct-pn-inp" maxlength="300" placeholder="e.g. Great with drywall, prefers weekends" value="${esc(r.note||'')}" onkeydown="if(event.key==='Enter')ctSaveNote('${r.other_id}')"><button class="ct-btn go" type="button" onclick="ctSaveNote('${r.other_id}')">Save</button></div>`;
  return r.note
    ?`<button type="button" class="ct-pn has" onclick="event.stopPropagation();ctEditNote('${r.other_id}')">📝 ${esc(r.note)}</button>`
    :`<button type="button" class="ct-pn" onclick="event.stopPropagation();ctEditNote('${r.other_id}')">＋ Add a private note</button>`;
}
function ctEditNote(otherId){ctNoteEdit=otherId;ctRender();setTimeout(()=>{const i=document.getElementById('ct-pn-inp');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}},30);}
async function ctSaveNote(otherId){
  const v=(document.getElementById('ct-pn-inp')?.value||'').trim();
  const{error}=await sb.rpc('friend_set_note',{p_other:otherId,p_note:v});
  if(error)return toast('❌ '+error.message);
  ctNoteEdit=null;await ctFetch();ctRender();
}
async function ctOpenJobById(id,isOffer){
  if(!sb||!id)return;
  const{data}=await sb.from('tasks').select('*').eq('id',id).maybeSingle();
  if(!data)return toast(isOffer?'This offer is no longer available':'That job is no longer available');
  openJob({...data,category:(data.category||'other').toLowerCase()});
}

// ── Connect from a chat (Roman's plan): job chats only, once both of you have written ──
let ctChat={task:null,msgs:null,other:null};
function ctChatReset(){
  ctChat={task:null,msgs:null,other:null};
  const b=document.getElementById('chat-connect');if(b){b.style.display='none';b.disabled=false;tapConfirmReset(b);}
}
function ctChatTask(task,otherId){ctChat.task=task;ctChat.other=otherId;ctConnectEval();}
function ctChatMsgs(data){ctChat.msgs=data||[];ctConnectEval();}
async function ctConnectEval(){
  const b=document.getElementById('chat-connect');if(!b||!me)return;
  const t=ctChat.task,msgs=ctChat.msgs,other=ctChat.other;
  const hide=()=>{b.style.display='none';};
  if(!t||!msgs||!other||!activeChatConvId||t.id!==activeChatTaskId)return hide();
  if(['direct','yoodi_chat','support_chat','admin_note'].includes(t.type))return hide();
  const pid=myProfileId||me.id;
  if(!msgs.some(m=>m.sender_id===pid||m.sender_id===me.id)||!msgs.some(m=>m.sender_id===other))return hide();
  if(!ctLoaded)await ctFetch();
  if(ctChat.task!==t)return; // another chat opened meanwhile
  const r=ctRows.find(x=>x.other_id===other);
  if(r&&r.status==='accepted')return hide();
  if(b.dataset.busy)return;
  if(r&&r.incoming){b.textContent='Accept contact';b.dataset.mode='accept';b.dataset.fid=r.friendship_id;b.disabled=false;}
  else if(r){b.textContent='Request sent';b.dataset.mode='sent';b.disabled=true;}
  else{b.textContent='＋ Connect';b.dataset.mode='connect';b.disabled=false;}
  b.style.display='';
}
const CT_CONNECT_RESULT={
  sent:n=>`✅ Contact request sent to ${n}`,
  accepted:n=>`🎉 You and ${n} are now contacts`,
  already_friends:n=>`${n} is already in your contacts`,
  already_sent:n=>`You already asked ${n}`,
  not_available:()=>`Connect isn't available in this chat`,
  too_many:()=>`Too many requests today. Try again tomorrow`
};
function ctConnectTap(b){
  if(b.dataset.mode==='accept'){
    b.disabled=true;
    ctRespond(b.dataset.fid,true,null,true).then(()=>ctConnectEval());
    return;
  }
  if(b.dataset.mode!=='connect')return;
  tapConfirm(b,'Tap again to send',async()=>{
    b.dataset.busy='1';b.disabled=true;
    const{data,error}=await sb.rpc('friend_connect',{p_conversation:activeChatConvId});
    delete b.dataset.busy;
    if(error){b.disabled=false;tapConfirmReset(b);b.textContent='＋ Connect';return toast('❌ '+error.message);}
    const f=CT_CONNECT_RESULT[data?.result];toast(f?f(data.name||activeChatOtherName||'them'):'Done');
    await ctFetch();ctConnectEval();
  });
}

// ── Private job offers between contacts (Roman's plan): "Offer a job" in a contact chat ──
let postOffer=null; // {other,name} while the Post Job form is in offer mode
function ctOfferButton(actionsEl){
  if(!actionsEl||!activeChatDoerId)return;
  actionsEl.innerHTML=`<button type="button" onclick="ctOfferJob()" style="flex:1;padding:10px;border-radius:var(--radius-sm);background:transparent;border:1.5px solid var(--btn-a);color:var(--btn-a);font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">📋 Offer a job</button>`;
  actionsEl.style.display='flex';
}
function ctOfferJob(){
  const pid=myProfileId||me.id;
  const other=activeChatDoerId===pid?activeChatPosterId:activeChatDoerId;
  window._postOfferNext={other,name:activeChatOtherName||'your contact'};
  closeChat();nav('postjob'); // resetPost() → ctOfferFormSetup() picks it up
}
// Called at the end of resetPost(): offer mode only right after "Offer a job"
function ctOfferFormSetup(){
  postOffer=window._postOfferNext||null;window._postOfferNext=null;
  const ob=document.getElementById('p-offer'),btn=document.getElementById('post-btn');
  if(ob){ob.style.display=postOffer?'':'none';ob.innerHTML=postOffer?`🔒 <b>Private offer to ${esc(postOffer.name)}</b><br>Only the two of you can see this job. They can accept or decline, and you can make it public at any time.`:'';}
  if(btn)btn.textContent=postOffer?'Send private offer':'Post Job';
}
async function ctSendOffer(f){
  const o=postOffer;if(!o||!sb||!me)return;
  const btn=document.getElementById('post-btn');btn.disabled=true;btn.textContent='Sending…';
  const{error}=await sb.rpc('offer_create',{p_other:o.other,p_title:f.title,p_description:f.desc,p_category:f.cat,
    p_price:f.budget?parseFloat(f.budget):0,p_address:f.loc,p_lat:gpsLat,p_lng:gpsLng,p_location_verified:!!locVerified,
    p_expires_at:f.until.toISOString(),p_end_date_chosen:jobExpiryPicked('p-exp')});
  btn.disabled=false;btn.textContent='Send private offer';
  if(error)return toast('❌ '+error.message);
  toast(`📋 Offer sent to ${o.name}`);
  resetPost();nav('messages');
  await ctFetch();ctOpenChat(o.other);
}
// Offer card in the chat bubble (message written by offer_create): text without the link + a button
const CT_OFFER_RE=/^(?:📋 Job offer:|✏️ Job offer updated:)[\s\S]*?https:\/\/yoodle\.ca\/\?task_id=([0-9a-f-]{36})/;
function ctOfferBubble(m,isMe){
  const b=m.body||'',x=b.match(CT_OFFER_RE);
  if(!x)return linkify(esc(b));
  const text=b.replace(/\s*Open it to (?:accept or decline|see the changes): https:\/\/\S+/,'');
  const view=`<button type="button" class="ct-offer-btn" onclick="ctOpenJobById('${x[1]}',true)">${isMe?'View your offer':'View offer'} ›</button>`;
  const edit=isMe?`<button type="button" class="ct-offer-btn" onclick="ctOfferEdit('${x[1]}')">✏️ Edit offer</button>`:'';
  return esc(text).replace(/\n/g,'<br>')+view+edit;
}
// Edit from the chat card: only while it's still an offer or an accepted job
async function ctOfferEdit(id){
  const{data}=await sb.from('tasks').select('status').eq('id',id).maybeSingle();
  if(!data||data.status==='cancelled')return toast('This offer was cancelled');
  if(data.status==='completed'||data.status==='expired')return toast('This job can no longer be edited');
  closeChat();openEditModal(id);
}
async function offerAccept(j){
  const{data,error}=await sb.rpc('offer_accept',{p_task:j.id});
  if(error)return toast('❌ '+error.message);
  closeOv('modal');toast('🎉 Job accepted. Agree the details in the chat.');
  if(window.loadJobs)loadJobs();
  nav('messages');
  if(data&&data.conversation_id)openChat(data.task_id,data.title||j.title,window._mPosterName||'Poster',data.poster_id,data.poster_id,'',data.conversation_id);
}
async function offerDecline(id){
  const{error}=await sb.rpc('offer_decline',{p_task:id});
  if(error)return toast('❌ '+error.message);
  closeOv('modal');toast('Offer declined');
}
async function offerMakePublic(id){
  const{error}=await sb.rpc('offer_make_public',{p_task:id});
  if(error)return toast('❌ '+error.message);
  closeOv('modal');toast('🌍 Your job is now public. Anyone nearby can see it.');
  if(window.loadJobs)loadJobs();
  if(document.getElementById('app-activity')?.classList.contains('active')&&window.loadMyJobs)loadMyJobs();
  else if(window.loadMyJobs)loadMyJobs();
}

// ── Send a private job to a contact (Activity: "Send to a contact" / "Send to someone else") ──
let ctPickTask=null;
async function ctPickContact(taskId,currentId){
  ctPickTask=taskId;
  const el=document.getElementById('ct-pick-list');if(!el)return;
  el.innerHTML=spin();openOv('ct-pick-modal');
  await ctFetch();
  const list=ctRows.filter(r=>r.status==='accepted'&&r.other_id!==currentId);
  el.innerHTML=list.length?list.map(r=>`<div class="ct-row tap" onclick="ctSendOfferTo('${r.other_id}',this)">${avatarCircle(r.other_name,null,'34px','14px',true,r.avatar_color||'#5C8A6A')}
      <div class="ct-name">${esc(r.other_name)}<span class="ct-meta">${ctMeta(r)}</span></div><span style="color:var(--btn-a);font-weight:800;font-size:14px">Send ›</span></div>`).join('')
    :`<div class="ct-note">No other contacts yet. Add people in Messages → Contacts.</div>`;
}
async function ctSendOfferTo(otherId,row){
  if(!ctPickTask||!sb)return;
  if(row)row.style.opacity='.5';
  const{error}=await sb.rpc('offer_send',{p_task:ctPickTask,p_other:otherId});
  if(error){if(row)row.style.opacity='';return toast('❌ '+error.message);}
  const r=ctRows.find(x=>x.other_id===otherId);
  closeOv('ct-pick-modal');toast(`📋 Offer sent to ${r?r.other_name:'your contact'}`);
  ctPickTask=null;
  if(window.loadMyJobs)loadMyJobs();
  if(window.loadJobs)loadJobs();
}
