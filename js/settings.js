// Settings sheet and account deletion.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

function openDeleteAccount(){
  const i=document.getElementById('del-inp');i.value='';
  document.getElementById('del-go').disabled=true;
  openOv('del-ov');
  setTimeout(()=>i.focus(),60);
}
function openSettings(){openOv('settings-sheet');loadEmailPref();loadBlockedList();}
// Profile hero "Edit profile ›": Settings opens with the name/bio card at the top
function openEditProfile(){openSettings();setTimeout(()=>{const el=document.getElementById('p-name');if(el){el.scrollIntoView({block:'nearest'});try{el.focus({preventScroll:true});}catch(e){}}},350);}
function closeSettings(){closeOv('settings-sheet');}
function closeDeleteAccount(){closeOv('del-ov');}
async function confirmDeleteAccount(){
  if(document.getElementById('del-inp').value.trim().toUpperCase()!=='DELETE')return;
  if(!sb||!me)return toast('Sign in first');
  const btn=document.getElementById('del-go');btn.disabled=true;btn.textContent='Deleting…';
  const{error}=await sb.rpc('delete_my_account');
  if(error){btn.disabled=false;btn.textContent='Delete forever';return toast('❌ '+error.message);}
  // Account is gone — clear this device's Yoodle data (keep theme choice) and return to the landing
  try{Object.keys(localStorage).filter(k=>k.startsWith('yoodle')&&k!=='yoodle-theme').forEach(k=>localStorage.removeItem(k));}catch(e){}
  closeDeleteAccount();btn.textContent='Delete forever';
  oneSignalLogout();
  try{await sb.auth.signOut();}catch(e){}
  me=null;myProfileId=null;_myNameCache=null;showAuthScreen();
  toast('Your account has been deleted');
}
