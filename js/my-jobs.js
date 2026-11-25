// My jobs: list, renew, remove, cancel, card menus.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

async function loadMyJobs(){
// Activity: one list — jobs I posted + jobs I'm helping with
  const g=document.getElementById('my-grid');g.innerHTML=spin();
  if(!sb||!me){g.innerHTML=emptyState('🔌','Connect Supabase','Add credentials to see your jobs');return;}
  const pid=myProfileId||me.id;
  const expSince=new Date(Date.now()-30*24*60*60*1000).toISOString();
  const[postedRes,appRes,hoRes,_vs]=await Promise.all([
    // open/claimed + jobs that expired in the last 30 days (so the poster can still see applicants and renew)
    sb.from('tasks').select('*').eq('poster_id',pid).or(`status.in.(open,claimed),and(status.eq.expired,expires_at.gte.${expSince})`).neq('type','admin_note').order('created_at',{ascending:false}),
    // applications by this user with task details
    sb.from('applications').select('id,status,created_at,tasks!inner(*,profiles!tasks_poster_id_fkey(id,name,rating,avatar_color))').eq('applicant_id',pid).in('status',['pending','assigned']).in('tasks.status',['open','claimed']).order('created_at',{ascending:false}),
    // help_offer tasks where I'm the doer
    sb.from('tasks').select('*,profiles!tasks_poster_id_fkey(id,name,rating,avatar_color)').eq('doer_id',pid).eq('type','help_offer').in('status',['claimed']).order('created_at',{ascending:false}),
    loadViewStats() // views per posted job (also refreshes the top-bar badge)
  ]);
  const jobViews=_vs?.jobs||{};
  const err=postedRes.error||appRes.error;
  if(err){g.innerHTML=emptyState('😕','Error',err.message);return;}
  if(hoRes.error)console.warn('help_offer query error:',hoRes.error.message);
  const posted=(postedRes.data||[])
    .filter(j=>j.status!=='expired'||((j.type||'job')==='job'&&!isAgencyJob(j)))
    .sort((a,b)=>(a.status==='expired')-(b.status==='expired'));
  const apps=appRes.data||[], helpOfferTasks=hoRes.data||[];

  if(!posted.length&&!apps.length&&!helpOfferTasks.length){g.innerHTML=emptyState('📋','Nothing here yet','Post a job, or browse the map to find one to help with.');return;}

  // posted jobs: doer names and applicant counts
  let doerNames={};
  let applicantCounts={};
  const claimedJobs=posted.filter(j=>j.status==='claimed'&&j.doer_id);
  const openJobs=posted.filter(j=>j.status==='open'||j.status==='expired');
  await Promise.all([
    claimedJobs.length?sb.from('profiles').select('id,name').in('id',[...new Set(claimedJobs.map(j=>j.doer_id))]).then(({data:doerData})=>{(doerData||[]).forEach(p=>doerNames[p.id]=p.name);}):null,
    openJobs.length?sb.from('applications').select('task_id').eq('status','pending').in('task_id',openJobs.map(j=>j.id)).then(({data:appData})=>{(appData||[]).forEach(a=>{applicantCounts[a.task_id]=(applicantCounts[a.task_id]||0)+1;});}):null
  ]);

  const now=new Date();

  // jobs I'm helping with
  const appCards=apps.map(app=>{
    const j=app.tasks;
    if(!j)return'';
    const cat=(j.category||'other').toLowerCase();
    const color=CAT_COLOR[cat]||'#3D6B50';
    let appBadge,actionBtn='',appMenu='';
    if(app.status==='pending'){
      appBadge=`<span style="color:var(--yellow);font-size:13.5px;font-weight:800">Pending</span>`;
      appMenu=`<div class="card-menu-wrap">
        <button class="card-menu-btn" onclick="event.stopPropagation();toggleCardMenu(event,'cm-app-${app.id}')" aria-label="More options">⋮</button>
        <div class="card-menu-drop" id="cm-app-${app.id}">
          <button class="destructive" onclick="event.stopPropagation();closeAllCardMenus();openCancelConfirm('${app.id}','withdraw')">Withdraw Interest</button>
        </div>
      </div>`;
    } else if(app.status==='assigned'){
      appBadge=`<span style="color:var(--teal);font-size:13.5px;font-weight:800">Assigned</span>`;
      appMenu=`<div class="card-menu-wrap">
        <button class="card-menu-btn" onclick="event.stopPropagation();toggleCardMenu(event,'cm-app-${app.id}')" aria-label="More options">⋮</button>
        <div class="card-menu-drop" id="cm-app-${app.id}">
          <button class="destructive" onclick="event.stopPropagation();closeAllCardMenus();openCancelConfirm('${j.id}','unclaim')">Unclaim</button>
        </div>
      </div>`;
      actionBtn=`<div style="display:flex;gap:8px;margin-top:10px">
        <button onclick="event.stopPropagation();openChat('${j.id}','${esc(j.title)}','${esc(j.profiles?.name||'Poster')}','${j.poster_id}','${j.poster_id}','${j.profiles?.rating||''}')" style="flex:1;padding:11px;border-radius:var(--radius-sm);background:var(--surface2);border:1.5px solid var(--border);color:var(--text);font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">Chat</button>
      </div>`;
    }
    return `<div class="job-card" style="--jc:${color};cursor:default;overflow:visible">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        ${appBadge||''}
        ${appMenu}
      </div>
      <div class="jc-top"><div class="jc-title">${esc(j.title)}</div><div class="jc-budget">$${j.price??'?'}</div></div>
      <div class="jc-desc">${esc(j.description||'')}</div>
      ${actionBtn}
    </div>`;
  }).join('');

  // render help_offer tasks (direct contacts where I'm the helper)
  const hoCards=helpOfferTasks.map(j=>{
    const color=CAT_COLOR['other']||'#3D6B50';
    const posterName=j.profiles?.name||'Neighbour';
    return `<div class="job-card" style="--jc:${color};cursor:default;overflow:visible">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="color:var(--teal);font-size:13.5px;font-weight:800">Help Request</span>
        <div class="card-menu-wrap">
          <button class="card-menu-btn" onclick="event.stopPropagation();toggleCardMenu(event,'cm-ho-${j.id}')" aria-label="More options">⋮</button>
          <div class="card-menu-drop" id="cm-ho-${j.id}">
            <button class="destructive" onclick="event.stopPropagation();closeAllCardMenus();openCancelConfirm('${j.id}','help_offer')">Decline</button>
          </div>
        </div>
      </div>
      <div class="jc-top"><div class="jc-title">${esc(j.title)}</div></div>
      <div class="jc-desc">${esc(j.description||'')}</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button onclick="event.stopPropagation();openChat('${j.id}','${esc(j.title)}','${esc(posterName)}','${j.poster_id}','${j.poster_id}','${j.profiles?.rating||''}')" style="flex:1;padding:11px;border-radius:var(--radius-sm);background:var(--surface2);border:1.5px solid var(--border);color:var(--text);font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">Chat</button>
      </div>
    </div>`;
  }).join('');


  // jobs I posted
  const data2=posted.map(j=>({...j,category:(j.category||'other').toLowerCase()}));
  const postedCards=data2.map(j=>{
    const color=CAT_COLOR[j.category]||'#3D6B50';
    const daysLeft=j.expires_at?Math.ceil((new Date(j.expires_at)-now)/(1000*60*60*24)):null;

    const gpsTag=j.status==='open'?(j.location_verified?` · <span style="color:var(--lime);font-size:12.5px;font-weight:800">GPS</span>`:` · <span style="color:var(--yellow);font-size:12.5px;font-weight:800">⚠️ Unverified</span>`):'';
    let statusBadge;
    if(j.status==='claimed') statusBadge=`<span style="color:var(--teal);font-size:13.5px;font-weight:800">Active</span>`;
    else if(j.status==='expired') statusBadge=`<span style="color:var(--muted);font-size:13.5px;font-weight:800">Expired${j.expires_at?' '+new Date(j.expires_at).toLocaleDateString('en-CA',{month:'short',day:'numeric'}):''}</span>`;
    else statusBadge=`<span style="color:var(--lime);font-size:13.5px;font-weight:800">Open${daysLeft!==null?` · ${daysLeft}d left`:''}${gpsTag}</span>`;

    let actionBtn='';
    let cardMenu='';
    if(j.status==='open'){
      const appCount=applicantCounts[j.id]||0;
      const appBadge=appCount>0?`<div style="margin-top:8px;padding:8px 12px;background:rgba(92,138,106,.08);border:1.5px solid rgba(92,138,106,.20);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:14px;font-weight:800;color:var(--purple)">${appCount} interested</span>
        <button onclick="event.stopPropagation();openApplicants('${j.id}','${esc(j.title)}')" style="padding:6px 14px;border-radius:100px;background:var(--btn-a);border:none;color:#fff;font-family:'Nunito',sans-serif;font-size:13.5px;font-weight:800;cursor:pointer">Review →</button>
      </div>`:'';
      cardMenu=`<div class="card-menu-wrap">
        <button class="card-menu-btn" onclick="event.stopPropagation();toggleCardMenu(event,'cm-${j.id}')" aria-label="More options">⋮</button>
        <div class="card-menu-drop" id="cm-${j.id}">
          <button onclick="event.stopPropagation();closeAllCardMenus();openEditModal('${j.id}')">Edit</button>
          <div class="menu-divider"></div>
          <button class="destructive" onclick="event.stopPropagation();closeAllCardMenus();openCancelConfirm('${j.id}')">Cancel Job</button>
        </div>
      </div>`;
      actionBtn=appBadge;
    } else if(j.status==='expired'){
      // Expired: no map pin. Renew puts it back up for 14 days; Review still shows who was interested.
      // data- attributes + one delegated listener (see bindMyJobsActions) — no inline onclick strings.
      const appCount=applicantCounts[j.id]||0;
      actionBtn=`<div style="margin-top:8px;font-size:13.5px;color:var(--text2)">Not on the map any more.${appCount>0?` <strong style="color:var(--purple)">${appCount} interested</strong> — renew to chat with them.`:''}</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button data-act="renew" data-id="${esc(j.id)}" style="flex:1;padding:11px;border-radius:var(--radius-sm);background:linear-gradient(135deg,var(--btn-a),var(--btn-b));border:none;color:#fff;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">🔄 Renew 14 days</button>
        ${appCount>0?`<button data-act="review" data-id="${esc(j.id)}" data-title="${esc(j.title||'')}" style="flex:1;padding:11px;border-radius:var(--radius-sm);background:var(--surface2);border:1.5px solid var(--border);color:var(--text);font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">Review →</button>`:''}
      </div>`;
    } else if(j.status==='claimed'){
      const doerName=doerNames[j.doer_id]||'Helper';
      if(isHelperContact(j)){
        cardMenu=`<div class="card-menu-wrap">
          <button class="card-menu-btn" onclick="event.stopPropagation();toggleCardMenu(event,'cm-${j.id}')" aria-label="More options">⋮</button>
          <div class="card-menu-drop" id="cm-${j.id}">
            <button class="destructive" onclick="event.stopPropagation();closeAllCardMenus();openCancelConfirm('${j.id}','help_offer')">Cancel</button>
          </div>
        </div>`;
        actionBtn=`<div style="display:flex;gap:8px;margin-top:10px">
          <button onclick="event.stopPropagation();tapConfirm(this,'Tap again to complete',()=>chatComplete('${j.id}','${j.doer_id}'))" style="flex:1;padding:11px;border-radius:var(--radius-sm);background:linear-gradient(135deg,var(--btn-a),var(--btn-b));border:none;color:#fff;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">✅ Complete</button>
        </div>`;
      } else {
        cardMenu=`<div class="card-menu-wrap">
          <button class="card-menu-btn" onclick="event.stopPropagation();toggleCardMenu(event,'cm-${j.id}')" aria-label="More options">⋮</button>
          <div class="card-menu-drop" id="cm-${j.id}">
            <button class="destructive" onclick="event.stopPropagation();closeAllCardMenus();openCancelConfirm('${j.id}','unclaim')">Unclaim</button>
          </div>
        </div>`;
        actionBtn=`<div style="display:flex;gap:8px;margin-top:10px">
          <button onclick="event.stopPropagation();openChat('${j.id}','${esc(j.title)}','${esc(doerName)}','${j.poster_id}','${j.doer_id}')" style="flex:1;padding:11px;border-radius:var(--radius-sm);background:var(--surface2);border:1.5px solid var(--border);color:var(--text);font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">Chat</button>
          <button onclick="event.stopPropagation();tapConfirm(this,'Tap again to complete',()=>chatComplete('${j.id}','${j.doer_id}'))" style="flex:1;padding:11px;border-radius:var(--radius-sm);background:linear-gradient(135deg,var(--btn-a),var(--btn-b));border:none;color:#fff;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer">✅ Complete</button>
        </div>`;
      }
    }

    return `<div class="job-card" style="--jc:${color};cursor:default;${cardMenu?'overflow:visible':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        ${statusBadge}
        ${cardMenu}
      </div>
      <div class="jc-top"><div class="jc-title">${esc(j.title)}</div><div class="jc-budget">$${j.price??'?'}</div></div>
      <div class="jc-desc">${esc(j.description||'')}</div>
      ${(j.status==='open'||j.status==='expired')&&jobViews[j.id]!=null?`<div class="jc-views">${EYE_SVG}${jobViews[j.id]} ${jobViews[j.id]===1?'view':'views'}</div>`:''}
      ${actionBtn}
    </div>`;
  }).join('');

  const helpingCards=appCards+hoCards;
  bindMyJobsActions(g);
  g.innerHTML=(postedCards?`<div class="act-h">Jobs you posted</div>`+postedCards:'')
    +(helpingCards?`<div class="act-h">Jobs you're helping with</div>`+helpingCards:'')
    ||emptyState('📋','Nothing here yet','Post a job, or browse the map to find one to help with.');
}

// One delegated click listener for Activity card buttons that use data-act (expired cards: Renew / Review).
function bindMyJobsActions(g){
  if(!g||g._myJobsBound)return;
  g._myJobsBound=true;
  g.addEventListener('click',e=>{
    const b=e.target.closest('button[data-act]');
    if(!b||!g.contains(b))return;
    e.stopPropagation();
    const id=b.dataset.id;
    if(b.dataset.act==='renew'){b.disabled=true;renewJob(id).finally(()=>{b.disabled=false;});}
    else if(b.dataset.act==='review')openApplicants(id,b.dataset.title||'');
  });
}

async function renewJob(jobId){
  if(!sb||!me)return;
  const expiresAt=new Date(Date.now()+14*24*60*60*1000).toISOString();
  const{error}=await sb.from('tasks').update({expires_at:expiresAt,status:'open',expired_push_at:null}).eq('id',jobId).eq('poster_id',myProfileId||me.id);
  if(error)return toast('❌ '+error.message);
  toast('🔄 Job renewed for 14 days!');loadMyJobs();loadJobs();
}

// One-tap renew from the expiry reminder email / expired push.
// renew_by_token() checks the token in the database, so it works whether or not the user is signed in.
async function handleRenewLink(token){
  window._renewToken=null;
  try{
    const{data,error}=await sb.rpc('renew_by_token',{p_token:token});
    if(error||!data)throw error||new Error('no result');
    if(data.ok){
      const until=new Date(data.expires_at).toLocaleDateString('en-CA',{month:'short',day:'numeric'});
      showRenewNote(data.kind==='job'
        ?`✅ "${data.title}" is back up for neighbours until ${until}.`
        :`✅ You're listed as a helper until ${until}.`);
      if(me){loadJobs();if(typeof loadMyJobs==='function')loadMyJobs();}
    }else if(data.reason==='closed'){
      showRenewNote('This job is already closed, so it can\'t be renewed. You can post a new one any time.');
    }else{
      showRenewNote('This renew link has expired. Sign in and renew from My Jobs or your Helper Profile.');
    }
  }catch(e){
    console.warn('renew link',e);
    showRenewNote('❌ Could not renew right now — please try the link again in a minute.');
  }
}
function showRenewNote(msg){
  // longer than toast() (2.8 s) so it can be read after opening from an email
  const t=document.getElementById('toast');if(!t)return;
  t.textContent=msg;t.classList.add('show');
  clearTimeout(window._renewNoteT);window._renewNoteT=setTimeout(()=>t.classList.remove('show'),6000);
}

async function removeJob(jobId){
  if(!sb||!me)return;
  const{error}=await sb.from('tasks').update({status:'cancelled'}).eq('id',jobId).eq('poster_id',myProfileId||me.id);
  if(error)return toast('❌ '+error.message);
  toast('🗑️ Job removed.');loadMyJobs();loadJobs();
}

async function cancelJob(jobId){
  if(!sb||!me)return;
  const{error}=await sb.from('tasks').update({status:'cancelled'}).eq('id',jobId).eq('poster_id',myProfileId||me.id);
  if(error)return toast('❌ '+error.message);
  toast('🗑️ Job cancelled.');loadMyJobs();loadJobs();
}

/* ── Card 3-dot menu helpers ── */
function toggleCardMenu(e,menuId){
  e.stopPropagation();
  const menu=document.getElementById(menuId);
  if(!menu)return;
  const wasOpen=menu.classList.contains('open');
  closeAllCardMenus();
  if(!wasOpen)menu.classList.add('open');
}
function closeAllCardMenus(){document.querySelectorAll('.card-menu-drop.open').forEach(m=>m.classList.remove('open'));}
document.addEventListener('click',()=>closeAllCardMenus());

// Shared "tap again to confirm" for risky buttons (complete / unclaim / withdraw / cancel / decline / pause).
// 1st tap arms the button; 2nd tap (after 450 ms, within 4 s) runs the action; faster taps are ignored.
function tapConfirm(btn,prompt,action){
  const armed=+btn.dataset.armedAt||0,now=Date.now();
  if(armed&&now-armed<450)return;
  if(armed){tapConfirmReset(btn);return action();}
  btn.dataset.tcLabel=btn.innerHTML;
  btn.dataset.armedAt=now;
  btn.innerHTML=prompt;
  btn.classList.add('tc-armed');
  btn._tcTimer=setTimeout(()=>tapConfirmReset(btn),4000);
}
function tapConfirmReset(btn){
  if(!btn||!btn.dataset.armedAt)return;
  clearTimeout(btn._tcTimer);
  btn.innerHTML=btn.dataset.tcLabel;
  delete btn.dataset.armedAt;
  btn.classList.remove('tc-armed');
}

function openCancelConfirm(id,type){
  type=type||'job';
  document.getElementById('cancel-confirm-job-id').value=id;
  document.getElementById('cancel-confirm-type').value=type;
  const t=document.getElementById('cancel-confirm-title');
  const d=document.getElementById('cancel-confirm-desc');
  const b=document.getElementById('cancel-confirm-btn');
  if(type==='help_offer'){
    t.textContent='Cancel this help request?';
    d.textContent='This will end the conversation and remove the request. This can\u2019t be undone.';
    b.textContent='Yes, cancel it';
  } else if(type==='unclaim'){
    t.textContent='Unclaim this job?';
    d.textContent='This will return the job to open status and remove the current assignment.';
    b.textContent='Yes, unclaim';
  } else if(type==='withdraw'){
    t.textContent='Withdraw your interest?';
    d.textContent='This will remove your application. You can re-apply later if the job is still open.';
    b.textContent='Yes, withdraw';
  } else {
    t.textContent='Cancel this job?';
    d.textContent='This will remove the job from the map and notify anyone who applied. This can\u2019t be undone.';
    b.textContent='Yes, cancel job';
  }
  openOv('cancel-confirm-modal');
}
async function confirmCancelJob(){
  const id=document.getElementById('cancel-confirm-job-id').value;
  const type=document.getElementById('cancel-confirm-type').value;
  closeOv('cancel-confirm-modal');
  if(!id)return;
  if(type==='help_offer') await cancelHelpOffer(id);
  else if(type==='unclaim') await chatUnclaim(id);
  else if(type==='withdraw') await withdrawApplication(id);
  else await cancelJob(id);
}
