// Signed-out landing page, guest job draft, sign-in sheet.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// ── SIGNED-OUT LANDING + GUEST POST DRAFT ── write first, sign in to publish
const GUEST_DRAFT_KEY='yoodle_post_draft';
const GUEST_DRAFT_TTL=24*60*60*1000;
function _readGuestDraft(){try{return JSON.parse(localStorage.getItem(GUEST_DRAFT_KEY)||'null');}catch(e){return null;}}
function openGuestPost(){
  const d=_readGuestDraft();
  if(d){document.getElementById('g-title').value=d.title||'';document.getElementById('g-desc').value=d.desc||'';document.getElementById('g-budget').value=d.budget||'';}
  document.getElementById('ga-landing').classList.add('ga-posting'); // hides the landing text (phone: and the map); desktop keeps the map
  document.getElementById('ga-post').hidden=false;
  document.getElementById('view-auth').scrollTop=0;
  setTimeout(()=>document.getElementById('g-title').focus(),60);
}
function closeGuestPost(){
  document.getElementById('ga-post').hidden=true;
  document.getElementById('ga-landing').classList.remove('ga-posting');
  document.getElementById('view-auth').scrollTop=0;
}
function saveGuestPost(){
  const title=document.getElementById('g-title').value.trim();
  const desc=document.getElementById('g-desc').value.trim();
  const budget=document.getElementById('g-budget').value;
  if(!title)return toast('Add a job title!');
  if(!desc)return toast('Describe the job!');
  try{localStorage.setItem(GUEST_DRAFT_KEY,JSON.stringify({title,desc,budget,ts:Date.now()}));}
  catch(e){return toast('⚠️ Could not save your draft — sign in and post from the app');}
  document.getElementById('ga-cta-t').textContent='Continue your job';
  openAuthSheet('post');
}
const AFTER_LOGIN_KEY='yoodle_after_login';
// Onboarding path: which landing choice led to sign-in. Saved here, sent once after sign-in
// by recordOnboardPath() → set_onboard_path() (write-once, only for accounts < 24 h old).
const ONBOARD_KEY='yoodle_onboard';
function openAuthSheet(mode){
  try{if(mode==='helper')localStorage.setItem(AFTER_LOGIN_KEY,'helper');else localStorage.removeItem(AFTER_LOGIN_KEY);}catch(e){}
  try{localStorage.setItem(ONBOARD_KEY,JSON.stringify({p:mode==='post'?'post_job':mode==='helper'?'find_work':'sign_in',ts:Date.now()}));}catch(e){}
  const h=document.getElementById('ga-sheet-h'),p=document.getElementById('ga-sheet-p'),dc=document.getElementById('ga-draft');
  dc.style.display='none';
  const ab=document.getElementById('btn-apple');if(ab)ab.style.display=_nativeSocial()?'flex':'none';
  if(mode==='post'){
    const d=_readGuestDraft();
    h.textContent='Almost done!';
    p.textContent="Sign in so neighbours can reply to you. Your job is saved — you'll pin your location and post it right after.";
    if(d){
      document.getElementById('ga-draft-t').textContent=d.title;
      document.getElementById('ga-draft-m').textContent=d.budget?('$'+d.budget+' · ready to post'):'ready to post';
      dc.style.display='flex';
    }
  }else if(mode==='helper'){
    h.textContent='Find work nearby';
    p.textContent="Sign in and we'll take you straight to your helper profile — neighbours nearby can then find and message you.";
  }else{
    h.textContent='Welcome back';
    p.textContent='Sign in to Yoodle — no passwords needed.';
  }
  // Desktop: sign-in takes the left column in place of the landing text / job form; the map stays (Roman, 27 Nov).
  // Phone: bottom sheet over a dimmed page, as before.
  const sheet=document.getElementById('ga-sheet'),landing=document.getElementById('ga-landing');
  if(landing&&window.matchMedia('(min-width:900px)').matches){
    if(sheet.parentElement!==landing)landing.appendChild(sheet);
    landing.classList.add('ga-signing');
    openOv('ga-sheet');
    document.getElementById('view-auth').scrollTop=0;
    return;
  }
  _gaSheetHome();
  openOv('ga-dim');
  openOv('ga-sheet');
}
// Put the sheet back in its own place (after #ga-dim) for the phone bottom sheet.
function _gaSheetHome(){const sheet=document.getElementById('ga-sheet'),dim=document.getElementById('ga-dim');if(sheet&&dim&&sheet.previousElementSibling!==dim)dim.after(sheet);}
function closeAuthSheet(){
  closeOv('ga-dim');
  closeOv('ga-sheet');
  document.getElementById('ga-landing')?.classList.remove('ga-signing'); // desktop: back to the landing text or the job form
  _gaSheetHome();
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAuthSheet();});
function restoreGuestDraft(){
  let intent=null;try{intent=localStorage.getItem(AFTER_LOGIN_KEY);localStorage.removeItem(AFTER_LOGIN_KEY);}catch(e){}
  if(intent==='helper'){helperEnteredFromFork=true;nav('helper');toast('👋 Welcome! Set up your helper profile so neighbours can find you');return;}
  const d=_readGuestDraft();
  try{localStorage.removeItem(GUEST_DRAFT_KEY);}catch(e){}
  if(!d||!d.title||Date.now()-(d.ts||0)>GUEST_DRAFT_TTL)return;
  nav('postjob'); // resetPost() runs inside nav — fill fields after it
  document.getElementById('p-title').value=d.title;
  document.getElementById('p-desc').value=d.desc||'';
  document.getElementById('p-budget').value=d.budget||'';
  toast('📍 Almost there — add your location and tap Post Job');
}
