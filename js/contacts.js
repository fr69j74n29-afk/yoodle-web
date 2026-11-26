// Contacts tab on the Messages page: friend requests by email, your friends list, friend chats.
// Part of the app's main code. Classic script, same global scope as the other js/ files: see js/README.md.
//
// How it works (26 Nov 2026):
//  - Messages page has two tabs: Chats (the conversations list, as before) and Contacts.
//  - The search bar at the top of Contacts filters your friends by name. Typing a full email shows
//    "Send friend request to …" (Enter does the same). Requests need the other person to accept.
//  - Sections: Requests (sent to you: Accept / Decline), Contacts (tap = open your chat; Remove),
//    Sent (waiting for them: Cancel). The Contacts tab shows a count of requests waiting for you.
//  - A friend chat is a normal chat anchored on a hidden task of type 'direct' (like Yoodi's chat), so it
//    also shows in Chats once it has messages. No job buttons or swipe actions on it.
// Database: supabase/migrations/20261126_001_contacts.sql (friendships table, friend_request,
// friend_respond, friend_remove, get_friends, friend_open_chat). Uses globals sb, me, esc, toast, openChat.

let ctRows=[];            // last get_friends() result
let ctTabNow='chats';
let ctBusy=false;
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
  const{data,error}=await sb.rpc('get_friends');
  if(error){console.warn('contacts',error);return ctRows;}
  ctRows=data||[];
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
  ctRows=[];ctSetBadge();
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
  const av=r=>avatarCircle(r.other_name,null,'34px','14px',true,r.avatar_color||'#5C8A6A');
  let h='';
  if(CT_EMAIL_RE.test(q))
    h+=`<button class="ct-add" type="button" onclick="ctAddFromBox()"><b>＋</b><span>Send friend request to ${esc(q)}</span></button>`;
  if(incoming.length){
    h+=`<div class="ct-h">Requests</div>`+incoming.map(r=>`<div class="ct-row">${av(r)}
      <div class="ct-name">${esc(r.other_name)}<small>wants to add you</small></div>
      <button class="ct-btn" type="button" onclick="ctRespond('${r.friendship_id}',false,this)">Decline</button>
      <button class="ct-btn go" type="button" onclick="ctRespond('${r.friendship_id}',true,this)">Accept</button></div>`).join('');
  }
  if(friends.length){
    h+=`<div class="ct-h">Contacts</div>`+friends.map(r=>`<div class="ct-row tap" onclick="ctOpenChat('${r.other_id}')">${av(r)}
      <div class="ct-name">${esc(r.other_name)}${idvChip(r.other_id,true)}<small>Tap to message</small></div>
      <button class="ct-btn" type="button" onclick="event.stopPropagation();tapConfirm(this,'Tap again to remove',()=>ctRemove('${r.other_id}'))">Remove</button></div>`).join('');
  }
  if(sent.length){
    h+=`<div class="ct-h">Sent</div>`+sent.map(r=>`<div class="ct-row">${av(r)}
      <div class="ct-name">${esc(r.other_name)}<small>Request sent, waiting for them to accept</small></div>
      <button class="ct-btn" type="button" onclick="tapConfirm(this,'Tap again to cancel',()=>ctRemove('${r.other_id}'))">Cancel</button></div>`).join('');
  }
  if(!incoming.length&&!friends.length&&!sent.length){
    h+=q&&!CT_EMAIL_RE.test(q)
      ?`<div class="ct-note">No contacts match "${esc(q)}".<br>To add someone new, type their full email.</div>`
      :(q?'':emptyState('👥','No contacts yet','Type a friend\'s Yoodle sign-in email above to send them a friend request'));
  }
  el.innerHTML=h;
}

const CT_RESULT={
  sent:n=>`✅ Friend request sent to ${n}`,
  accepted:n=>`🎉 You and ${n} are now contacts`,
  already_friends:n=>`${n} is already in your contacts`,
  already_sent:n=>`You already sent ${n} a request`,
  self:()=>`That's your own email`,
  not_found:()=>`No Yoodle account with that email`,
  too_many:()=>`Too many lookups today. Try again tomorrow`
};
async function ctAddFromBox(){
  const inp=document.getElementById('ct-q');const email=(inp?.value||'').trim();
  if(!CT_EMAIL_RE.test(email))return toast('Type their full email to add someone');
  if(ctBusy||!sb||!me)return;ctBusy=true;
  const{data,error}=await sb.rpc('friend_request',{p_email:email});
  ctBusy=false;
  if(error)return toast('❌ '+error.message);
  const f=CT_RESULT[data?.result];toast(f?f(data.name||'them'):'Done');
  if(data&&['sent','accepted','already_friends','already_sent'].includes(data.result)){inp.value='';await ctFetch();}
  ctRender();
}
async function ctRespond(id,accept,btn){
  if(btn)btn.disabled=true;
  const{error}=await sb.rpc('friend_respond',{p_id:id,p_accept:accept});
  if(error){if(btn)btn.disabled=false;return toast('❌ '+error.message);}
  toast(accept?'🎉 Added to your contacts':'Request declined');
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
