// Chat screen: messages, sending, claim / complete / unclaim from chat.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

async function openChat(taskId,title,otherName,posterId,otherId,otherRating,convId){
  if(window.yoodiOwnsChat&&yoodiOwnsChat(posterId,otherId))return yoodiOpenChat(convId,taskId); // Yoodi chat (js/yoodi.js)
  activeChatTaskId=taskId;activeChatPosterId=posterId;activeChatDoerId=otherId;activeChatConvId=convId||null;activeChatOtherName=otherName||'this person';activeChatSafetyTip=false;
  document.getElementById('chat-title').textContent=title;
  const ratingStr=otherRating?` · ★ ${otherRating}`:'';
  // Set avatar initial immediately with default color
  const avEl=document.getElementById('chat-av');
  const initial=((otherName||'?')[0]).toUpperCase();
  avEl.textContent=initial;
  const otherEl=document.getElementById('chat-other');
  otherEl.innerHTML=`${esc(otherName)}${idvChip(otherId,true)}${esc(ratingStr)}<span style="font-size:11.5px;opacity:.5;margin-left:4px">›</span>`;
  openOv('chat-modal');

  // if we don't have a convId yet, look it up
  if(!activeChatConvId&&sb&&me){
    const pid=myProfileId||me.id;
    const isP=posterId===pid;
    const applicantId=isP?otherId:pid;
    const{data:conv}=await sb.from('conversations').select('id').eq('task_id',taskId).eq('applicant_id',applicantId).eq('status','active').maybeSingle();
    if(conv)activeChatConvId=conv.id;
  }

  // mark as read immediately on open
  if(activeChatConvId&&sb&&me){
    const pid=myProfileId||me.id;
    await sb.rpc('mark_conversation_read',{p_conversation_id:activeChatConvId,p_user_id:pid});
    refreshUnreadCount();
  }

  loadChatMessages();

  // fetch task status for action buttons
  const actionsEl=document.getElementById('chat-actions');
  actionsEl.innerHTML='';actionsEl.style.display='none';
  if(!sb||!me)return;
  const pid=myProfileId||me.id;
  const{data:task}=await sb.from('tasks').select('status,poster_id,doer_id,type').eq('id',taskId).single();
  if(!task)return;
  // "Yoodle team" thread: no job buttons; the member can hide it
  if(task.type==='admin_note'){
    if(task.doer_id===pid&&task.status==='claimed'){
      actionsEl.innerHTML=`<button onclick="hideTeamThread()" style="flex:1;padding:10px;border-radius:var(--radius-sm);background:transparent;border:1.5px solid var(--border);color:var(--muted);font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">Hide this chat</button>`;
      actionsEl.style.display='flex';
    }
    return;
  }

  const isPoster=task.poster_id===pid;
  const isDoer=task.doer_id===pid;
  const isHO=isHelperContact(task);
  // Safety card: every chat except Yoodle team threads (returned above). Add it in place — no second messages fetch.
  if(activeChatTaskId===taskId){activeChatSafetyTip=true;const cm=document.getElementById('chat-messages');if(cm&&!cm.querySelector('.safety-tip,.safety-mini'))cm.insertAdjacentHTML('afterbegin',safetyTipHtml());}

  const withdrawBtn=`<button onclick="tapConfirm(this,'Tap again to withdraw',()=>chatUnclaim('${taskId}'))" style="flex:1;padding:10px;border-radius:var(--radius-sm);background:transparent;border:1.5px solid rgba(220,80,70,.25);color:#DC5046;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">Withdraw</button>`;
  const cancelHOLabel=isPoster?'Cancel':'Decline';
  const cancelHOBtn=`<button onclick="tapConfirm(this,'Tap again to ${cancelHOLabel.toLowerCase()}',()=>cancelHelpOffer('${taskId}'))" style="flex:1;padding:10px;border-radius:var(--radius-sm);background:transparent;border:1.5px solid rgba(220,80,70,.25);color:#DC5046;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">${cancelHOLabel}</button>`;
  if(task.status==='claimed'){
    let btns='';
    if(isPoster){
      btns+=`<button onclick="tapConfirm(this,'Tap again to complete',()=>chatComplete('${taskId}','${task.doer_id}'))" style="flex:1;padding:10px;border-radius:var(--radius-sm);background:linear-gradient(135deg,var(--btn-a),var(--btn-b));border:none;color:#fff;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">✅ Mark Complete</button>`;
      btns+=isHO?cancelHOBtn:`<button onclick="tapConfirm(this,'Tap again to unclaim',()=>chatUnclaim('${taskId}'))" style="flex:1;padding:10px;border-radius:var(--radius-sm);background:transparent;border:1.5px solid rgba(220,80,70,.25);color:#DC5046;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">Unclaim</button>`;
    } else if(isDoer){
      btns+=isHO?cancelHOBtn:withdrawBtn;
    }
    if(btns){actionsEl.innerHTML=btns;actionsEl.style.display='flex';}
  } else if((task.status==='open'||task.status==='paused')&&!isPoster){ // paused: applicant can still withdraw
    const{data:app}=await sb.from('applications').select('id,status').eq('task_id',taskId).eq('applicant_id',pid).maybeSingle();
    if(app&&app.status==='pending'){
      actionsEl.innerHTML=withdrawBtn;
      actionsEl.style.display='flex';
    }
  }
}

async function loadChatMessages(quiet){
  const el=document.getElementById('chat-messages');if(!quiet)el.innerHTML=spin();
  if(!sb||!me||!activeChatConvId)return;
  const pid=myProfileId||me.id;

  const{data,error}=await sb.from('messages')
    .select('id,body,sender_id,created_at')
    .eq('conversation_id',activeChatConvId)
    .order('created_at',{ascending:true});
  if(error){el.innerHTML=safetyTipHtml()+emptyState('💬','Start the conversation','Send a message below');return;}
  if(!data?.length){el.innerHTML=safetyTipHtml()+emptyState('💬','Start the conversation','Send a message below');return;}

  el.innerHTML=safetyTipHtml()+data.map(m=>{
    const isMe=m.sender_id===pid||m.sender_id===me.id;
    const yh=window.yoodiMsgHtml?yoodiMsgHtml(m,isMe):null;if(yh)return yh; // Yoodi chat bubbles (js/yoodi.js)
    const isSys=m.body?.startsWith('✅')||m.body?.startsWith('↩️')||m.body?.startsWith('🎉')||m.body?.startsWith('Thanks for');
    if(isSys&&!isMe)return`<div style="text-align:center;margin:10px 0"><span style="font-size:13.5px;color:var(--muted);font-weight:700;background:var(--surface2);padding:5px 14px;border-radius:100px">${linkify(esc(m.body||''))}</span></div>`;
    return`<div data-mid="${esc(m.id)}" data-me="${isMe?1:0}" style="display:flex;justify-content:${isMe?'flex-end':'flex-start'};margin-bottom:10px"><div style="max-width:75%;padding:10px 14px;border-radius:${isMe?'18px 18px 4px 18px':'18px 18px 18px 4px'};background:${isMe?'var(--btn-a)':'var(--surface2)'};color:${isMe?'#fff':'var(--text)'};font-size:14px;font-weight:600;line-height:1.4">${linkify(esc(m.body||''))}<div style="font-size:11.5px;opacity:.6;margin-top:4px;text-align:right">${timeAgo(m.created_at)}</div></div></div>`;
  }).join('');
  if(window.rxDecorate)rxDecorate(el); // 👍 👎 reactions (js/reactions.js)
  el.scrollTop=el.scrollHeight;
  if(window.yoodiAfterRender)yoodiAfterRender(data); // Yoodi chat: intro + "thinking" (js/yoodi.js)

  // lock input if task is completed
  const{data:taskStatus}=await sb.from('tasks').select('status').eq('id',activeChatTaskId).single();
  const inputBar=document.getElementById('chat-input-bar');
  if(taskStatus?.status==='completed'){
    inputBar.style.display='none';
  } else {
    inputBar.style.display='flex';
  }
}

async function sendMessage(){
  if(window.yoodiSendHook&&yoodiSendHook())return; // Yoodi chat sends through yoodi_ask (js/yoodi.js)
  const inp=document.getElementById('chat-input');
  const content=inp.value.trim();
  if(!content||!activeChatTaskId||!activeChatConvId||!sb)return;
  inp.value='';
  const pid=myProfileId||me.id;
  const isPoster=activeChatPosterId===pid;
  const receiverId=isPoster?activeChatDoerId:activeChatPosterId;
  if(!receiverId)return toast('❌ Could not determine recipient');
  const{error}=await sb.from('messages').insert({
    conversation_id:activeChatConvId,
    task_id:activeChatTaskId,
    sender_id:me.id,
    receiver_id:receiverId,
    body:content
  });
  if(error){toast('❌ '+error.message);return;}
  loadChatMessages();
  maybeAskPushAfterSend();
}
// After someone sends a message: ask them to turn on push (or, on iPhone Safari,
// add to Home Screen) so they see the reply. At most once per 7 days per device.
function _pushReady(){
  if(isIos()&&!isInStandaloneMode())return false;
  return window.Notification?.permission==='granted';
}
function maybeAskPushAfterSend(){
  const iosBrowser=isIos()&&!isInStandaloneMode();
  try{
    if(_pushReady())return;
    if(!iosBrowser&&!window.Notification)return;            // browser can't do push at all
    if(window.Notification?.permission==='denied')return;   // can't re-ask; Profile explains the fix
    if(document.getElementById('push-ask'))return;
    const k='yoodle_push_ask',last=+(localStorage.getItem(k)||0);
    if(Date.now()-last<7*864e5)return;
    localStorage.setItem(k,String(Date.now()));
  }catch(e){return;}
  const body=iosBrowser
    ?'On iPhone, replies can only reach you when Yoodle is on your Home Screen. Tap <strong style="color:var(--text)">Share</strong>, then <strong style="color:var(--text)">Add to Home Screen</strong>, and open Yoodle from there.'
    :'Turn on notifications so you don\'t miss their reply, even when Yoodle is closed.';
  const btns=iosBrowser
    ?`<button id="pa-ok" style="flex:1;padding:12px;border:none;border-radius:var(--radius-sm);background:var(--btn-a);color:#fff;font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;cursor:pointer">Got it</button>`
    :`<button id="pa-no" style="flex:1;padding:12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);background:transparent;color:var(--muted);font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;cursor:pointer">Not now</button><button id="pa-ok" style="flex:1;padding:12px;border:none;border-radius:var(--radius-sm);background:var(--btn-a);color:#fff;font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;cursor:pointer">Turn on</button>`;
  const w=document.createElement('div');
  w.id='push-ask';
  w.style.cssText='position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;justify-content:center;padding:16px 16px calc(16px + var(--sab,0px))';
  w.innerHTML=`<div style="width:100%;max-width:420px;background:var(--surface);color:var(--text);border-radius:var(--radius);padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.25);font-family:'Nunito',sans-serif"><div style="font-size:28px;line-height:1;margin-bottom:8px">🔔</div><div style="font-size:18px;font-weight:800;margin-bottom:6px">Get notified when they reply</div><div style="font-size:14.5px;color:var(--muted);line-height:1.45;margin-bottom:16px">${body}</div><div style="display:flex;gap:10px">${btns}</div></div>`;
  const close=()=>w.remove();
  w.addEventListener('click',e=>{if(e.target===w)close();});
  setTimeout(()=>{
    document.body.appendChild(w);
    w.querySelector('#pa-no')?.addEventListener('click',close);
    w.querySelector('#pa-ok').addEventListener('click',()=>{close();if(!iosBrowser)requestNotifPermission();});
  },700);
}

async function claimFromChat(taskId){
  if(!sb||!me)return;
  const pid=myProfileId||me.id;
  const{error}=await sb.from('tasks').update({status:'claimed',doer_id:pid}).eq('id',taskId);
  if(error)return toast('❌ '+error.message);
  toast('🎉 Job claimed!');
  // refresh action buttons
  const{data:task}=await sb.from('tasks').select('status,poster_id,doer_id').eq('id',taskId).single();
  const actionsEl=document.getElementById('chat-actions');
  if(task?.status==='claimed'){
    actionsEl.innerHTML=`<button onclick="tapConfirm(this,'Tap again to unclaim',()=>chatUnclaim('${taskId}'))" style="flex:1;padding:10px;border-radius:var(--radius-sm);background:transparent;border:1.5px solid rgba(220,80,70,.25);color:#DC5046;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">Unclaim</button>`;
    actionsEl.style.display='flex';
  }
  loadMessages();loadJobs();
}

// Posts a last system message (when there's someone to send it to), THEN archives the thread.
// Order matters: the message must land before the conversation is archived.
async function closeConversation(convId,taskId,fromId,toId,body){
  if(!convId)return;
  if(body&&toId)await sendSystemMessage(convId,taskId,fromId,toId,body);
  await sb.from('conversations').update({status:'archived'}).eq('id',convId);
}

// My display name, fetched once per signed-in profile — saveBio() keeps it current
let _myNameCache=null;
async function getMyName(){
  if(!sb||!me)return null;
  const pid=myProfileId||me.id;
  if(_myNameCache&&_myNameCache.pid===pid)return _myNameCache.name;
  const{data}=await sb.from('profiles').select('name').eq('id',pid).maybeSingle();
  const name=data?.name||null;
  if(name)_myNameCache={pid,name};
  return name;
}
async function sendSystemMessage(convId,taskId,senderId,receiverId,body){
  if(!convId)return;
  await sb.from('messages').insert({conversation_id:convId,task_id:taskId,sender_id:senderId,receiver_id:receiverId,body});
}

// Member hides a "Yoodle team" chat — closes the thread; a later team message opens a new one
async function hideTeamThread(){
  if(!sb||!me||!activeChatConvId)return;
  const{error}=await sb.rpc('hide_team_thread',{p_conversation:activeChatConvId});
  if(error)return toast('❌ '+error.message);
  closeOv('chat-modal');
  activeChatConvId=null;
  toast('Chat hidden');
  loadMessages();refreshUnreadCount();
}

async function cancelHelpOffer(taskId){
  if(!sb||!me)return;
  const pid=myProfileId||me.id;
  const{data:taskData}=await sb.from('tasks').select('poster_id,doer_id,title,type').eq('id',taskId).single();
  if(!taskData)return toast('❌ Could not load task');
  const name=(await getMyName())||'Someone';
  const{error}=await sb.from('tasks').update({status:'cancelled'}).eq('id',taskId);
  if(error)return toast('❌ '+error.message);
  // archive conversation
  let convId=activeChatConvId;
  if(!convId){
    const applicantId=taskData.poster_id===pid?taskData.doer_id:pid;
    if(applicantId){
      const{data:conv}=await sb.from('conversations').select('id').eq('task_id',taskId).eq('applicant_id',applicantId).eq('status','active').maybeSingle();
      convId=conv?.id||null;
    }
  }
  if(convId){
    const isPoster=taskData.poster_id===pid;
    const receiverId=isPoster?taskData.doer_id:taskData.poster_id;
    const sysMsg=isPoster?`❌ ${name} cancelled this request.`:`🚫 ${name} declined this request.`;
    await closeConversation(convId,taskId,pid,receiverId,sysMsg);
  }
  closeOv('chat-modal');
  activeChatConvId=null;
  const isPosterFinal=taskData.poster_id===pid;
  toast(isPosterFinal?'❌ Request cancelled':'🚫 Request declined');
  loadMessages();loadJobs();loadMyJobs();
}

async function chatUnclaim(taskId){
  if(!sb||!me)return;
  const pid=myProfileId||me.id;
  const{data:taskData}=await sb.from('tasks').select('poster_id,doer_id,title').eq('id',taskId).single();
  if(!taskData)return toast('❌ Could not load job');
  const name=(await getMyName())||me.email?.split('@')[0]||'Someone';
  const{error}=await sb.from('tasks').update({status:'open',doer_id:null}).eq('id',taskId);
  if(error)return toast('❌ '+error.message);
  const isPoster=taskData.poster_id===pid;
  if(isPoster){
    if(taskData.doer_id){
      await sb.from('applications').update({status:'withdrawn'}).eq('task_id',taskId).eq('applicant_id',taskData.doer_id);
    }
  } else {
    await sb.from('applications').update({status:'withdrawn'}).eq('task_id',taskId).eq('applicant_id',pid);
  }
  // send message then archive the conversation — look up if not already known
  let convId=activeChatConvId;
  if(!convId){
    const applicantId=isPoster?taskData.doer_id:pid;
    if(applicantId){
      const{data:conv}=await sb.from('conversations').select('id').eq('task_id',taskId).eq('applicant_id',applicantId).eq('status','active').maybeSingle();
      convId=conv?.id||null;
    }
  }
  if(convId){
    const receiverId=isPoster?taskData.doer_id:taskData.poster_id;
    await closeConversation(convId,taskId,pid,receiverId,`↩️ ${name} unclaimed this job. It's back to open.`);
  }
  closeOv('chat-modal');
  activeChatConvId=null;
  toast('↩️ Job unclaimed and returned to open');
  loadMessages();loadJobs();loadMyJobs();
}

async function chatComplete(taskId,doerId){
  if(!sb||!me)return;
  document.querySelectorAll('button').forEach(b=>{if(b.textContent.includes('Complete'))b.disabled=true;});
  const pid=myProfileId||me.id;
  const{data:taskData}=await sb.from('tasks').select('poster_id,doer_id,status').eq('id',taskId).single();
  if(!taskData){toast('❌ Could not load job');return;}
  if(taskData.status==='completed'){
    closeOv('chat-modal');
    toast('✅ Already completed!');loadMyJobs();loadJobs();return;
  }
  const{error}=await sb.from('tasks').update({status:'completed'}).eq('id',taskId);
  if(error){
    document.querySelectorAll('button').forEach(b=>{if(b.textContent.includes('Complete'))b.disabled=false;});
    return toast('❌ '+error.message);
  }
  // look up the active conversation — use activeChatConvId if available, else query
  let convId=activeChatConvId;
  if(!convId&&taskData.doer_id){
    const{data:conv}=await sb.from('conversations').select('id').eq('task_id',taskId).eq('applicant_id',taskData.doer_id).eq('status','active').maybeSingle();
    convId=conv?.id||null;
  }
  if(convId){
    await closeConversation(convId,taskId,taskData.poster_id,taskData.doer_id,`✅ Job marked complete by the poster. This conversation is now closed.`);
  }
  closeOv('chat-modal');
  activeChatConvId=null;
  toast('✅ Job marked complete!');
  loadMessages();loadJobs();loadMyJobs();
  activeJob={id:taskId,poster_id:taskData.poster_id,doer_id:doerId};
  openRatingModal(taskId,doerId,'How did the helper do?');
}
