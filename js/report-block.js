// Report and block.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

function openReport(reportedId,name,taskId,convId){
  if(!sb||!me)return toast('Sign in to report');
  if(reportedId===(myProfileId||me.id))return toast("That's you!");
  _report={reportedId,name,taskId:taskId||null,convId:convId||null};
  document.getElementById('report-sub').textContent=taskId?`Report "${window._mJobTitle||'this job'}" posted by ${name}`:`Report ${name}`;
  document.getElementById('report-reasons').innerHTML=REPORT_REASONS.map((r,i)=>`<label style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:var(--radius-sm);border:1.5px solid var(--border);background:var(--surface2);font-size:14.5px;font-weight:700;cursor:pointer"><input type="radio" name="report-reason" value="${esc(r)}" style="width:18px;height:18px;accent-color:var(--btn-a)">${esc(r)}</label>`).join('');
  document.getElementById('report-details').value='';
  document.getElementById('report-also-block').checked=false;
  openOv('report-modal');
}
function closeReport(){closeOv('report-modal');_report=null;}
async function submitReport(){
  if(!_report||!sb||!me)return;
  const reason=document.querySelector('input[name="report-reason"]:checked')?.value;
  if(!reason)return toast('Choose a reason');
  const details=document.getElementById('report-details').value.trim()||null;
  const alsoBlock=document.getElementById('report-also-block').checked;
  const btn=document.getElementById('report-submit');btn.disabled=true;btn.textContent='Sending…';
  const r=_report;
  const{error}=await sb.from('reports').insert({reporter_id:myProfileId||me.id,reported_id:r.reportedId,reason,details,task_id:r.taskId,conversation_id:r.convId});
  btn.disabled=false;btn.textContent='Send report';
  if(error)return toast('❌ '+error.message);
  closeReport();
  if(alsoBlock){await doBlock(r.reportedId);}
  toast('✅ Thanks — we\'ll review this within 24 hours');
}
function reportJob(){
  if(!activeJob)return;
  window._mJobTitle=activeJob.title;
  openReport(activeJob.poster_id,window._mPosterName||'the poster',activeJob.id,null);
}
function reportFromChat(){
  if(!activeChatDoerId)return;
  window._mJobTitle=document.getElementById('chat-title').textContent;
  openReport(activeChatDoerId,activeChatOtherName,null,activeChatConvId);
  if(_report)_report.taskId=activeChatTaskId;
  document.getElementById('report-sub').textContent=`Report ${activeChatOtherName}`;
}
function blockFromChat(){if(activeChatDoerId)openBlock(activeChatDoerId,activeChatOtherName);}

function openBlock(userId,name){
  if(!sb||!me)return toast('Sign in first');
  if(userId===(myProfileId||me.id))return toast("That's you!");
  _blockTarget=userId;
  document.getElementById('block-title').textContent=`Block ${name}?`;
  openOv('block-modal');
}
async function confirmBlock(){
  if(!_blockTarget)return;
  const btn=document.getElementById('block-go');btn.disabled=true;
  const ok=await doBlock(_blockTarget);
  btn.disabled=false;
  closeOv('block-modal');
  if(ok)toast('🚫 Blocked');
}
async function doBlock(userId){
  const pid=myProfileId||me.id;
  const{error}=await sb.from('blocks').insert({blocker_id:pid,blocked_id:userId});
  if(error&&error.code!=='23505'){toast('❌ '+error.message);return false;}
  iBlockedIds.add(userId);hiddenUserIds.add(userId);
  // close anything showing this person and refresh lists
  if(activeChatDoerId===userId){closeOv('chat-modal');activeChatConvId=null;}
  closeOv('op-modal');_opParentModal=null;
  closeOv('modal');
  loadJobs();loadMessages();refreshUnreadCount();loadBlockedList();
  return true;
}
async function unblockUser(userId){
  if(!sb||!me)return;
  const{error}=await sb.from('blocks').delete().eq('blocker_id',myProfileId||me.id).eq('blocked_id',userId);
  if(error)return toast('❌ '+error.message);
  closeOv('op-modal');_opParentModal=null;
  await loadBlockedIds();
  loadJobs();loadMessages();loadBlockedList();
  toast('Unblocked');
}
async function loadBlockedList(){
  const el=document.getElementById('blocked-list');
  if(!el||!sb||!me)return;
  const{data,error}=await sb.from('blocks').select('blocked_id,created_at,profiles!blocks_blocked_id_fkey(name)').eq('blocker_id',myProfileId||me.id).order('created_at',{ascending:false});
  if(error){el.textContent='Could not load';return;}
  if(!data?.length){el.textContent="You haven't blocked anyone.";return;}
  el.innerHTML=data.map(b=>`<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--border)">
    <span style="color:var(--text);font-weight:800">${esc(b.profiles?.name||'Yoodler')}</span>
    <button onclick="unblockUser('${b.blocked_id}')" style="padding:7px 14px;border-radius:100px;border:1.5px solid var(--border);background:transparent;color:var(--text);font-family:'Nunito',sans-serif;font-size:13.5px;font-weight:800;cursor:pointer">Unblock</button>
  </div>`).join('');
}
