// Web push (OneSignal web SDK) and the notification sound.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

let oneSignalReady=false;
async function registerOneSignal(){
  if(!me||!sb||IS_STAGING)return; // staging: no push signup (OneSignal is set up for the live site)
  // App: web push can't work in the app's web view; the native OneSignal SDK does it instead (js/native-push.js).
  // Same mapping: this phone belongs to the profile id (external_id), and its push id is saved to profiles.onesignal_id.
  if(IS_NATIVE){try{npLogin();}catch(e){}return;}
  try{
    window.OneSignalDeferred=window.OneSignalDeferred||[];
    window.OneSignalDeferred.push(async(os)=>{
      if(!oneSignalReady){
        oneSignalReady=true;
        await os.init({
          appId:'258cf4ad-768d-4775-a8ce-4f79a5c2de04',
          notifyButton:{enable:false},
          promptOptions:{
            slidedown:{
              enabled:true,
              autoPrompt:true,
              timeDelay:8,
              pageViews:1,
              actionMessage:"Enable push notifications to get alerted about new jobs near you!",
              acceptButton:"Yes, notify me",
              cancelButton:"Not now",
            }
          }
        });
        os.User.PushSubscription.addEventListener('change',async(e)=>{
          const osId=e.current?.id;
          if(osId&&me&&sb){
            const pid=myProfileId||me.id;
            await sb.from('profiles').update({onesignal_id:osId}).eq('id',pid);
            console.log('OneSignal ID saved:',osId);
          }
        });
      }
      // User-based push targeting: this device belongs to profile id (OneSignal external_id)
      if(me){try{await os.login(myProfileId||me.id);}catch(err){console.warn('OneSignal login error:',err);}}
      const subId=os.User.PushSubscription.id;
      if(subId&&me&&sb){
        const pid=myProfileId||me.id;
        await sb.from('profiles').update({onesignal_id:subId}).eq('id',pid);
        console.log('OneSignal ID saved:',subId);
      }
    });
  }catch(e){
    console.warn('OneSignal init error:',e);
  }
}

function playNotificationSound(){
  try{const ctx=new(window.AudioContext||window.webkitAudioContext)();[0,.15].forEach((delay,i)=>{const osc=ctx.createOscillator();const gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=i===0?840:1060;osc.type='sine';gain.gain.setValueAtTime(0,ctx.currentTime+delay);gain.gain.linearRampToValueAtTime(.3,ctx.currentTime+delay+.01);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+delay+.4);osc.start(ctx.currentTime+delay);osc.stop(ctx.currentTime+delay+.4);});}catch(e){}
}
