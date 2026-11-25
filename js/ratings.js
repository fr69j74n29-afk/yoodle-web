// Ratings: sheet, stars, saving.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

async function checkAndRate(taskId,ratedId,prompt){
  if(!sb||!me)return;
  const pid=myProfileId||me.id;
  const{data}=await sb.from('ratings').select('id').eq('task_id',taskId).eq('rater_id',pid).maybeSingle();
  if(data){toast('✅ Already rated!');return;}
  openRatingModal(taskId,ratedId,prompt);
}

// old functions kept as no-ops to avoid any stale references

function openRatingModal(taskId, ratedId, prompt){
  ratingTaskId=taskId;ratingRatedId=ratedId;selectedRating=0;
  document.getElementById('rating-prompt').textContent=prompt;
  document.getElementById('rating-submit-btn').disabled=true;
  renderStars(0);
  openOv('rating-modal');
}

function setRating(n){
  selectedRating=n;
  renderStars(n);
  document.getElementById('rating-submit-btn').disabled=false;
}

function renderStars(n){
  const stars=document.getElementById('rating-stars').querySelectorAll('svg');
  stars.forEach((s,i)=>s.setAttribute('class',i<n?'star-on':'star-off'));
}

async function loadPendingRatings(){
  if(!sb||!me)return;
  const pid=myProfileId||me.id;
  const now=new Date().toISOString();

  // Server-side: fetch completed tasks where user was poster OR doer, not yet rated
  const[{data:postedCompleted},{data:helpedCompleted},{data:alreadyRated}]=await Promise.all([
    sb.from('tasks').select('id,title,price,doer_id')
      .eq('poster_id',pid).eq('status','completed').not('doer_id','is',null),
    sb.from('tasks').select('id,title,price,poster_id,profiles!tasks_poster_id_fkey(name)')
      .eq('doer_id',pid).eq('status','completed'),
    sb.from('ratings').select('task_id').eq('rater_id',pid)
  ]);

  // look up doer names separately
  const doerIds=[...new Set((postedCompleted||[]).map(t=>t.doer_id).filter(Boolean))];
  const doerNames={};
  if(doerIds.length){
    const{data:doerProfiles}=await sb.from('profiles').select('id,name').in('id',doerIds);
    (doerProfiles||[]).forEach(p=>doerNames[p.id]=p.name);
  }

  const ratedIds=new Set((alreadyRated||[]).map(r=>r.task_id));

  // Build pending list — exclude already rated
  const pending=[];
  (postedCompleted||[]).forEach(t=>{
    if(!ratedIds.has(t.id)) pending.push({taskId:t.id,title:t.title,price:t.price,ratedId:t.doer_id,otherName:doerNames[t.doer_id]||'Helper',role:'poster',prompt:'How did the helper do?'});
  });
  (helpedCompleted||[]).forEach(t=>{
    if(!ratedIds.has(t.id)) pending.push({taskId:t.id,title:t.title,price:t.price,ratedId:t.poster_id,otherName:t.profiles?.name||'Poster',role:'doer',prompt:'How was the job poster?'});
  });

  // Update badge
  const badge=document.getElementById('rating-badge');
  if(badge){
    if(pending.length>0){badge.style.display='inline';badge.textContent=pending.length;}
    else{badge.style.display='none';}
  }
  return pending;
}

async function openRatingsSheet(){
  openOv('ratings-sheet');
  const el=document.getElementById('ratings-sheet-list');
  el.innerHTML=spin();
  const pending=await loadPendingRatings();
  if(!pending.length){
    el.innerHTML=emptyState('⭐','All caught up!','No pending ratings — nice work!');
    return;
  }
  el.innerHTML=pending.map((item,idx)=>`
    <div id="rating-item-${idx}" style="background:var(--surface);border-radius:var(--radius-sm);border:1.5px solid var(--border);padding:16px;margin-bottom:12px">
      <div style="font-size:15px;font-weight:800;margin-bottom:2px">${esc(item.title)}</div>
      <div style="font-size:13.5px;color:var(--muted);font-weight:700;margin-bottom:12px">${item.role==='poster'?'You posted':'You helped'} · ${item.otherName}${item.price?' · $'+item.price:''}</div>
      <div style="font-size:13.5px;font-weight:800;color:var(--muted);margin-bottom:8px">${esc(item.prompt)}</div>
      <div style="display:flex;gap:8px;justify-content:center;margin-bottom:12px" id="stars-${idx}">
        ${[1,2,3,4,5].map(n=>`<span style="font-size:32px;cursor:pointer" onclick="setSheetRating(${idx},${n},'${item.taskId}','${item.ratedId}')" id="star-${idx}-${n}">☆</span>`).join('')}
      </div>
      <button id="submit-${idx}" onclick="submitSheetRating(${idx},'${item.taskId}','${item.ratedId}')"
        style="width:100%;padding:12px;border-radius:var(--radius-sm);background:linear-gradient(135deg,var(--btn-a),var(--btn-b));border:none;color:#fff;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer;opacity:.4" disabled>
        Submit Rating
      </button>
    </div>`).join('');
}

const sheetRatings={};
function setSheetRating(idx,score,taskId,ratedId){
  sheetRatings[idx]=score;
  for(let n=1;n<=5;n++){
    const s=document.getElementById(`star-${idx}-${n}`);
    if(s)s.textContent=n<=score?'★':'☆';
  }
  const btn=document.getElementById(`submit-${idx}`);
  if(btn){btn.disabled=false;btn.style.opacity='1';}
}

// Shared by the rating popup and the pending-ratings sheet.
// Returns 'ok', 'dup' (already rated — unique violation 23505) or an error message.
async function saveRating(taskId,ratedId,score){
  const pid=myProfileId||me.id;
  const{error}=await sb.from('ratings').insert({task_id:taskId,rater_id:pid,rated_id:ratedId,score});
  if(error)return error.code==='23505'?'dup':(error.message||'Could not save rating');
  await sb.rpc('update_profile_rating',{profile_id:ratedId});
  return 'ok';
}

async function submitSheetRating(idx,taskId,ratedId){
  const score=sheetRatings[idx];
  if(!score||!sb||!me)return;
  const btn=document.getElementById(`submit-${idx}`);
  if(btn){btn.disabled=true;btn.textContent='Saving…';}
  const res=await saveRating(taskId,ratedId,score);
  if(res!=='ok'){
    if(btn){btn.disabled=false;btn.textContent='Submit Rating';}
    toast(res==='dup'?'✅ Already rated!':'❌ '+res);
    return;
  }
  // remove item from sheet
  const item=document.getElementById(`rating-item-${idx}`);
  if(item)item.remove();
  toast('⭐ Rating submitted!');
  // refresh badge + check if sheet is empty
  const pending=await loadPendingRatings();
  if(!pending.length){
    document.getElementById('ratings-sheet-list').innerHTML=emptyState('⭐','All caught up!','No pending ratings — nice work!');
  }
}

async function submitRating(){
  if(!selectedRating||!ratingTaskId||!ratingRatedId||!sb)return;
  const btn=document.getElementById('rating-submit-btn');
  btn.disabled=true;btn.textContent='Saving…';
  const res=await saveRating(ratingTaskId,ratingRatedId,selectedRating);
  if(res!=='ok'){
    btn.disabled=false;btn.textContent='Submit Rating';
    if(res==='dup'){
      closeOv('rating-modal');
      toast('✅ Already rated!');
      loadMyJobs();
    } else {
      toast('❌ '+res);
    }
    return;
  }
  closeOv('rating-modal');
  toast('⭐ Rating submitted!');
  loadMyJobs();
}
