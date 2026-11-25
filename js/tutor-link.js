// Open tutor.yoodle.ca already signed in.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// ── Open tutor.yoodle.ca already signed in (17 Nov 2026) ──
// Edge function tutor-handoff (YoodleMobile/supabase/functions) returns a one-time magic-link token hash
// for the signed-in person; tutor.yoodle.ca reads #th= and calls verifyOtp, so it gets its own session
// (sharing our refresh token would sign them out here once either site rotated it).
// The tab is opened in the same tap (popup blockers), then pointed at the URL once the token arrives.
// No token (signed out, function error, 6 s timeout) → the plain URL, where they can sign in as before.
const TUTOR_SITE_RE=/^https:\/\/tutor\.yoodle\.ca(\/|$)/i;
function openTutorSignedIn(ev,url){
  url=(url||'https://tutor.yoodle.ca/?start=tutor').split('#')[0];
  if(!sb||!me){if(!ev)window.open(url,'_blank','noopener');return true;} // signed out: plain link
  if(ev)ev.preventDefault();
  let w=null;try{w=window.open('','_blank');if(w)w.opener=null;}catch(e){}
  const go=dest=>{if(w&&!w.closed)w.location.replace(dest);else location.href=dest;};
  Promise.race([sb.functions.invoke('tutor-handoff',{body:{}}),new Promise(r=>setTimeout(()=>r({error:'timeout'}),6000))])
    .then(({data,error})=>go(!error&&data&&data.token_hash?url+'#th='+encodeURIComponent(data.token_hash):url))
    .catch(()=>go(url));
  return false;
}
