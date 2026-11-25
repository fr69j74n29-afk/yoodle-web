// ── SWIPE ACTIONS on the Messages list (23 Nov 2026) ──
// Swipe a chat row LEFT to reveal its job actions; desktop gets a "⋯" button that opens the same actions.
// Only one direction (left) so it never fights the iOS edge "back" swipe.
// Buttons depend on who you are in that chat and the job's live status (fetched when the row opens):
//   Poster, job claimed  → Complete · Unclaim      (help request: Complete · Cancel)
//   Poster, job open     → Decline (this applicant only; Cancel job stays in My Jobs)
//   Helper, job claimed  → Withdraw                    (help request: Decline)
//   Applicant, pending   → Withdraw
//   Yoodle team thread   → Hide (member: closes it; team account: hides it for the team only)
//   Yoodi chat           → Clear (start fresh: closes this chat; the next message to Yoodi starts an empty one)
// Every button uses the same "tap again to confirm" as the chat screen (tapConfirm) and calls the SAME functions
// as the chat-screen buttons in index.html (chatComplete, chatUnclaim, cancelHelpOffer, withdrawApplication),
// so there is still one place where each action happens. Only swDecline is new (no existing per-applicant decline).
// No database changes. Needs from index.html: data-conv / data-task / data-poster / data-other on .conv-row,
// and swInit(el) called after loadMessages() renders the list. Classic script (not a module): uses globals sb, me, myProfileId.

const SW_BTN_W=84;          // px per action button
let swOpenWrap=null;        // the one row that is open right now
const swIsDesktop=()=>window.matchMedia('(hover:hover) and (pointer:fine)').matches;

(function swCss(){
  const s=document.createElement('style');
  s.textContent=`
.sw-wrap{position:relative;margin-bottom:8px;border-radius:var(--radius-sm);overflow:hidden}
.sw-wrap>.conv-row{margin-bottom:0;position:relative;z-index:1;touch-action:pan-y;will-change:transform}
.sw-wrap>.conv-row.sw-anim{transition:transform .22s ease}
.sw-actions{position:absolute;top:0;right:0;bottom:0;display:flex;z-index:0;clip-path:inset(0 0 0 100%)}
.sw-actions button{width:${SW_BTN_W}px;border:none;color:#fff;font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1.15;text-align:center;padding:0 6px}
.sw-actions .sw-ok{background:linear-gradient(135deg,var(--btn-a),var(--btn-b))}
.sw-actions .sw-warn{background:#E08A2E}
.sw-actions .sw-bad{background:#DC5046}
.sw-actions .sw-grey{background:#8A8A99}
.sw-actions .sw-wait{background:var(--surface2);color:var(--muted);width:${SW_BTN_W}px}
.sw-actions button.tc-armed{box-shadow:inset 0 0 0 3px rgba(255,255,255,.7)!important}
.sw-more{display:none}
@media(hover:hover) and (pointer:fine){
  .sw-wrap>.conv-row{padding-right:44px}
  .sw-more{display:flex;position:absolute;right:8px;top:50%;transform:translateY(-50%);z-index:2;width:30px;height:30px;border-radius:50%;border:1.5px solid var(--border);background:var(--surface);color:var(--muted);font-size:16px;font-weight:800;align-items:center;justify-content:center;cursor:pointer;line-height:1}
  .sw-more:hover{color:var(--text)}
  .sw-wrap.sw-open .sw-more{display:none} /* don't cover the buttons */
}`;
  document.head.appendChild(s);
})();

// Wrap each rendered row. Called by loadMessages() right after it fills the list.
function swInit(listEl){
  if(!listEl)return;
  swOpenWrap=null;
  listEl.querySelectorAll('.conv-row[data-conv]').forEach(row=>{
    if(row.parentElement.classList.contains('sw-wrap'))return;
    const wrap=document.createElement('div');
    wrap.className='sw-wrap';
    row.parentNode.insertBefore(wrap,row);
    wrap.appendChild(row);
    const acts=document.createElement('div');
    acts.className='sw-actions';
    wrap.appendChild(acts);
    const more=document.createElement('button');
    more.className='sw-more';more.type='button';more.setAttribute('aria-label','Chat actions');more.textContent='⋯';
    more.onclick=e=>{e.stopPropagation();swOpenWrap===wrap?swClose(wrap):swOpen(wrap);};
    wrap.appendChild(more);
    swBindTouch(wrap,row);
  });
  if(!listEl._swClickGuard){
    listEl._swClickGuard=true;
    // A tap on an open row (or right after a drag) closes it instead of opening the chat.
    listEl.addEventListener('click',e=>{
      const wrap=e.target.closest('.sw-wrap');
      if(!wrap||e.target.closest('.sw-actions,.sw-more'))return;
      if(wrap._swJustDragged||swOpenWrap===wrap){e.stopPropagation();e.preventDefault();wrap._swJustDragged=false;swClose(wrap);}
    },true);
  }
}

// Tap anywhere outside the open row closes it.
document.addEventListener('touchstart',e=>{if(swOpenWrap&&!swOpenWrap.contains(e.target))swClose(swOpenWrap);},{passive:true});
document.addEventListener('mousedown',e=>{if(swOpenWrap&&!swOpenWrap.contains(e.target))swClose(swOpenWrap);});

function swSetX(wrap,x,anim){
  const row=wrap.firstElementChild, acts=wrap.querySelector('.sw-actions');
  row.classList.toggle('sw-anim',!!anim);
  row.style.transform=x?`translateX(${-x}px)`:'';
  const w=acts.offsetWidth||0;
  acts.style.transition=anim?'clip-path .22s ease':'none';
  acts.style.clipPath=`inset(0 0 0 ${Math.max(0,w-x)}px)`;
}
function swWidth(wrap){return (wrap.querySelector('.sw-actions').children.length||1)*SW_BTN_W;}

async function swOpen(wrap){
  if(swOpenWrap&&swOpenWrap!==wrap)swClose(swOpenWrap);
  swOpenWrap=wrap;
  await swLoadActions(wrap);
  if(swOpenWrap!==wrap)return;
  const n=wrap.querySelector('.sw-actions').children.length;
  if(!n){swClose(wrap);toast('Nothing to do on this chat right now');return;}
  wrap.classList.add('sw-open');
  swSetX(wrap,swWidth(wrap),true);
}
function swClose(wrap){
  if(!wrap)return;
  wrap.querySelectorAll('.sw-actions button').forEach(b=>{if(window.tapConfirmReset)tapConfirmReset(b);});
  wrap.classList.remove('sw-open');
  swSetX(wrap,0,true);
  wrap._swLoading=null; // re-check the job's status next time it opens
  if(swOpenWrap===wrap)swOpenWrap=null;
}

function swBindTouch(wrap,row){
  let x0=0,y0=0,dx=0,lock=null,base=0,active=false;
  row.addEventListener('touchstart',e=>{
    if(e.touches.length!==1)return;
    const t=e.touches[0];
    if(t.clientX<20){active=false;return;} // leave the screen edge to iOS
    x0=t.clientX;y0=t.clientY;dx=0;lock=null;active=true;
    base=swOpenWrap===wrap?swWidth(wrap):0;
  },{passive:true});
  row.addEventListener('touchmove',e=>{
    if(!active)return;
    const t=e.touches[0],mx=x0-t.clientX,my=t.clientY-y0;
    if(!lock){
      if(Math.abs(mx)<8&&Math.abs(my)<8)return;
      lock=Math.abs(mx)>Math.abs(my)?'x':'y';
      if(lock==='y'){active=false;return;} // vertical: let the list scroll
      if(swOpenWrap&&swOpenWrap!==wrap)swClose(swOpenWrap);
      swLoadActions(wrap); // start fetching while the finger moves
    }
    e.preventDefault();
    const max=swWidth(wrap);
    dx=Math.max(0,base+mx);
    if(dx>max)dx=max+(dx-max)*.25; // rubber band past the buttons
    swSetX(wrap,dx,false);
  },{passive:false});
  row.addEventListener('touchend',()=>{
    if(!active||lock!=='x'){active=false;return;}
    active=false;
    wrap._swJustDragged=true;setTimeout(()=>{wrap._swJustDragged=false;},350);
    if(dx>Math.min(60,swWidth(wrap)/2))swOpen(wrap);else swClose(wrap);
  });
  row.addEventListener('touchcancel',()=>{if(active){active=false;swClose(wrap);}});
}

// Fetch the job's live status once per render and build the buttons (mirrors openChat's chat-screen buttons).
function swLoadActions(wrap){
  if(wrap._swLoading)return wrap._swLoading;
  const acts=wrap.querySelector('.sw-actions'), row=wrap.firstElementChild;
  acts.innerHTML=`<button class="sw-wait" type="button" disabled>…</button>`;
  wrap._swLoading=(async()=>{
    const btns=await swButtonsFor(row.dataset.task,row.dataset.conv,row.dataset.poster,row.dataset.other).catch(()=>[]);
    acts.innerHTML='';
    btns.forEach(b=>{
      const el=document.createElement('button');
      el.type='button';el.className=b.cls;
      el.textContent=b.label;
      el.onclick=e=>{e.stopPropagation();tapConfirm(el,'Tap again',async()=>{el.disabled=true;await b.run();});};
      acts.appendChild(el);
    });
  })();
  return wrap._swLoading;
}

async function swButtonsFor(taskId,convId,posterId,otherId){
  if(!sb||!me||!taskId)return[];
  const pid=myProfileId||me.id;
  const{data:task}=await sb.from('tasks').select('status,poster_id,doer_id,type').eq('id',taskId).single();
  if(!task)return[];
  const isPoster=task.poster_id===pid, isDoer=task.doer_id===pid, isHO=isHelperContact(task);
  const B=(label,cls,run)=>({label,cls,run});
  if(task.type==='yoodi_chat'){
    // Yoodi is for one-off help (Roman, 23 Nov): Clear closes the chat so the next question starts fresh.
    return(!isPoster&&task.status==='claimed')?[B('Clear','sw-grey',()=>swClearYoodi(convId))]:[];
  }
  if(task.type==='admin_note'){
    // Member: closes the chat (as before). Yoodle team account (poster): hides it from the team's list only; a newer message brings it back.
    return((isDoer&&task.status==='claimed')||isPoster)?[B('Hide','sw-grey',()=>swHideTeam(convId))]:[];
  }
  if(task.status==='claimed'){
    if(isPoster){
      return[
        B('Complete','sw-ok',()=>chatComplete(taskId,task.doer_id)),
        isHO?B('Cancel','sw-bad',()=>cancelHelpOffer(taskId)):B('Unclaim','sw-warn',()=>chatUnclaim(taskId))
      ];
    }
    if(isDoer)return[isHO?B('Decline','sw-bad',()=>cancelHelpOffer(taskId)):B('Withdraw','sw-bad',()=>chatUnclaim(taskId))];
    return[];
  }
  if(task.status==='open'){
    if(isPoster&&otherId)return[B('Decline','sw-bad',()=>swDecline(convId,taskId,otherId))];
    if(!isPoster){
      const{data:app}=await sb.from('applications').select('id,status').eq('task_id',taskId).eq('applicant_id',pid).maybeSingle();
      if(app&&app.status==='pending')return[B('Withdraw','sw-bad',()=>withdrawApplication(app.id))];
    }
  }
  return[];
}

// Poster turns down ONE applicant on an open job: reject their application, tell them, close just this chat.
// The message starts with "Thanks for" so loadChatMessages shows it as a grey system line, like the "someone else was selected" note.
async function swDecline(convId,taskId,applicantId){
  if(!sb||!me)return;
  const pid=myProfileId||me.id;
  const{error}=await sb.from('applications').update({status:'rejected'}).eq('task_id',taskId).eq('applicant_id',applicantId).eq('status','pending');
  if(error)return toast('❌ '+error.message);
  await closeConversation(convId,taskId,pid,applicantId,`Thanks for your interest — the poster has decided to go another way on this job.`);
  toast('Applicant declined');
  loadMessages();loadMyJobs();refreshUnreadCount();
}

// Yoodi chat "start fresh": yoodi_clear_chat cancels + archives the member's Yoodi chat; old messages stay in the
// database for admin/safety. yoodiOpen() then finds no active chat and shows a blank one; yoodi_ask creates the new chat.
async function swClearYoodi(convId){
  if(!sb||!me||!convId)return;
  const{error}=await sb.rpc('yoodi_clear_chat',{p_conversation:convId});
  if(error)return toast('❌ '+error.message);
  toast('Yoodi chat cleared');
  loadMessages();refreshUnreadCount();
}

// Same as the chat screen's "Hide this chat" (hideTeamThread), without needing the chat open.
// hide_team_thread decides by caller: member → cancel + archive; Yoodle team account → sets poster_hidden_at only.
async function swHideTeam(convId){
  if(!sb||!me||!convId)return;
  const{error}=await sb.rpc('hide_team_thread',{p_conversation:convId});
  if(error)return toast('❌ '+error.message);
  toast('Chat hidden');
  loadMessages();refreshUnreadCount();
}
