// Contact support / send feedback box at the bottom of Profile (27 Nov 2026, Rhea).
// One-way: the message goes to the admin console's "FEEDBACK & SUPPORT" section through send_feedback()
// (migration 20261127_006: own table, 1–2000 characters, 5 an hour / 20 a day). A little context is sent with it
// (app or site, staging or live) to help reproduce problems. Markup: #fb-card in index.html (Profile).
// Part of the app's main code. Classic script, same global scope as the other js/ files: see js/README.md.

(function fbCss(){
  const s=document.createElement('style');
  s.textContent=`
.fb-card{margin-bottom:12px}
.fb-t{font-size:15px;font-weight:800;color:var(--text)}
.fb-d{font-size:13px;font-weight:600;color:var(--muted);margin:2px 0 10px;line-height:1.4}
.fb-box{position:relative}
/* text box: 16px or more, or iPhone Safari zooms the page on tap (js/README.md) */
.fb-box textarea{display:block;width:100%;box-sizing:border-box;min-height:96px;max-height:220px;resize:vertical;padding:12px 56px 12px 14px;
  border-radius:12px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);font:600 16px/1.4 'Nunito',sans-serif;outline:none}
.fb-box textarea:focus{border-color:var(--btn-a)}
.fb-send{position:absolute;right:8px;bottom:8px;width:40px;height:40px;border-radius:50%;border:none;cursor:pointer;
  background:linear-gradient(135deg,var(--btn-a),var(--btn-b));color:#fff;display:flex;align-items:center;justify-content:center}
.fb-send svg{width:18px;height:18px}
.fb-send:disabled{opacity:.35;cursor:default}
.fb-send:not(:disabled):active{transform:scale(.92)}
.fb-ok{display:none;margin-top:8px;font-size:13px;font-weight:800;color:var(--lime)}`;
  document.head.appendChild(s);
})();

function fbInput(){
  const t=document.getElementById('fb-text'),b=document.getElementById('fb-send');
  if(b)b.disabled=!(t&&t.value.trim());
  const ok=document.getElementById('fb-ok');if(ok&&t&&t.value)ok.style.display='none';
}

async function fbSend(){
  const t=document.getElementById('fb-text'),b=document.getElementById('fb-send');
  const text=(t?.value||'').trim();if(!text)return;
  if(!sb||!me)return toast('Sign in to send feedback');
  if(text.length>2000)return toast('Please keep it under 2000 characters');
  b.disabled=true;
  const native=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
  const ctx={app:native?'ios':'web',site:/\/staging\//.test(location.pathname)?'staging':'live',
             screen:window.innerWidth+'x'+window.innerHeight,ua:navigator.userAgent.slice(0,160)};
  const{error}=await sb.rpc('send_feedback',{p_body:text,p_context:ctx});
  if(error){b.disabled=false;return toast('❌ '+(error.message||'Could not send'));}
  t.value='';fbInput();t.blur();
  const ok=document.getElementById('fb-ok');if(ok)ok.style.display='block';
  toast('✅ Thanks! Sent to the Yoodle team');
}
