// Job cards, job sheet, applying, applicants, assigning, unclaiming.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

function jobCard(j,profile){
  const color=CAT_COLOR[j.category]||'#3D6B50';
  const name=profile?.name||'Someone';
  const rating=profile?.rating?`<span style="color:var(--yellow);font-size:12.5px;font-weight:800">★ ${profile.rating}</span>`:`<span style="color:var(--muted);font-size:12.5px;font-weight:700">New</span>`;
  const locBadge=j.location_verified?`<span style="color:var(--lime);font-size:11.5px">✅</span>`:`<span style="color:var(--yellow);font-size:11.5px">⚠️</span>`;
  return `<div class="job-card" style="--jc:${color}" onclick='openJob(${JSON.stringify(j).replace(/'/g,"&#39;")})'>
    <div class="jc-badge">${j.category||'other'}</div>
    <div class="jc-top"><div class="jc-title">${esc(j.title)}</div><div class="jc-budget">$${j.price??'?'}</div></div>
    <div class="jc-desc">${esc(j.description||'')}</div>
    <div class="jc-foot">
      <div class="jc-poster"><div class="poster-av">${avatarCircle(name,profile?.avatar_color,'26px','11px')}</div><span class="poster-nm">${esc(name)}</span>${rating}</div>
      <div class="jc-loc">${locBadge} ${esc(j.address||'Nearby')} · ${timeAgo(j.created_at)}</div>
    </div>
  </div>`;
}

const FEATURED_POSTER_ID='c89896db-b2ab-4c4c-88fa-650823e63303';

function listCard(j,profile){
  const color=isAgencyJob(j)?AGENCY_PIN:'#DC2626'; // same colours as the map pins: red neighbour job, blue agency job
  const name=profile?.name||'Someone';
  const rating=profile?.rating?`★ ${profile.rating}`:'New';
  // show real distance only when GPS is known — map centre is not the user's position
  let locLabel=null;
  if(gpsLat&&gpsLng&&j.lat&&j.lng){
    const d=haversineKm(gpsLat,gpsLng,j.lat,j.lng);
    locLabel=d<=1?'Less than 1 km away':`${d.toFixed(1)} km away`;
  }
  return `<div class="list-card" style="--jc:${color}" onclick='logTap("job","${j.id}","card");openJob(${JSON.stringify(j).replace(/'/g,"&#39;")})'>
    <div class="lc-top">
      <span class="lc-title">${esc(j.title)}</span>
      <div style="display:flex;flex-direction:row;align-items:center;gap:4px;flex-shrink:0">${myAppliedTaskIds.has(j.id)?'<span style="font-size:11.5px;font-weight:800;color:var(--lime);letter-spacing:.5px">Applied-</span>':''}<span class="lc-budget">${isAgencyJob(j)?agencyPay(j):`$${j.price??'?'}`}</span></div>
    </div>
    <div class="lc-desc">${esc(j.description||'')}</div>
    <div class="lc-foot">
      <div class="lc-poster">
        <div class="lc-av">${avatarCircle(name,profile?.avatar_color,'20px','9px',false,color)}</div>
        <span class="lc-name">${esc(name)}</span>
        <span style="color:var(--yellow);font-size:12.5px;font-weight:800;flex-shrink:0">${rating}</span>
      </div>
      <span class="lc-meta">${locLabel?`${esc(locLabel)} · `:''}${timeAgo(j.created_at)}</span>
    </div>
  </div>`;
}

async function openJob(j){
  activeJob=j;const color=CAT_COLOR[j.category]||'#3D6B50';
  document.getElementById('m-title').textContent=j.title;
  const locTag=j.location_verified?'<span style="color:var(--lime);font-size:12.5px">GPS Verified</span>':'<span style="color:var(--yellow);font-size:12.5px">GPS Unverified</span>';
  let modalLocLabel=null;
  if(gpsLat&&gpsLng&&j.lat&&j.lng){
    const d=haversineKm(gpsLat,gpsLng,j.lat,j.lng);
    modalLocLabel=d<=1?'Less than 1 km away':`${d.toFixed(1)} km away`;
  }
  document.getElementById('m-meta').innerHTML=`${modalLocLabel?`${ICO.pin}${esc(modalLocLabel)} `:''}${locTag} &nbsp;·&nbsp; ${timeAgo(j.created_at)}`;
  document.getElementById('m-desc').textContent=j.description||'';
  const _agency=isAgencyJob(j);
  document.getElementById('m-budget').textContent=_agency?agencyPay(j):`$${j.price??'?'}`;
  document.getElementById('m-budget-l').textContent=_agency?'Pay':'Budget';
  const _an=document.getElementById('m-agency-note');_an.style.display='none';_an.textContent='';
  if(_agency)logAgency(j.id,'open'); // agency + imported (community) jobs → agency_events (Nov 2026: imported jobs tracked too)

  // fetch poster profile for trust signals
  document.getElementById('m-poster').innerHTML=`<div class="spinner" style="width:16px;height:16px"></div>`;
  if(sb){
    const pid=j.poster_id;
    const[{data:prof},{count:doneCount}]=await Promise.all([
      sb.from('profiles').select('name,rating,avatar_color').eq('id',pid).maybeSingle(),
      sb.from('tasks').select('*',{count:'exact',head:true}).eq('poster_id',pid).eq('status','completed')
    ]);
    const pname=prof?.name||'Someone';
    window._mPosterName=pname;
    const prating=prof?.rating?`<span style="color:var(--yellow);font-size:14px;font-weight:800">★ ${prof.rating}</span>`:`<span style="color:var(--muted);font-size:13.5px;font-weight:700">New</span>`;
    document.getElementById('m-poster').innerHTML=`
      <div style="flex-shrink:0">${avatarCircle(pname,prof?.avatar_color,'32px','13px')}</div><!-- not clickable: name + rating only -->
      <div style="min-width:0;display:flex;flex-direction:column;gap:3px">
        <div style="font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(pname)}</div>
        <div style="display:flex;align-items:center;gap:5px">${prating}</div>
      </div>`;
  }
  const isPoster=me&&(j.poster_id===me.id||j.poster_id===myProfileId);
  document.getElementById('m-report').style.display=(me&&!isPoster)?'block':'none';
  const btn=document.getElementById('m-action');const unclaimBtn=document.getElementById('m-unclaim');
  tapConfirmReset(btn);tapConfirmReset(unclaimBtn);
  if(!unclaimBtn._orig){unclaimBtn._orig=unclaimBtn.onclick;unclaimBtn._origHtml=unclaimBtn.innerHTML;} // offers reuse it as Decline
  unclaimBtn.onclick=unclaimBtn._orig;unclaimBtn.innerHTML=unclaimBtn._origHtml;
  // "N people have applied" — counts everyone who ever applied (get_applied_count); hidden at 0 and on agency jobs
  const appliedEl=document.getElementById('m-applied');appliedEl.style.display='none';
  if(sb&&!_agency&&j.id){
    sb.rpc('get_applied_count',{p_task_id:j.id}).then(({data})=>{
      if(activeJob?.id!==j.id||!(data>0))return;
      appliedEl.textContent=data===1?'1 person has applied':`${data} people have applied`;
      appliedEl.style.display='block';
    },()=>{});
  }
  btn.disabled=false;btn.style.display='block';unclaimBtn.style.display='none';
  btn.onclick=()=>jobAction();

  if(_agency&&isCommunityJob(j)){
    const _co=communityCompany(j);
    _an.textContent=`From ${_co}'s careers page. You apply directly with the employer — Yoodle isn't part of the hiring.`;
    _an.style.display='block';
    if(j.status==='open'&&/^https:\/\//i.test(j.url||'')){
      btn.textContent=`View & apply at ${_co} ↗`;
      btn.onclick=()=>{logAgency(j.id,'apply');window.open(j.url,'_blank','noopener');};
    } else {
      btn.textContent='No longer available';btn.disabled=true;
    }
  } else if(_agency){
    const _pn=window._mPosterName||'the agency';
    _an.textContent=`Listed by ${_pn}. You apply directly with the agency on their website — Yoodle isn't part of the hiring.`;
    _an.style.display='block';
    const _short=_pn.split(' ')[0];
    if(j.status==='open'&&/^https:\/\//i.test(j.url||'')){
      btn.textContent=`Apply directly with ${_short} ↗`;
      btn.onclick=()=>{logAgency(j.id,'apply');window.open(j.url,'_blank','noopener');};
    } else {
      btn.textContent='No longer available';btn.disabled=true;
    }
  } else if(j.status==='offered'){
    // Private job offer between contacts (js/contacts.js): only the poster and private_for can read it
    _an.textContent=isPoster?'🔒 Private offer: only you and your contact can see this job. Make it public to let anyone apply.':'🔒 A private job offer for you. Only the two of you can see it.';
    _an.style.display='block';
    if(isPoster){
      btn.textContent='Make public';
      btn.onclick=()=>tapConfirm(btn,'Tap again to make it public',()=>offerMakePublic(j.id));
      unclaimBtn.innerHTML='✏️ Edit offer';unclaimBtn.style.display='block';
      unclaimBtn.onclick=()=>{closeOv('modal');openEditModal(j.id);};
    } else {
      btn.textContent='Accept job';
      btn.onclick=()=>tapConfirm(btn,'Tap again to accept',()=>offerAccept(j));
      unclaimBtn.innerHTML='Decline';unclaimBtn.style.display='block';
      unclaimBtn.onclick=()=>tapConfirm(unclaimBtn,'Tap again to decline',()=>offerDecline(j.id));
    }
  } else if(j.status==='completed'){
    btn.textContent='Job Completed';btn.disabled=true;
  } else if(j.status==='cancelled'){
    // opened from a chat card or a contact's "Connected on" note (poster and contact see the same)
    _an.textContent=(j.from_offer||j.private_for)?'🚫 This job offer was cancelled.':'🚫 This job was cancelled.';_an.style.display='block';
    btn.textContent='Job cancelled';btn.disabled=true;btn.onclick=null;
  } else if(j.status==='expired'){
    btn.textContent='No longer available';btn.disabled=true;btn.onclick=null;
  } else if(j.status==='claimed'){
    if(isPoster){
      btn.textContent='Mark Complete';
      btn.onclick=()=>tapConfirm(btn,'Tap again to complete',jobAction);
      unclaimBtn.style.display='block';
    } else {
      btn.textContent='Message Poster';
      btn.onclick=()=>{closeOv('modal');nav('messages');};
    }
  } else if(j.status==='open'||j.status==='paused'){
    if(isPoster){
      btn.textContent='Review Applicants';
      btn.onclick=()=>openApplicants(j.id,j.title);
    } else {
      // check if already applied
      btn.textContent='Checking…';btn.disabled=true;
      if(sb&&me){
        const pid=myProfileId||me.id;
          sb.from('applications').select('id,status').eq('task_id',j.id).eq('applicant_id',pid).maybeSingle().then(({data})=>{
            if(data&&data.status==='pending'){
              btn.textContent='Withdraw Interest';btn.disabled=false;
              btn.onclick=()=>tapConfirm(btn,'Tap again to withdraw',()=>withdrawApplication(data.id));
            } else if(data&&data.status==='assigned'){
              btn.textContent='You are assigned!';btn.disabled=true;
            } else if(j.status==='paused'){
              btn.textContent='Paused — not taking new interest';btn.disabled=true;
            } else {
              btn.textContent="I'm Interested";btn.disabled=false;
              btn.onclick=()=>applyForJob(j.id,j.poster_id,j.title);
            }
          });
      }
    }
  }
  closeOv('radius-sheet');
  openOv('modal');
}
function closeModal(e){if(e.target.id==='modal')closeOv('modal');}

async function shareJob(){
  if(!activeJob)return;
  const url=`${window.location.origin}/job.html?job=${activeJob.id}`;
  const title=activeJob.title||'Local job on Yoodle';
  const text=isAgencyJob(activeJob)?`Job opening near you: "${title}". See it on Yoodle.`:`Someone near you needs help: "${title}". Apply free on Yoodle.`;
  if(navigator.share){
    try{await navigator.share({title,text,url});}catch(e){}
    return;
  }
  // fallback (desktop): copy message + link, same as shareOtherHelperPage()
  const full=text+' '+url;
  try{await navigator.clipboard.writeText(full);}catch(e){
    const ta=document.createElement('textarea');ta.value=full;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);
  }
  toast('📋 Copied! Paste it into a message');
}

async function jobAction(){
  if(!sb||!me){toast('🎉 (demo) Action noted!');closeOv('modal');return;}
  const isPoster=activeJob.poster_id===me.id||activeJob.poster_id===myProfileId;
  if(activeJob.status==='claimed'&&isPoster){
    const btn=document.getElementById('m-action');
    btn.disabled=true;btn.textContent='Saving…';
    // re-fetch status to prevent double completion
    const{data:current}=await sb.from('tasks').select('status').eq('id',activeJob.id).single();
    if(current?.status==='completed'){
      closeOv('modal');
      toast('✅ Already completed!');loadMyJobs();loadJobs();return;
    }
    const{error}=await sb.from('tasks').update({status:'completed'}).eq('id',activeJob.id);
    if(error){btn.disabled=false;btn.textContent='Mark Complete';return toast('❌ '+error.message);}
    closeOv('modal');
    toast('✅ Job marked complete!');loadJobs();loadMyJobs();
    openRatingModal(activeJob.id,activeJob.doer_id,'How did the helper do?');
  } else if(activeJob.status==='open'&&isPoster){
    const{error}=await sb.from('tasks').update({status:'cancelled'}).eq('id',activeJob.id);
    if(error)return toast('❌ '+error.message);
    // notify all pending applicants via their conversations then archive
    const{data:apps}=await sb.from('applications').select('applicant_id').eq('task_id',activeJob.id).eq('status','pending');
    const pid=myProfileId||me.id;
    for(const app of (apps||[])){
      const{data:conv}=await sb.from('conversations').select('id').eq('task_id',activeJob.id).eq('applicant_id',app.applicant_id).eq('status','active').maybeSingle();
      if(conv){
        await closeConversation(conv.id,activeJob.id,pid,app.applicant_id,'This job has been cancelled by the poster.');
      }
    }
    await sb.from('applications').update({status:'rejected'}).eq('task_id',activeJob.id).eq('status','pending');
    closeOv('modal');
    toast('🗑️ Job cancelled');loadJobs();
  }
}

async function applyForJob(taskId,posterId,jobTitle){
  if(!sb||!me)return;
  const pid=myProfileId||me.id;
  const btn=document.getElementById('m-action');
  btn.textContent='Applied';btn.disabled=true;

  // The sheet may show an old copy (map loaded before the poster paused/closed the job) → check the job is still open
  const{data:cur}=await sb.from('tasks').select('status').eq('id',taskId).maybeSingle();
  if(!cur||cur.status!=='open'){
    btn.textContent=cur?.status==='paused'?'Paused — not taking new interest':'No longer available';
    toast(cur?.status==='paused'?'⏸ This job is paused right now':'This job is no longer available');
    loadJobs();return;
  }

  // upsert application
  const{error}=await sb.from('applications').upsert(
    {task_id:taskId,applicant_id:pid,status:'pending'},
    {onConflict:'task_id,applicant_id'}
  );
  if(error){btn.textContent="I'm Interested";btn.disabled=false;return toast('❌ '+error.message);}

  // create conversation record — returns conversation_id
  const{data:convId,error:convErr}=await sb.rpc('create_conversation',{
    p_task_id:taskId,p_poster_id:posterId,p_applicant_id:pid
  });
  if(convErr){console.warn('Conversation create failed:',convErr.message);}

  // send intro message with conversation_id
  const{error:msgErr}=await sb.from('messages').insert({
    conversation_id:convId,
    task_id:taskId,
    sender_id:me.id,
    receiver_id:posterId,
    body:`Hi! I'm interested in this job and happy to help. 👋`   // short intro (13 Nov 2026): name + job title are already in the chat header
  });
  if(msgErr)console.warn('Message insert failed:',msgErr.message);

  closeOv('modal');
  document.getElementById('applied-job-title').textContent=jobTitle;
  document.getElementById('applied-chat-btn').dataset.taskId=taskId;
  document.getElementById('applied-chat-btn').dataset.posterId=posterId;
  document.getElementById('applied-chat-btn').dataset.convId=convId||'';
  document.getElementById('applied-chat-btn').dataset.posterName=activeJob?.profiles?.name||'Poster';
  document.getElementById('applied-chat-btn').dataset.posterRating=activeJob?.profiles?.rating||'';
  document.getElementById('applied-withdraw-btn').dataset.taskId=taskId;
  openOv('applied-modal');
  toast('🙋 Interest expressed!');
  loadJobs();
}

function openAppliedChat(){
  const btn=document.getElementById('applied-chat-btn');
  const taskId=btn.dataset.taskId;
  const posterId=btn.dataset.posterId;
  const convId=btn.dataset.convId||'';
  const posterName=btn.dataset.posterName||'Poster';
  const posterRating=btn.dataset.posterRating;
  const jobTitle=document.getElementById('applied-job-title').textContent;
  closeOv('applied-modal');
  openChat(taskId,jobTitle,posterName,posterId,posterId,posterRating,convId);
}

async function withdrawFromConfirm(){
  const btn=document.getElementById('applied-withdraw-btn');
  const taskId=btn.dataset.taskId;
  if(!sb||!me||!taskId)return;
  const pid=myProfileId||me.id;
  const{data:app}=await sb.from('applications').select('id').eq('task_id',taskId).eq('applicant_id',pid).maybeSingle();
  if(!app)return toast('❌ Application not found');
  const{error}=await sb.from('applications').update({status:'withdrawn'}).eq('id',app.id);
  if(error)return toast('❌ '+error.message);
  // archive conversation and send system message
  const{data:conv}=await sb.from('conversations').select('id').eq('task_id',taskId).eq('applicant_id',pid).eq('status','active').maybeSingle();
  if(conv){
    const{data:taskData}=await sb.from('tasks').select('poster_id').eq('id',taskId).single();
    const name=(await getMyName())||'Someone';
    await closeConversation(conv.id,taskId,pid,taskData?.poster_id,`↩️ ${name} withdrew their interest.`);
  }
  closeOv('applied-modal');
  toast('↩️ Interest withdrawn');loadJobs();loadMyJobs();loadMessages();
}

async function withdrawApplication(appId){
  if(!sb||!me)return;
  const pid=myProfileId||me.id;
  // look up application to get task_id and poster
  const{data:appData}=await sb.from('applications').select('task_id').eq('id',appId).single();
  if(!appData)return toast('❌ Could not find application');
  const taskId=appData.task_id;
  const{error}=await sb.from('applications').update({status:'withdrawn'}).eq('id',appId);
  if(error)return toast('❌ '+error.message);
  // archive conversation and send system message
  const{data:conv}=await sb.from('conversations').select('id').eq('task_id',taskId).eq('applicant_id',pid).eq('status','active').maybeSingle();
  if(conv){
    const{data:taskData}=await sb.from('tasks').select('poster_id').eq('id',taskId).single();
    const name=(await getMyName())||'Someone';
    await closeConversation(conv.id,taskId,pid,taskData?.poster_id,`↩️ ${name} withdrew their interest.`);
  }
  closeOv('modal');
  toast('↩️ Interest withdrawn');loadJobs();loadMyJobs();loadMessages();
}

async function openApplicants(taskId,taskTitle){
  closeOv('modal');
  document.getElementById('applicants-job-title').textContent=taskTitle;
  openOv('applicants-modal');
  const el=document.getElementById('applicants-list');
  el.innerHTML=spin();
  if(!sb)return;
  // fetch pending applications with applicant profiles
  const{data,error}=await sb.from('applications')
    .select('id,applicant_id,status,created_at,profiles!applications_applicant_id_fkey(id,name,rating,bio,avatar_color)')
    .eq('task_id',taskId)
    .eq('status','pending')
    .order('created_at',{ascending:true});
  if(error){el.innerHTML=emptyState('😕','Error',error.message);return;}
  if(!data?.length){el.innerHTML=emptyState('👀','No applicants yet','Share your job to get more interest');return;}
  el.innerHTML=data.map(app=>{
    const p=app.profiles||{};
    const name=p.name||'Someone';
    const rating=p.rating?`★ ${p.rating}`:'New';
    const bio=p.bio?`<div style="font-size:13.5px;color:var(--text2);margin:4px 0 8px;line-height:1.4">${esc(p.bio)}</div>`:'';
    return `<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:14px;margin-bottom:10px;border:1.5px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:8px">
          <div onclick="openOtherProfile('${app.applicant_id}')" style="cursor:pointer;flex-shrink:0">${avatarCircle(name,p.avatar_color,'42px','17px')}</div>
          <div>
            <div style="font-size:15px;font-weight:800">${esc(name)}</div>
            <div style="font-size:13.5px;color:var(--yellow);font-weight:800">${rating}</div>
          </div>
        </div>
        <div style="font-size:12.5px;color:var(--muted)">${timeAgo(app.created_at)}</div>
      </div>
      ${bio}
      <div style="display:flex;gap:8px;margin-top:8px">
        <button onclick="openChatWithApplicant('${taskId}','${esc(name)}','${app.applicant_id}')" style="flex:1;padding:10px;border-radius:var(--radius-sm);background:var(--surface);border:1.5px solid var(--border);color:var(--text);font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">Chat</button>
        <button onclick="assignApplicant('${taskId}','${app.id}','${app.applicant_id}','${esc(name)}')" style="flex:1;padding:10px;border-radius:var(--radius-sm);background:linear-gradient(135deg,var(--btn-a),var(--btn-b));border:none;color:#fff;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">✅ Assign</button>
      </div>
    </div>`;
  }).join('');
}

async function openChatWithApplicant(taskId,applicantName,applicantId){
  closeOv('applicants-modal');
  openChat(taskId,document.getElementById('applicants-job-title').textContent,applicantName,myProfileId||me.id,applicantId);
}

async function assignApplicant(taskId,appId,applicantId,applicantName){
  if(!sb||!me)return;
  const pid=myProfileId||me.id;
  // update task to claimed
  const{error}=await sb.from('tasks').update({status:'claimed',doer_id:applicantId}).eq('id',taskId);
  if(error)return toast('❌ '+error.message);
  // mark this application assigned
  await sb.from('applications').update({status:'assigned'}).eq('id',appId);
  // reject other pending applicants
  const{data:others}=await sb.from('applications').select('id,applicant_id').eq('task_id',taskId).eq('status','pending').neq('id',appId);
  for(const other of (others||[])){
    await sb.from('applications').update({status:'rejected'}).eq('id',other.id);
    // find their conversation and send notification, then archive
    const{data:conv}=await sb.from('conversations').select('id').eq('task_id',taskId).eq('applicant_id',other.applicant_id).eq('status','active').maybeSingle();
    if(conv){
      await sb.from('messages').insert({conversation_id:conv.id,task_id:taskId,sender_id:pid,receiver_id:other.applicant_id,body:`Thanks for your interest — someone else was selected for this job.`});
    }
  }
  // archive losing conversations
  await sb.rpc('archive_losing_conversations',{p_task_id:taskId,p_keep_applicant_id:applicantId});
  // send confirmation to assigned applicant via their conversation
  const{data:winConv}=await sb.from('conversations').select('id').eq('task_id',taskId).eq('applicant_id',applicantId).eq('status','active').maybeSingle();
  if(winConv){
    await sb.from('messages').insert({conversation_id:winConv.id,task_id:taskId,sender_id:pid,receiver_id:applicantId,body:`🎉 Great news, ${applicantName}! You've been selected for this job. Let's coordinate the details.`});
  }
  closeOv('applicants-modal');
  toast(`✅ ${applicantName} assigned!`);
  loadJobs();loadMessages();loadMyJobs();
}

async function unclaimJob(){
  if(!sb||!me)return;
  const pid=myProfileId||me.id;
  const name=(await getMyName())||'Someone';
  const doerId=activeJob.doer_id;
  const{error}=await sb.from('tasks').update({status:'open',doer_id:null}).eq('id',activeJob.id);
  if(error)return toast('❌ '+error.message);
  if(doerId){
    await sb.from('applications').update({status:'withdrawn'}).eq('task_id',activeJob.id).eq('applicant_id',doerId);
    // send notification via conversation then archive it
    const{data:conv}=await sb.from('conversations').select('id').eq('task_id',activeJob.id).eq('applicant_id',doerId).eq('status','active').maybeSingle();
    if(conv){
      await closeConversation(conv.id,activeJob.id,pid,doerId,`↩️ ${name} unclaimed this job. It's back to open.`);
    }
  }
  closeOv('modal');
  toast('↩️ Job unclaimed');loadJobs();loadMyJobs();
}
