// Sign in (Google, email code, password) and sign out.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

async function signIn(provider) {
  if(!sb)return toast('⚠️ Add Supabase credentials first');
  await sb.auth.signInWithOAuth({provider,options:{redirectTo:AUTH_RETURN}});
}

async function sendMagicLink() {
  const email=document.getElementById('magic-email').value.trim();
  if(!email||!email.includes('@'))return toast('Enter a valid email address');
  const btn=document.getElementById('magic-btn');
  if(sb){
    btn.disabled=true;btn.textContent='Sending…';
    // Same email contains a 6-digit code AND a link — code works inside the home-screen app / iOS app
    const{error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:AUTH_RETURN}});
    btn.textContent='Email me a code';
    if(error){btn.disabled=false;return toast('❌ '+error.message);}
  }else{btn.disabled=true;}
  document.getElementById('magic-addr').textContent=email;
  document.getElementById('magic-sent').style.display='block';
  document.getElementById('magic-email').closest('.magic-row').style.display='none';
  document.getElementById('otp-wrap').style.display='flex';
  setTimeout(()=>document.getElementById('otp-code').focus(),60);
}

async function verifyEmailCode(){
  const email=document.getElementById('magic-email').value.trim();
  const token=document.getElementById('otp-code').value.replace(/\D/g,'');
  if(token.length<6)return toast('Enter the code from your email');
  if(!sb)return toast('⚠️ Add Supabase credentials first');
  const btn=document.getElementById('otp-btn');btn.disabled=true;btn.textContent='Checking…';
  const{error}=await sb.auth.verifyOtp({email,token,type:'email'});
  btn.disabled=false;btn.textContent='Sign in';
  if(error)return toast(/expired|invalid/i.test(error.message)?'❌ That code is wrong or expired — request a new one':'❌ '+error.message);
  // success: onAuthStateChange → showApp() takes over (draft / helper intent restored there)
}

// Password sign-in (used by the App Store reviewer account; works for any account with a password)
function togglePasswordLogin(){
  const w=document.getElementById('pw-wrap');const show=w.style.display!=='flex';
  w.style.display=show?'flex':'none';
  if(show){
    const row=document.getElementById('magic-email').closest('.magic-row');if(row)row.style.display='flex';
    setTimeout(()=>document.getElementById(document.getElementById('magic-email').value.trim()?'pw-input':'magic-email').focus(),60);
  }
}
async function signInWithPassword(){
  if(!sb)return;
  const email=document.getElementById('magic-email').value.trim();
  const password=document.getElementById('pw-input').value;
  if(!email||!email.includes('@'))return toast('Enter your email above');
  if(!password)return toast('Enter your password');
  const btn=document.getElementById('pw-btn');btn.disabled=true;btn.textContent='Checking…';
  const{error}=await sb.auth.signInWithPassword({email,password});
  btn.disabled=false;btn.textContent='Sign in';
  if(error)return toast(/invalid/i.test(error.message)?'❌ Wrong email or password':'❌ '+error.message);
  document.getElementById('pw-input').value='';
  // success: onAuthStateChange → showApp()
}

function resetEmailCode(){
  document.getElementById('otp-wrap').style.display='none';
  document.getElementById('magic-sent').style.display='none';
  document.getElementById('otp-code').value='';
  document.getElementById('magic-email').closest('.magic-row').style.display='flex';
  const btn=document.getElementById('magic-btn');btn.disabled=false;btn.textContent='Email me a code';
  document.getElementById('magic-email').focus();
}
function oneSignalLogout(){
  try{if(oneSignalReady&&window.OneSignalDeferred)window.OneSignalDeferred.push(async(os)=>{try{await os.logout();}catch(e){}});}catch(e){}
}
async function signOut(){oneSignalLogout();if(window.ctReset)ctReset(); // Contacts tab (js/contacts.js)
  if(sb)await sb.auth.signOut();else showAuthScreen();}
