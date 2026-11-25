// Sharing my / another helper page, the live screen.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// ── SHARE MY HELPER PAGE ──
function helperShareArea(address){
  const parts=String(address||'').split(',').map(p=>p.trim()).filter(p=>p&&!/^\d/.test(p)&&!/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(p));
  return (parts.length>=3?parts[parts.length-3]:parts[0])||'my area'; // neighbourhood, not street
}
function helperShareSkills(cats){
  const c=(cats||[]).slice(0,3).map(s=>String(s).toLowerCase());
  if(!c.length)return 'help with odd jobs';
  return c.length===1?c[0]:c.slice(0,-1).join(', ')+' and '+c[c.length-1];
}
function helperShareText(address,cats){
  return `Hi! I'm now offering ${helperShareSkills(cats)} around ${helperShareArea(address)} on Yoodle, a free neighbourhood odd-jobs app. If you or anyone you know needs a hand, here's my page:`;
}
let liveShareData=null;
// Usage tracking → public.share_events (insert-own only; read via admin_share_stats). Never blocks sharing.
function logShare(ev){
  try{if(sb&&me)sb.from('share_events').insert({profile_id:myProfileId||me.id,event:ev}).then(r=>{if(r&&r.error)console.warn('[log] share_events: '+r.error.message);},()=>{});}catch(e){}
}
function openLiveScreen(d){
  logShare('shown');
  liveShareData=d;
  document.getElementById('live-area').textContent=helperShareArea(d.address);
  document.getElementById('live-rate').textContent=d.rateType==='free'||!d.rate?'🤝 Free':`💰 $${d.rate}${d.rateType==='hourly'?' / hour':d.rateType==='daily'?' / day':' flat'}`;
  document.getElementById('live-chips').innerHTML=(d.categories||[]).map(c=>`<span class="live-chip">${esc(c)}</span>`).join('');
  document.getElementById('live-share-label').textContent=navigator.share?"Tell friends you're on Yoodle":'Copy your page link';
  openOv('live-ov');
}
function closeLiveScreen(){closeOv('live-ov');}
async function shareMyHelperPage(d){
  const fromProfile=d===null;
  if(d===undefined||d instanceof Event)d=liveShareData;
  if(!d){
    const{data}=await sb.from('profiles').select('helper_address,helper_categories').eq('id',myProfileId||me.id).maybeSingle();
    d={address:data?.helper_address,categories:data?.helper_categories};
  }
  const url=`https://yoodle.ca/helpers/${myProfileId||me.id}?s=share`;
  const text=helperShareText(d.address,d.categories);
  if(navigator.share){
    try{await navigator.share({text,url});logShare(fromProfile?'profile_share':'shared');closeLiveScreen();}catch(e){}
    return;
  }
  const full=text+' '+url;
  logShare(fromProfile?'profile_share':'copied');
  try{await navigator.clipboard.writeText(full);}catch(e){
    const ta=document.createElement('textarea');ta.value=full;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);
  }
  const btn=document.getElementById('live-share-label');
  if(btn&&document.getElementById('live-ov').classList.contains('open')){btn.textContent='Copied! ✓';setTimeout(()=>btn.textContent='Copy your page link',2000);}
  toast('📋 Copied! Paste it into a message');
}

// ── SHARE ANOTHER HELPER'S PAGE (profile sheet header) ──
async function shareOtherHelperPage(){
  const d=window._opShare;
  if(!d)return;
  let url,text;
  if(d.pro){
    // Pro card share: opens the profile in the app (no public /pros page yet)
    url=`https://yoodle.ca/?helper=${d.id}&s=pro`;
    const trades=(d.pro.trades||[]).map(k=>proTrade(k).label).join(', ')||'home services';
    text=`Check out this local pro on Yoodle: ${d.pro.business?d.pro.business+' — ':''}${trades}${d.pro.area?` around ${d.pro.area}`:''}${d.pro.verified?' (verified licence)':''}. Contact free:`;
  }else{
    url=`https://yoodle.ca/helpers/${d.id}?s=fwd`;
    const cats=(d.categories||[]).filter(c=>String(c).toLowerCase()!=='other');
    const skills=cats.length?helperShareSkills(cats):'odd jobs';
    const area=d.address?helperShareArea(d.address):'';
    text=`Check out this local helper on Yoodle: ${skills}${area&&area!=='my area'?` around ${area}`:''}. Free to contact:`;
  }
  if(navigator.share){
    try{await navigator.share({text,url});}catch(e){}
    return;
  }
  const full=text+' '+url;
  try{await navigator.clipboard.writeText(full);}catch(e){
    const ta=document.createElement('textarea');ta.value=full;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);
  }
  toast('📋 Copied! Paste it into a message');
}
