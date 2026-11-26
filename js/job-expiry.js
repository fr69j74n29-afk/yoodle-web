// "How long should your job stay up?" — Post a Job, Edit Job and Renew. Classic script (see js/README.md); defines functions only.
// Two options (Roman, 26 Nov): 2 weeks (default, max) or Pick an end date (tomorrow … 14 days; ends 11:59 pm that day).
// Edit adds "Keep {date}" while the job is still up. Helpers never see the date — it only decides when the job leaves the map.
// Picking a date sets tasks.end_date_chosen = true → renew email/push/link opens Edit to pick a new date instead of one-tap 14 days.
// No library needed (native <input type="date">; min/max are clamped here because iOS Safari doesn't enforce them).
// iOS shows an EMPTY date field as a blank box (and its picker jumps to the min day), so "Pick an end date"
// always pre-fills a starting day (JOB_PICK_DEFAULT_DAYS) that the poster then changes.

const JOB_MAX_DAYS=14;
const JOB_REMIND_MIN_DAYS=7;
const JOB_PICK_DEFAULT_DAYS=7; // starting day shown when "Pick an end date" opens // shorter runs skip the "expires soon" email (send_expiry_reminders)
const _jx={}; // per picker: {sel:'d14'|'pick'|'keep', date:Date|null, keep:Date|null}

function _jxEnd(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,0,0);}
function _jxAddDays(n){const d=new Date();d.setDate(d.getDate()+n);return _jxEnd(d);}
function _jxYmd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function _jxLabel(d){return d.toLocaleDateString('en-CA',{weekday:'short',month:'short',day:'numeric'});}

// Render into <div id="{id}">. opts.keep: current end date (Edit). opts.pick: open "Pick an end date" first
// (a job whose poster chose a date, renewed or edited after it ended).
function jobExpiryRender(id,opts){
  opts=opts||{};
  const el=document.getElementById(id);if(!el)return;
  const keep=opts.keep&&new Date(opts.keep)>new Date()?new Date(opts.keep):null;
  _jx[id]={sel:keep?'keep':(opts.pick?'pick':'d14'),date:null,keep};
  const chip=(k,label)=>`<button type="button" class="jx-chip" data-k="${k}" onclick="jobExpiryPick('${id}','${k}')">${label}</button>`;
  el.innerHTML=`<div class="jx-chips">
      ${keep?chip('keep','Keep current date'):''}
      ${chip('d14','2 weeks')}
      ${chip('pick','Pick an end date')}
    </div>
    <input type="date" class="form-inp jx-date" id="${id}-date" style="display:none;margin-top:8px;min-height:46px;text-align:left;-webkit-appearance:none;appearance:none"
      min="${_jxYmd(_jxAddDays(1))}" max="${_jxYmd(_jxAddDays(JOB_MAX_DAYS))}" onchange="jobExpiryDate('${id}',this.value)">
    <div class="jx-note" id="${id}-note"></div>`;
  if(_jx[id].sel==='pick')_jxOpenDate(id);
  _jxPaint(id);
}

function jobExpiryPick(id,k){
  const s=_jx[id];if(!s)return;
  s.sel=k;s.warn='';
  const inp=document.getElementById(id+'-date');
  if(k==='pick')_jxOpenDate(id,true); // tap → open the calendar right away
  else inp.style.display='none';
  _jxPaint(id);
}
// Show the date field with a day already in it (never blank on iOS).
// openNow (only from a tap — browsers require a user gesture): open the calendar straight away.
//   showPicker() opens it on desktop/Android/macOS Safari; iPhone Safari has no showPicker() for dates
//   (webkit.org/b/261703), but its picker opens on focus, so focus() covers iOS. Same tick as the tap.
function _jxOpenDate(id,openNow){
  const s=_jx[id],inp=document.getElementById(id+'-date');if(!s||!inp)return;
  if(!s.date)s.date=_jxAddDays(JOB_PICK_DEFAULT_DAYS);
  inp.value=_jxYmd(s.date);
  inp.style.display='block';
  if(!openNow)return;
  try{inp.focus({preventScroll:true});}catch(e){}
  try{if(typeof inp.showPicker==='function')inp.showPicker();}catch(e){} // throws where unsupported/not allowed — focus already done
}
function jobExpiryDate(id,v){
  const s=_jx[id];if(!s)return;
  if(!v){s.date=null;return _jxPaint(id);}
  const[y,m,d]=v.split('-').map(Number);
  let dt=_jxEnd(new Date(y,m-1,d));
  const min=_jxAddDays(1),max=_jxAddDays(JOB_MAX_DAYS);
  // iPhone's calendar lets you tap days outside min/max, so say what happened instead of silently changing it
  s.warn='';
  if(dt<min){dt=min;s.warn=`The earliest is tomorrow — set to ${_jxLabel(dt)}.`;}
  if(dt>max){dt=max;s.warn=`That's more than 2 weeks away — set to ${_jxLabel(dt)}, the latest you can pick.`;}
  if(s.warn)toast('📅 '+s.warn);
  s.date=dt;document.getElementById(id+'-date').value=_jxYmd(dt);
  _jxPaint(id);
}
function _jxPaint(id){
  const s=_jx[id],el=document.getElementById(id);if(!s||!el)return;
  el.querySelectorAll('.jx-chip').forEach(b=>b.classList.toggle('on',b.dataset.k===s.sel));
  const d=jobExpiryValue(id),note=document.getElementById(id+'-note');
  if(!note)return;
  const latest=_jxLabel(_jxAddDays(JOB_MAX_DAYS));
  if(!d){note.textContent=`Pick a day — latest ${latest} (2 weeks).`;return;}
  note.innerHTML=`📅 Comes off the map after <strong>${_jxLabel(d)}</strong>`
    +(s.sel==='pick'?`<br><span class="jx-max">You can pick up to 2 weeks out — latest <strong>${latest}</strong>.</span>`:'')
    +(s.sel==='pick'&&s.warn?`<br><span class="jx-warn">${esc(s.warn)}</span>`:'');
}

// Chosen end Date, or null ("Pick an end date" with no day yet).
function jobExpiryValue(id){
  const s=_jx[id];if(!s)return _jxAddDays(JOB_MAX_DAYS);
  if(s.sel==='keep')return s.keep;
  if(s.sel==='pick')return s.date;
  return _jxAddDays(JOB_MAX_DAYS);
}
function jobExpiryChanged(id){const s=_jx[id];return !!s&&s.sel!=='keep';}
function jobExpiryPicked(id){const s=_jx[id];return !!s&&s.sel==='pick';}

// Columns to save. chosen = poster picked a date (vs 2 weeks). Short runs mark the reminder as sent (no "expires soon" email).
function jobExpiryFields(d,chosen){
  const f={expires_at:d.toISOString(),end_date_chosen:!!chosen};
  if(d-Date.now()<JOB_REMIND_MIN_DAYS*864e5)f.expiry_reminder_for=f.expires_at;
  return f;
}
function jobExpiryShort(d){return d.toLocaleDateString('en-CA',{weekday:'short',month:'short',day:'numeric'});}

// ── Renew sheet (Activity: expired / paused cards). chosen: the job had a picked end date → open "Pick an end date". ──
function openRenewSheet(jobId,chosen){
  document.getElementById('renew-job-id').value=jobId;
  jobExpiryRender('renew-exp',{pick:!!chosen});
  openOv('renew-modal');
}
async function confirmRenew(){
  const id=document.getElementById('renew-job-id').value;
  const d=jobExpiryValue('renew-exp');
  if(!d)return toast('Pick the last day for your job');
  const b=document.getElementById('renew-btn');b.disabled=true;
  try{await renewJob(id,d,jobExpiryPicked('renew-exp'));closeOv('renew-modal');}finally{b.disabled=false;}
}
