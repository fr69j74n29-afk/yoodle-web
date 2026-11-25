// Asking for notifications (nudge, tip) on iPhone and other browsers.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

function isIos(){return/iphone|ipad|ipod/i.test(navigator.userAgent);}
function isInStandaloneMode(){return window.matchMedia('(display-mode:standalone)').matches||window.navigator.standalone===true;}

function updateNotifNudge(){
  const nudge=document.getElementById('notif-nudge');
  const nudgeText=document.getElementById('notif-nudge-text');
  if(!nudge)return;
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
  if(isIos()&&!isInStandaloneMode()){
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
