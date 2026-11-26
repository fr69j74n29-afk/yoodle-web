// Sign in (Google, email code, password) and sign out.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// iOS app (24 Nov 2026): native Google sign-in and Sign in with Apple through @capgo/capacitor-social-login (v8).
// The plugin returns an ID token and Supabase signs in with it (signInWithIdToken), so no browser sheet is needed.
// Supabase → Auth → Providers: Google's Client IDs include the iOS client below; Apple's include the bundle ID ca.yoodle.app.
// Nonce: the plugin (and so Google/Apple) gets SHA-256(raw), Supabase gets raw and checks the token's nonce matches.
// Older app builds without the plugin (Capgo can deliver this page to them) keep the browser sheet and show no Apple button.
// Android isn't set up yet (needs the web client ID and Apple's web flow), so it keeps the browser sheet too.
const GOOGLE_IOS_CLIENT_ID='848369207711-l8n14j38rlds8vqb0jvkld4f6gc141as.apps.googleusercontent.com';
let _slReady=null;
function _nativeSocial(){
  if(!IS_NATIVE||window.Capacitor.getPlatform()!=='ios')return null;
  return window.Capacitor.Plugins.SocialLogin||null;
}
async function _nativeSocialSignIn(S,provider){
  // → 'done' (signed in, cancelled, or error shown) | 'fallback' (use the browser sheet instead)
  let raw,hashed;
  try{
    const hex=a=>Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
    raw=hex(crypto.getRandomValues(new Uint8Array(32)));
    hashed=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))));
  }catch(e){
    console.warn('nonce',e);
    if(provider==='google')return 'fallback';
    toast('❌ Sign in with Apple didn\'t work — use Google or email');return 'done';
  }
  let res;
  try{
    if(!_slReady)_slReady=S.initialize({google:{iOSClientId:GOOGLE_IOS_CLIENT_ID,mode:'online'},apple:{clientId:'ca.yoodle.app'}}).catch(e=>{_slReady=null;throw e;});
    await _slReady;
    res=await S.login({provider,options:{scopes:provider==='apple'?['email','name']:['email','profile'],nonce:hashed}});
  }catch(e){
    const m=String((e&&e.message)||e);
    if(/cancel|error 1001/i.test(m))return 'done'; // closed the Google sheet / Apple panel
    console.warn('native sign-in ('+provider+'):',m);
    if(provider==='google')return 'fallback';
    toast('❌ Sign in with Apple didn\'t work — try again, or use Google or email');return 'done';
  }
  const r=(res&&res.result)||{};
  if(!r.idToken){if(provider==='google')return 'fallback';toast('❌ Sign in with Apple didn\'t work — try again');return 'done';}
  const{data,error}=await sb.auth.signInWithIdToken({provider,token:r.idToken,nonce:raw});
  if(error){toast('❌ '+error.message);return 'done';}
  // Apple shares the name only with the app (not in the token), and only on the first sign-in (the plugin keeps it for
  // later ones). Save it as Google's full_name is, and waited for, so the app shows it from the start (25 Nov 2026 review).
  // The profile row is made by the database at sign-up; its name is replaced only when it's empty or still the
  // email-style fallback (the part before @, e.g. an Apple "Hide My Email" relay), so a chosen name is never overwritten.
  const pf=r.profile||{},full=[pf.givenName,pf.familyName].filter(Boolean).join(' ').trim();
  const u=data&&data.user;
  if(provider==='apple'&&full&&u){
    try{if(!u.user_metadata||!u.user_metadata.full_name)await sb.auth.updateUser({data:{full_name:full}});}catch(e){}
    const pre=String(u.email||'').split('@')[0];
    try{await sb.from('profiles').update({name:full}).eq('id',u.id).is('name',null);}catch(e){}
    try{await sb.from('profiles').update({name:full}).eq('id',u.id).in('name',pre?['',pre]:['']);}catch(e){}
    try{_myNameCache=null;setAvatar();}catch(e){}
  }
  return 'done'; // onAuthStateChange → showApp() takes over, as on the website
}

async function signIn(provider) {
  if(!sb)return toast('⚠️ Add Supabase credentials first');
  const S=_nativeSocial();
  if(S&&await _nativeSocialSignIn(S,provider)==='done')return;
  if(IS_NATIVE){
    // App: Google blocks sign-in inside app web views, and Capacitor would bounce the page out to Safari (signing in the website, not the app).
    // Open it in the in-app browser sheet instead; Supabase then redirects to ca.yoodle.app://auth and _nativeAuthInit finishes it.
    const{data,error}=await sb.auth.signInWithOAuth({provider,options:{redirectTo:NATIVE_AUTH_RETURN,skipBrowserRedirect:true}});
    if(error||!data?.url)return toast('❌ '+(error?.message||'Could not start sign-in'));
    await window.Capacitor.Plugins.Browser.open({url:data.url});
    return;
  }
  await sb.auth.signInWithOAuth({provider,options:{redirectTo:AUTH_RETURN}});
}
// App only: Supabase session storage in native Preferences (see createClient). null → Supabase's default (localStorage).
// The first time it runs, a session saved earlier in localStorage is moved over, so nobody is signed out by the switch.
var _nasCache; // var, not let: createClient (earlier in this file) can call this before this line has run
function _nativeAuthStorage(){
  if(_nasCache!==undefined)return _nasCache;
  const Pr=IS_NATIVE&&window.Capacitor.Plugins&&window.Capacitor.Plugins.Preferences;
  if(!Pr)return(_nasCache=null);
  const ls={get:k=>{try{return localStorage.getItem(k);}catch(e){return null;}},del:k=>{try{localStorage.removeItem(k);}catch(e){}}};
  return(_nasCache={
    async getItem(k){
      const r=await Pr.get({key:k});
      if(r&&r.value!=null)return r.value;
      const old=ls.get(k);
      if(old!=null){await Pr.set({key:k,value:old});ls.del(k);}
      return old;
    },
    async setItem(k,v){await Pr.set({key:k,value:v});},
    async removeItem(k){await Pr.remove({key:k});ls.del(k);}
  });
}
// App only: finish sign-in when Supabase redirects to ca.yoodle.app://auth (app already open, or launched by the link).
// ?code= → PKCE exchange; #access_token= (older links) → setSession. onAuthStateChange then starts the app as on the website.
function _nativeAuthInit(){
  const P=window.Capacitor.Plugins;
  if(!P||!P.App)return;
  // Each sign-in link works once, but it can arrive more than once: on a cold launch both appUrlOpen and getLaunchUrl()
  // report it, and getLaunchUrl() keeps returning it for the life of the app, so every page reload (e.g. a Capgo update)
  // would see it again and show an error. Remember the links already handled (sessionStorage survives reloads, not app restarts).
  const DONE_KEY='yoodle_auth_links_done';
  const linkId=s=>{let x=0;for(let i=0;i<s.length;i++)x=(x*31+s.charCodeAt(i))|0;return String(x);}; // short id; the link itself holds a code/token, so don't store it
  const done=()=>{try{return JSON.parse(sessionStorage.getItem(DONE_KEY)||'[]');}catch(e){return[];}};
  const busy=new Set();
  const handle=async url=>{
    if(!url||!url.startsWith(NATIVE_AUTH_RETURN))return;
    const id=linkId(url);
    if(busy.has(id)||done().includes(id))return;
    busy.add(id);
    try{const a=done().slice(-9);a.push(id);sessionStorage.setItem(DONE_KEY,JSON.stringify(a));}catch(e){}
    if(P.Browser)P.Browser.close().catch(()=>{}); // close the sign-in sheet (iOS)
    let u;try{u=new URL(url);}catch(e){return;}
    const q=u.searchParams,h=new URLSearchParams(u.hash.slice(1));
    const err=q.get('error_description')||h.get('error_description');
    if(err)return toast('❌ '+err);
    const code=q.get('code');
    if(code){const{error}=await sb.auth.exchangeCodeForSession(code);if(error)toast('❌ '+error.message);return;}
    const at=h.get('access_token'),rt=h.get('refresh_token');
    if(at&&rt){const{error}=await sb.auth.setSession({access_token:at,refresh_token:rt});if(error)toast('❌ '+error.message);}
  };
  P.App.addListener('appUrlOpen',e=>handle(e&&e.url));
  if(P.App.getLaunchUrl)P.App.getLaunchUrl().then(r=>handle(r&&r.url)).catch(()=>{});
}

async function sendMagicLink() {
  const email=document.getElementById('magic-email').value.trim();
  if(!email||!email.includes('@'))return toast('Enter a valid email address');
  const btn=document.getElementById('magic-btn');
  if(sb){
    btn.disabled=true;btn.textContent='Sending…';
    // Same email contains a 6-digit code AND a link — code works inside the home-screen app / iOS app
    // App: the email's link opens the app through the deep link (works when tapped on the same phone); the 6-digit code works everywhere
    const{error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:IS_NATIVE?NATIVE_AUTH_RETURN:AUTH_RETURN}});
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
  if(IS_NATIVE){try{npLogout();}catch(e){}return;} // app: native SDK (js/native-push.js)
  try{if(oneSignalReady&&window.OneSignalDeferred)window.OneSignalDeferred.push(async(os)=>{try{await os.logout();}catch(e){}});}catch(e){}
}
async function signOut(){oneSignalLogout();if(window.ctReset)ctReset(); // Contacts tab (js/contacts.js)
  if(sb)await sb.auth.signOut();else showAuthScreen();}
