// Startup: runs once the page has loaded (DOMContentLoaded).
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

window.addEventListener('DOMContentLoaded', () => {
  // Read URL params (notification deep-link + referral code)
  const _notifParams = new URLSearchParams(window.location.search);
  const _notifTaskId = _notifParams.get('task_id');
  const _notifConvId = _notifParams.get('conv_id');
  const _refCode = _notifParams.get('ref');
  const _openEmail = _notifParams.get('open')==='email-settings';
  // Email/push "Keep my job up" / "Keep me listed" one-tap renew link: ?renew={token}. Handled after sb is created.
  const _renewTok = _notifParams.get('renew');
  if(_renewTok && /^[0-9a-f-]{36}$/i.test(_renewTok)) window._renewToken = _renewTok;
  // Back from Stripe (ID verification): ?idv=paid|cancel|done — handled in handleIdvReturn() once signed in
  const _idvRet = _notifParams.get('idv');
  if(_idvRet==='paid'||_idvRet==='cancel'||_idvRet==='done') window._idvReturn = _idvRet;
  if(_openEmail) window._openEmailSettings = true;
  // Evening push "Ready to work tomorrow?": ?ready=today|tomorrow — handled in handleReadyLanding() once signed in
  const _readyLand = _notifParams.get('ready');
  if(_readyLand==='today'||_readyLand==='tomorrow') window._readyLand = _readyLand;
  // Expiry reminder email "Edit your job" (?edit={task_id}) / "Post a new one" (?post=1) —
  // kept in localStorage so they survive sign-in (Google OAuth reloads the page). Handled in handleEmailJobLanding().
  const _editLand = _notifParams.get('edit');
  const _postLand = _notifParams.get('post')==='1';
  if(_editLand && /^[0-9a-f-]{36}$/i.test(_editLand)){
    try{localStorage.setItem('yoodle_job_land', JSON.stringify({e:_editLand, ts:Date.now()}));}catch(e){}
  }else if(_postLand){
    try{localStorage.setItem('yoodle_job_land', JSON.stringify({p:1, ts:Date.now()}));}catch(e){}
  }
  // Helper page "Contact on Yoodle" deep link: ?helper={id}[&s=share|fwd] — kept in localStorage
  // so it survives sign-in (Google OAuth reloads the page). Handled in handleHelperLanding().
  const _landHelper = _notifParams.get('helper');
  if(_landHelper && /^[0-9a-f-]{36}$/i.test(_landHelper)){
    const _landSrc = _notifParams.get('s');
    try{localStorage.setItem('yoodle_helper_land', JSON.stringify({h:_landHelper, s:(_landSrc==='share'||_landSrc==='fwd'||_landSrc==='pro')?_landSrc:null, ts:Date.now()}));}catch(e){}
  }
  if(_refCode){
    localStorage.setItem('yoodle_ref', _refCode);
  }
  if(_notifTaskId){
    window._pendingNotifTaskId = _notifTaskId;
    window._pendingNotifConvId = _notifConvId;
    // Email "Reply" links: keep through sign-in — Google OAuth reloads the page
    if(/^[0-9a-f-]{36}$/i.test(_notifTaskId)){
      try{localStorage.setItem('yoodle_chat_land', JSON.stringify({t:_notifTaskId, c:(_notifConvId&&/^[0-9a-f-]{36}$/i.test(_notifConvId))?_notifConvId:null, ts:Date.now()}));}catch(e){}
    }
  }
  if(_notifTaskId || _refCode || _openEmail || _landHelper || window._idvReturn || window._renewToken || window._readyLand || _editLand || _postLand){
    window.history.replaceState({}, '', '/');
  }
  if(window.navigator.standalone===true||window.matchMedia('(display-mode:standalone)').matches){
    const tip=document.getElementById('ios-pwa-tip');
    if(tip)tip.style.display='block';
  }
  initMap();
  setTimeout(_mlCssReady,3000); // fallback: show the map even if maplibre-gl.css is slow / blocked
  if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
  }

  // Register OneSignal notification click listener early — before auth —
  // so cold starts (app opened by tapping a notification) are captured.
  window.OneSignalDeferred=window.OneSignalDeferred||[];
  window.OneSignalDeferred.push(function(os){
    os.Notifications.addEventListener('click',async function(event){
      const data=event.notification.additionalData;
      const taskId=data?.task_id;
      const convId=data?.conversation_id;
      if(!taskId)return;
      if(me&&sb){
        await openChatFromNotification(taskId,convId);
      }else{
        window._pendingNotifTaskId=taskId;
        window._pendingNotifConvId=convId;
      }
    });
  });

  // App: PKCE flow, so the deep link carries a one-time ?code= (exchanged below) instead of tokens in the URL. Website: unchanged.
  // App (24 Nov 2026): the session is kept in native storage (@capacitor/preferences), which iOS never clears, instead of
  // the web view's localStorage, which iOS can clear when the phone is low on space. App builds without the plugin keep localStorage.
  sb = IS_NATIVE
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {auth:{flowType:'pkce',detectSessionInUrl:false,...(_nativeAuthStorage()?{storage:_nativeAuthStorage()}:{})}})
    : window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  if(IS_NATIVE)_nativeAuthInit();
  if(window._renewToken)handleRenewLink(window._renewToken);
  loadVerifiedIds(); // ID verified badges (public list, signed in or not)
  // Start-up once per signed-in user. Supabase also fires auth events on token refresh (~hourly) and tab focus,
  // and getSession + INITIAL_SESSION both fire on load — repeats only update the session user
  // (showApp() is ≈24 API calls + a map recentre).
  sb.auth.getSession().then(({data:{session}})=>{
    if(session)return _startApp(session);
    if(window.trackLandingVisit)trackLandingVisit(); // landing visitors → sign-in rate (js/landing-visits.js)
    // Signed out and came from the expiry email: edit → ask to sign in; post → open the guest post form
    try{
      const d=JSON.parse(localStorage.getItem('yoodle_job_land')||'null');
      if(d&&d.e&&!window._renewToken)showRenewNote('Sign in to edit your job.');
      else if(d&&d.p)openGuestPost();
    }catch(e){}
  });
  sb.auth.onAuthStateChange((_e,session)=>{
    if(session)_startApp(session);
    else{me=null;_appStartedFor=null;showAuthScreen();}
  });
});
