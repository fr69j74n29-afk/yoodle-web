// My profile screen, email preference, bio, top-bar avatar.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

async function loadProfile(){
  if(!me){document.getElementById('pnm').textContent='Demo User';return;}
  const authName=me.user_metadata?.full_name||me.email?.split('@')[0]||'Yoodler';const url=me.user_metadata?.avatar_url;
  document.getElementById('pem').textContent=me.email||'';
  const av=document.getElementById('pav');
  if(url){av.innerHTML=`<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover">`;}
if(!sb)return;
const{data:prof}=await sb.from('profiles').select('bio,rating,task_count,name,visible_on_map,last_lat,last_lng,helper_address,avatar_color,helper_categories,helper_expires_at,helper_bio,helper_rate,helper_rate_type').eq('id',myProfileId||me.id).maybeSingle();
const name=prof?.name||authName;
document.getElementById('pnm').textContent=name;
document.getElementById('p-bio').value=prof?.bio||'';
document.getElementById('p-name').value=name;
// update avatar with DiceBear if not Google
if(!url){
  document.getElementById('pav').innerHTML=avatarCircle(name,prof?.avatar_color,'64px','26px');
  const _topAv=document.getElementById('top-av');
  if(_topAv)_topAv.innerHTML=avatarCircle(name,prof?.avatar_color,'36px','14px');
}
// populate helper status block
updateProfileHelperBlock(prof);
loadViewStats();
renderRtwBlock(prof); // Ready to work card
renderIdvBlock(); // ID verification card + own badge
loadEmailPref();
loadBlockedList();
document.getElementById('p-rating').textContent=prof?.rating?`★ ${prof.rating}`:'';
updateNotifTip();
}
async function loadEmailPref(){
  const card=document.getElementById('em-card');
  if(!sb||!me){card.style.display='none';return;}
  const{data,error}=await sb.from('profiles').select('email_opt_out').eq('id',myProfileId||me.id).maybeSingle();
  if(error||!data){card.style.display='none';return;} // column not added yet → hide
  document.getElementById('em-toggle').checked=!data.email_opt_out;
  card.style.display='block';
  if(window._openEmailSettings){window._openEmailSettings=false;setTimeout(()=>{openOv('settings-sheet');card.style.borderColor='var(--purple)';},300);}
}
async function setEmailNotifications(on){
  if(!sb||!me)return;
  const t=document.getElementById('em-toggle');
  const{error}=await sb.from('profiles').update({email_opt_out:!on}).eq('id',myProfileId||me.id);
  if(error){t.checked=!on;return toast('❌ '+error.message);}
  toast(on?'📬 Email notifications on':'🔕 Email notifications off');
}
async function saveBio(){
  if(!sb||!me)return toast('Not signed in');
  const bio=document.getElementById('p-bio').value.trim();
  const name=document.getElementById('p-name').value.trim();
  if(!name)return toast('Display name cannot be empty');
  const{error}=await sb.from('profiles').update({bio,name}).eq('id',myProfileId||me.id);
  if(error)return toast('❌ '+error.message);
  document.getElementById('pnm').textContent=name;
  _myNameCache={pid:myProfileId||me.id,name};
  toast('✅ Profile saved!');
}
