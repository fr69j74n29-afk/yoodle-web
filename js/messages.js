// Messages list and chat safety tip.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

async function loadMessages(){
  const el=document.getElementById('conversations-list');
  if(!sb||!me){el._tabHtml=null;el.innerHTML=emptyState('🔌','Connect Supabase','Add credentials to see messages');return;}
  const pid=myProfileId||me.id;
  tabBegin('messages',el); // last list stays on screen while this reloads (js/core-state.js)

  let{data,error}=await sb.rpc('get_conversations',{user_id:pid});
  if(error){tabError('messages',el,emptyState('😕','Error loading messages',esc(error.message)));return;}
  data=data||[];
  tabCache.messages.sig=tabConvSig(data); // refreshUnreadCount() compares against this (js/core-state.js)
  // nav dot from the same data, every chat counted (contact chats too). Set before the "no chats" return, or a stale dot stays on.
  _setMessageBadge(data.some(c=>c.has_unread));

  // Contact chats (task_type 'direct') aren't in Chats: they're shown in the Contacts tab (js/contacts.js), which
  // loads its friend list only when tapped (Rhea, 27 Nov; idea board #9). task_type comes from get_conversations
  // (migration 20261127_002); until that's applied, one small tasks lookup tells them apart.
  let isDirect=t=>t.task_type==='direct';
  if(data.length&&!('task_type' in data[0])){
    const{data:dt}=await sb.from('tasks').select('id').eq('type','direct').in('id',[...new Set(data.map(t=>t.task_id))]);
    const ids=new Set((dt||[]).map(r=>r.id));isDirect=t=>ids.has(t.task_id);
  }
  if(window.ctSetChats)ctSetChats(data.filter(isDirect)); // last message + unread for each contact, and the Contacts tab dot
  data=data.filter(t=>!isDirect(t));
  if(!data.length){tabShow('messages',el,emptyState('💬','No conversations yet',window.ctSetChats?'Express interest in a job to start messaging. Chats with your contacts are under Contacts.':'Express interest in a job to start messaging'));return;}

  const html=data.map(t=>{
    const isPoster=t.poster_id===pid;
    const otherName=t.other_name||'Someone';
    const title=t.title;
    const otherRating=t.other_rating;
    const cat=(t.category||'other').toLowerCase();
    const preview=t.last_msg_body?esc(t.last_msg_body).slice(0,60):'Tap to open chat';
    const msgTime=t.last_msg_created_at?timeAgo(t.last_msg_created_at):'';
    const isUnread=t.has_unread===true;
    const rowBg=isUnread?'background:rgba(236,72,153,.08);border-color:rgba(236,72,153,.3)':'';
    const unreadBadge=isUnread?`<span style="display:inline-block;margin-left:6px;padding:2px 7px;border-radius:100px;background:var(--pink);color:#fff;font-size:10.5px;font-weight:800;letter-spacing:.5px;vertical-align:middle;flex-shrink:0">NEW</span>`:'';
    let statusTag='';
    if(!isPoster){
      if(t.app_status==='pending') statusTag=`<span style="font-size:11.5px;color:var(--yellow);font-weight:800;margin-left:6px">Pending</span>`;
      else if(window.yoodiOwnsChat&&yoodiOwnsChat(t.poster_id,t.other_id)) statusTag=''; // Yoodi chat (js/yoodi.js)
      else if(window.supportOwnsChat&&supportOwnsChat(t.poster_id,t.other_id,t.title)) statusTag=''; // Contact support (js/support-chat.js)
      else if(t.app_status==='assigned'||t.task_status==='claimed') statusTag=`<span style="font-size:11.5px;color:var(--teal);font-weight:800;margin-left:6px">Assigned</span>`;
    }
    return `<div class="conv-row" style="${rowBg}" data-conv="${t.conversation_id}" data-task="${t.task_id}" data-poster="${t.poster_id}" data-other="${t.other_id||''}" onclick="openChat('${t.task_id}','${escJs(title)}','${escJs(otherName)}','${t.poster_id}','${t.other_id||''}','${otherRating||''}','${t.conversation_id}')">
      ${window.yoodiAvatar&&yoodiOwnsChat(t.poster_id,t.other_id)?yoodiAvatar():window.supportAvatar&&supportOwnsChat(t.poster_id,t.other_id,t.title)?supportAvatar():avatarCircle(otherName,null,'28px','12px')}
      <div class="conv-body">
        <div class="conv-top">
          <span class="conv-name">${esc(otherName)}${idvChip(t.other_id,true)}${unreadBadge}</span>
          <span class="conv-time" style="${isUnread?'color:var(--pink);font-weight:800':''}">${msgTime}</span>
        </div>
        <div class="conv-title" style="display:flex;align-items:center;gap:4px">${esc(t.title)}${statusTag}</div>
        <div class="conv-preview" style="${isUnread?'color:var(--text);font-weight:800':'color:#666'}">${preview}</div>
      </div>
    </div>`;
  }).join('');
  if(tabShow('messages',el,html)&&window.swInit)swInit(el); // redraw only if changed; swipe-left actions (js/swipe-actions.js)
}

let activeChatTaskId=null, activeChatPosterId=null, activeChatDoerId=null, activeChatConvId=null;
// Standard chat safety card (13 Nov 2026, replaces the 14 Oct direct-contact tip): every chat except Yoodle team threads, both sides.
// 'Got it' is remembered per chat on this device (new key, so chats where the old tip was dismissed show the new card once).
let activeChatSafetyTip=false;
const SAFETY_KEY='yoodle_safety_seen_v2';
function _tipSeen(cid){try{return (JSON.parse(localStorage.getItem(SAFETY_KEY)||'[]')||[]).includes(cid);}catch(e){return false;}}
function dismissSafetyTip(){
  if(!activeChatConvId)return;
  try{let a=JSON.parse(localStorage.getItem(SAFETY_KEY)||'[]')||[];if(!a.includes(activeChatConvId))a.push(activeChatConvId);localStorage.setItem(SAFETY_KEY,JSON.stringify(a.slice(-200)));}catch(e){}
  loadChatMessages(true);
}
// Profile → ID verification (the block shows the right state, incl. verified). Used by the chat card ("get yours") and the map "Stay safe" card.
function openIdvFromMap(){
  nav('profile');
  setTimeout(()=>{document.getElementById('idv-block')?.scrollIntoView({behavior:'smooth',block:'center'});},400);
}
function openIdvFromChat(){closeChat();openIdvFromMap();}
function safetyTipHtml(){
  if(!activeChatSafetyTip)return'';
  if(_tipSeen(activeChatConvId))return`<div class="safety-mini" style="text-align:center;margin:0 0 14px"><span style="display:inline-block;font-size:12.5px;color:var(--muted);font-weight:700;background:var(--surface2);padding:5px 14px;border-radius:100px">🛡️ Ask for ID verification or <button class="st-link" onclick="openIdvFromChat()">get yours</button> · <button class="st-link st-rep2" onclick="reportFromChat()">Report</button></span></div>`;
  return`<div class="safety-tip"><b>🛡️ Stay safe on Yoodle</b><p>Before you agree, make sure you both understand the job and how payment will work.</p><p>Keep chatting here until it feels right. Don't share your phone, email or address before then.</p><p>Never send money back, buy gift cards or share verification codes.</p><div class="st-foot"><button class="st-rep" onclick="reportFromChat()">Report</button><button class="st-got" onclick="dismissSafetyTip()">Got it</button></div></div>`;
}
function closeChat(){
  if(window.yoodiOnClose)yoodiOnClose(); // js/yoodi.js
  if(window.ctChatReset)ctChatReset(); // js/contacts.js
  if(window.supportOnClose)supportOnClose(); // js/support-chat.js
  closeOv('chat-modal');
  activeChatConvId=null;
  const msgView=document.getElementById('app-messages');
  if(msgView?.classList.contains('active')){
    loadMessages();
  } else {
    refreshUnreadCount();
  }
}

async function openChatFromNotification(taskId,convId){
  if(!me||!sb)return;
  const pid=myProfileId||me.id;
  if(!convId){
    // ?task_id= with no conv_id (job links, nudge emails): my active chat on that job, else the job sheet
    const{data:mine}=await sb.from('conversations').select('id').eq('task_id',taskId).eq('status','active')
      .or(`poster_id.eq.${pid},applicant_id.eq.${pid}`).order('created_at',{ascending:false}).limit(1);
    if(mine&&mine[0]){convId=mine[0].id;}
    else{
      const{data:job}=await sb.from('tasks').select('*').eq('id',taskId).maybeSingle();
      if(job&&(job.status==='open'||job.status==='offered'))openJob(job); // offered: a private offer to/from a contact (only the two can read it)
      else toast('This job is no longer available');
      return;
    }
  }
  nav('messages');
  const{data:conv}=await sb.from('conversations')
    .select('id,poster_id,applicant_id,tasks(title,type)')
    .eq('id',convId).single();
  if(!conv)return;
  const isPoster=conv.poster_id===pid;
  const otherId=isPoster?conv.applicant_id:conv.poster_id;
  if(!otherId)return;
  // Yoodle Shield (26 Nov 2026): a push / email link to a chat with a member who is suspended now opens the
  // Shield popup instead of the chat (the inbox already hides it; this closes the deep-link way in).
  const{data:held}=await sb.rpc('my_suspended_contacts');
  if((held||[]).some(r=>(typeof r==='string'?r:r?.my_suspended_contacts)===otherId)){if(window.openShieldPanel)openShieldPanel(true);return;}
  const{data:other}=await sb.from('profiles').select('name,rating').eq('id',otherId).single();
  const isDirect=conv.tasks?.type==='direct'; // friend chat (js/contacts.js): the friend's name, not the hidden task's title
  openChat(taskId,isDirect?(other?.name||'Contact'):(conv.tasks?.title||'Job'),other?.name||'User',conv.poster_id,otherId,other?.rating||'',convId);
}
