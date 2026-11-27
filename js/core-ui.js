// Small shared UI helpers: overlays, toast, escaping, links, avatars, times, distance.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

function haversineKm(lat1,lng1,lat2,lng2){
  const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function openOv(id){document.getElementById(id)?.classList.add('open');}
function closeOv(id){document.getElementById(id)?.classList.remove('open');}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800);}
function spin(){return'<div class="loading"><div class="spinner"></div></div>';}
function emptyState(ico,t,d){return`<div class="empty"><div class="empty-ico">${ico}</div><div class="empty-t">${t}</div><div class="empty-d">${d}</div></div>`;}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
// For a value inside a quoted JS string in an inline handler: onclick="f('${escJs(name)}')". esc() alone isn't enough there (O'Brien ends the string).
function escJs(s){return esc(String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,'\\n'));}
function linkify(s){return s.replace(/(https?:\/\/[^\s<&]+(?:&amp;[^\s<&]+)*|www\.[^\s<&]+(?:&amp;[^\s<&]+)*)/gi,function(url){const href=url.startsWith('www.')?'https://'+url:url;return'<a href="'+href+'" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;word-break:break-all">'+url+'</a>';});}
// Avatar standard: black fill, white border, white initial — everywhere except map pins.
// Signature unchanged for call-site compatibility; color/border params are intentionally ignored.
function avatarCircle(name,color,size='36px',fontSize='14px',border=true,bg='#5C8A6A'){
  const initial=((name||'?')[0]).toUpperCase();
  return`<div style="width:${size};height:${size};border-radius:50%;background:${bg};border:1.5px solid #fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${fontSize};color:#fff;flex-shrink:0;font-family:'Nunito',sans-serif">${esc(initial)}</div>`;
}
function timeAgo(d){const m=Math.floor((Date.now()-new Date(d).getTime())/60000);if(m<1)return'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';return Math.floor(h/24)+'d ago';}
