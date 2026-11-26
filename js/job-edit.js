// Edit a posted job.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// Edit Job location: only saved when a suggestion was picked (same rule as Post a Job)
let editLat=null,editLng=null,editLocChanged=false;
const editAddr=makeAddrSearch({sugId:'edit-loc-suggestions',statusId:'edit-loc-status',pickFn:'selectEditLocSuggestion',
  noResults:'No addresses found — try a different search',format:jobAddrFormat});
function onEditLocInput(val){
  editLocChanged=true;editLat=null;editLng=null;
  const st=document.getElementById('edit-loc-status');
  if(val.length>=3){st.textContent='Searching…';st.className='loc-status loading';}
  editAddr.input(val);
}
function selectEditLocSuggestion(i){
  const item=editAddr.item(i);if(!item)return;
  document.getElementById('edit-loc').value=jobAddrText(item);
  editLat=parseFloat(item.lat);editLng=parseFloat(item.lon);
  const st=document.getElementById('edit-loc-status');
  st.innerHTML=`📍 New address: <span style="color:var(--text)">${esc(item.display_name.split(',').slice(0,3).join(',').trim())}</span>`;
  st.className='loc-status manual';
  closeOv('edit-loc-suggestions');
}

async function openEditModal(jobId){
  window._editRenew=null;
  const{data:j,error}=await sb.from('tasks').select('title,description,price,address,expires_at,end_date_chosen').eq('id',jobId).maybeSingle();
  if(error||!j)return toast('❌ Could not load job');
  document.getElementById('edit-job-id').value=jobId;
  document.getElementById('edit-title').value=j.title||'';
  document.getElementById('edit-desc').value=j.description||'';
  document.getElementById('edit-budget').value=j.price??0;
  editLat=null;editLng=null;editLocChanged=false;
  document.getElementById('edit-loc').value=j.address||'';
  const st=document.getElementById('edit-loc-status');
  st.textContent='To move the pin, type the new address and pick it from the suggestions';st.className='loc-status';
  jobExpiryRender('edit-exp',{keep:j.expires_at,pick:!!j.end_date_chosen}); // "Keep current date" while it's up; ended + picked date → "Pick an end date" open
  openOv('edit-modal');
}

async function saveEdit(){
  const jobId=document.getElementById('edit-job-id').value;
  const title=document.getElementById('edit-title').value.trim();
  const desc=document.getElementById('edit-desc').value.trim();
  const budget=document.getElementById('edit-budget').value;
  if(!title)return toast('Title cannot be empty');
  if(!desc)return toast('Description cannot be empty');
  const upd={title,description:desc,price:budget?parseFloat(budget):0};
  if(editLocChanged){
    if(!editLat||!editLng)return toast('⚠️ Please select the new address from the suggestions');
    upd.address=document.getElementById('edit-loc').value.trim();upd.lat=editLat;upd.lng=editLng;upd.location_verified=false;
  }
  // New end date (js/job-expiry.js). Status is not changed here (a paused job stays paused).
  if(jobExpiryChanged('edit-exp')){
    const d=jobExpiryValue('edit-exp');
    if(!d)return toast('Pick the last day for your job');
    Object.assign(upd,jobExpiryFields(d,jobExpiryPicked('edit-exp')),{expired_push_at:null});
  }
  // Opened from the expiry email: saving also puts the job back up — 14 more days unless a date was picked (never shortens it)
  const _rn=window._editRenew&&window._editRenew.id===jobId?window._editRenew:null;
  if(_rn){
    const kept=typeof _jx!=='undefined'&&_jx['edit-exp']&&_jx['edit-exp'].sel==='keep'; // "Keep current date" (only offered while the job is still up)
    if(!upd.expires_at&&!kept){
      const t14=Date.now()+14*24*60*60*1000, cur=_rn.exp?new Date(_rn.exp).getTime():0;
      upd.expires_at=new Date(Math.max(t14,cur)).toISOString();
    }
    upd.status='open';
  }
  const{data:saved,error}=await sb.from('tasks').update(upd).eq('id',jobId).eq('poster_id',myProfileId||me.id).select('id');
  if(error)return toast('❌ '+error.message);
  if(!saved||!saved.length)return toast('❌ Could not save changes — please try again');
  closeOv('edit-modal');
  window._editRenew=null;
  if(sb)sb.rpc('offer_updated',{p_task:jobId}).then(()=>{},()=>{}); // private offer out with a contact: "✏️ Job offer updated" in your chat (no-op otherwise)
  if(_rn)showRenewNote('✅ Job updated — it\'s up for neighbours until '+new Date(upd.expires_at||_rn.exp).toLocaleDateString('en-CA',{month:'short',day:'numeric'})+'.');
  else toast(upd.expires_at?'✅ Job updated — it stays up until '+jobExpiryShort(new Date(upd.expires_at))+'.':'✅ Job updated!');
  loadMyJobs();loadJobs();
}
