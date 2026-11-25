// Referral points, helper landing links, onboarding path.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// ── REFERRAL POINTS SYSTEM ──
let myPoints=0, myRefCode='', myRefCount=0;

// Arrived via a helper page link (?helper=…): once signed in, log the shared-link login
// (share_link_events via log_share_login, once per visitor+helper) and open that helper's profile.
async function handleHelperLanding(){
  if(!sb||!me)return;
  let d=null;
  try{d=JSON.parse(localStorage.getItem('yoodle_helper_land')||'null');localStorage.removeItem('yoodle_helper_land');}catch(e){}
  if(!d||!d.h||Date.now()-(d.ts||0)>7*24*60*60*1000)return;
  const mine=myProfileId||me.id;
  if(d.h===mine)return;
  if(d.s==='share'||d.s==='fwd')fireRpc('log_share_login',{p_helper:d.h,p_src:d.s});
  if(iBlockedIds.has(d.h))return;
  setTimeout(()=>openOtherProfile(d.h,d.s==='pro'?'pro':undefined),900);
}

// Landing choice → profiles.onboard_path (fire-and-forget; the server ignores existing accounts)
function recordOnboardPath(){
  if(!sb||!me)return;
  let d=null;
  try{d=JSON.parse(localStorage.getItem(ONBOARD_KEY)||'null');localStorage.removeItem(ONBOARD_KEY);}catch(e){}
  if(!d||!d.p||Date.now()-(d.ts||0)>24*60*60*1000)return;
  fireRpc('set_onboard_path',{p_path:d.p});
}

async function processReferral(){
  if(!sb||!me)return;
  const refCode=localStorage.getItem('yoodle_ref');
  if(!refCode)return;
  localStorage.removeItem('yoodle_ref');
  try{
    const pid=myProfileId||me.id;
    const{data}=await sb.rpc('process_referral',{ref_code:refCode,new_user_id:pid});
    if(data?.ok){
      toast('🎉 Welcome bonus! You got 10 points!');
      loadPoints();
    }
  }catch(e){console.log('Referral processing:',e);}
}

async function loadPoints(){
  if(!sb||!me)return;
  const pid=myProfileId||me.id;
  try{
    const{data}=await sb.from('profiles').select('points,referral_code').eq('id',pid).maybeSingle();
    if(!data)return;
    myPoints=data.points||0;
    myRefCode=data.referral_code||'';
    // count referrals
    const{count}=await sb.from('referrals').select('id',{count:'exact',head:true}).eq('referrer_id',pid);
    myRefCount=count||0;
    // update UI
    const ptsEl=document.getElementById('inv-pts');
    if(ptsEl)ptsEl.textContent=myPoints;
    const cntEl=document.getElementById('inv-count');
    if(cntEl)cntEl.textContent=myRefCount?("You've invited "+myRefCount+(myRefCount===1?' neighbour.':' neighbours.')):'';
  }catch(e){console.log('loadPoints:',e);}
}

function openReferralModal(){
  // populate modal
  document.getElementById('ref-pts-big').textContent=myPoints;
  document.getElementById('ref-count').textContent=myRefCount;
  document.getElementById('ref-earned').textContent=myRefCount*10;
  const link='yoodle.ca?ref='+myRefCode;
  document.getElementById('ref-link-url').textContent=link;
  openOv('ref-modal');
}

function closeReferralModal(){
  closeOv('ref-modal');
}

function copyRefLink(){
  const link='https://yoodle.ca?ref='+myRefCode;
  navigator.clipboard.writeText(link).then(()=>{
    toast('📋 Link copied!');
  }).catch(()=>{
    // fallback
    const ta=document.createElement('textarea');
    ta.value=link;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();document.execCommand('copy');
    document.body.removeChild(ta);
    toast('📋 Link copied!');
  });
}

async function shareRefLink(){
  const link='https://yoodle.ca?ref='+myRefCode;
  const text='Join me on Yoodle — the free neighbourhood app for odd jobs! We both get 10 points when you sign up 🎉\n\n'+link;
  if(navigator.share){
    try{
      await navigator.share({text:text});
    }catch(e){}
  }else{
    copyRefLink();
  }
}
