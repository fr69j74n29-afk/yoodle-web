// Asking for notifications (nudge, tip) on iPhone and other browsers.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

function isIos(){return/iphone|ipad|ipod/i.test(navigator.userAgent);}
// App only: where to turn notifications back on after saying no (iOS/Android won't ask again). Used by RTW_PUSH while
// this script loads, so it lives here and not in js/native-push.js (that file runs later, with defer).
function npSettingsPath(){
  return window.Capacitor?.getPlatform?.()==='android'
    ?'Open your phone\'s <b>Settings</b> → <b>Apps</b> → <b>Yoodle</b> → <b>Notifications</b> and turn them on'
    :'Open the iPhone <b>Settings</b> app → <b>Yoodle</b> → <b>Notifications</b> → turn on <b>Allow Notifications</b>';
}
// App: it's already installed, so never show "Add to Home Screen" steps
function isInStandaloneMode(){return IS_NATIVE||window.matchMedia('(display-mode:standalone)').matches||window.navigator.standalone===true;}

function updateNotifNudge(){
  const nudge=document.getElementById('notif-nudge');
  const nudgeText=document.getElementById('notif-nudge-text');
  if(!nudge)return;
  if(IS_NATIVE){ // app: native permission (js/native-push.js)
    const p=npPermission();
    nudge.style.display=p==='default'||p==='denied'?'flex':'none';
    if(nudgeText)nudgeText.textContent=p==='denied'?'Notifications are off — tap to fix':'Tap to enable notifications';
    return;
  }
  const granted=window.Notification?.permission==='granted';
  const iosNotReady=isIos()&&!isInStandaloneMode();
  if(granted&&!iosNotReady){
    nudge.style.display='none';
  } else {
    nudge.style.display='flex';
    if(iosNotReady) nudgeText.textContent='Add to Home Screen for notifications';
    else if(window.Notification?.permission==='denied') nudgeText.textContent='Notifications blocked — tap to fix';
    else nudgeText.textContent='Tap to enable notifications';
  }
}

async function requestNotifPermission(){
  if(IS_NATIVE){ // app: system prompt; if they said no before, offer to open the phone's Settings instead
    const p=npPermission();
    if(p==='granted'){updateNotifNudge();return;}
    if(p==='unavailable'){nav('profile');return;} // older app build: Profile says to update the app
    // Said no before: this opens the phone's Settings. Nothing else to show now; the app re-checks when they come back (resume).
    if(p==='denied'){npRequest(true);return;}
    const ok=await npRequest(false);
    if(ok)toast('✅ Notifications enabled!');
    else if(npPermission()==='denied'){toast('Notifications are off — see Profile to turn them on');nav('profile');}
    return;
  }
  if(isIos()&&!isInStandaloneMode()){nav('profile');return;}
  if(window.Notification?.permission==='denied'){nav('profile');return;}
  if(window.Notification?.permission==='granted'){updateNotifNudge();return;}
  toast('🔔 Requesting permission…');
  try{
    if(window.OneSignalDeferred){
      window.OneSignalDeferred.push(async os=>{
        await os.Notifications.requestPermission();
        setTimeout(updateNotifNudge,2000);
      });
    } else {
      const p=await Notification.requestPermission();
      if(p==='granted') toast('✅ Notifications enabled!');
      updateNotifNudge();
    }
  }catch(e){
    toast('❌ Could not enable — try from Profile');
    nav('profile');
  }
}

function updateNotifTip(){
  const tip=document.getElementById('notif-tip');
  const body=document.getElementById('notif-tip-body');
  if(!tip||!body)return;
  if(IS_NATIVE){ // app: native permission (js/native-push.js)
    const p=npPermission();
    const btn='<br><button class="btn-primary" style="margin-top:10px" onclick="requestNotifPermission()">Turn on notifications</button>';
    if(p==='unknown'){tip.style.display='none';return;} // OneSignal still starting; shown once the real permission is known
    tip.style.display='block';
    if(p==='granted')body.innerHTML='Push notifications are on for this phone.';
    else if(p==='denied')body.innerHTML='Notifications are off for Yoodle. To get replies and alerts: '+npSettingsPath()+'.';
    else if(p==='unavailable')body.innerHTML='Install the latest Yoodle app to get notifications. Until then, new messages and alerts show up here when you open the app.';
    else body.innerHTML='Turn on notifications to hear about replies and new jobs near you, even when Yoodle is closed.'+btn;
  } else if(isIos()&&!isInStandaloneMode()){
    tip.style.display='block';
    body.innerHTML='On iPhone, push notifications require adding Yoodle to your home screen.<br><br>Tap <strong style="color:var(--text)">Share →</strong> then <strong style="color:var(--text)">Add to Home Screen</strong>, then open the app from your home screen icon.';
  } else if(isIos()&&isInStandaloneMode()){
    tip.style.display='block';
    body.innerHTML='You\'re using Yoodle as an app! Make sure you\'ve allowed notifications when prompted.';
  } else if(window.Notification?.permission==='granted'){
    tip.style.display='block';
    body.innerHTML='Push notifications are enabled on this device.';
  } else if(window.Notification?.permission==='denied'){
    tip.style.display='block';
    body.innerHTML='Notifications are blocked. Go to your browser settings and allow notifications for yoodle.ca.';
  } else {
    tip.style.display='block';
    body.innerHTML='Enable notifications to get alerted about new jobs and messages near you.';
  }
  updateNotifNudge();
}
