// ══ STANDARD SERVICES (17 Nov 2026) ══
// Helpers set fixed prices for standard home services (snow removal, windows, gutters, bins…) in their
// own screen (#app-services, created by this file; opened from the Profile tab, a link at the bottom of the
// helper profile screen, and the "You're live" screen); prices show on the helper list card (one line) and the
// profile card (collapsed rows).
// Tables: service_catalog (categories), service_options (sizes/add-ons), helper_service_offers (prices).
// Catalog is data-driven: add/remove a category in Supabase, no code change.
// Rules (Roman, 17 Nov 2026): helper profile needed first; street-level helper address required (city-only → locked);
// services show only while the helper listing is active; empty price = option not offered;
// quote_only options (e.g. "Other — custom quote") have no price.
// Loaded as a classic deferred script (NOT a module): index.html calls these by name through guarded
// hooks (if(window.hsvcX)…), and this file reads index.html globals (sb, me, myProfileId, hpIsVagueText,
// esc, toast, nav) at call time. If this file fails to load, the app works as before without services.

var HSVC={catP:null,cat:[],opts:[],cache:new Map(),pending:new Set(),fillTimer:null,mine:null,locked:false,paused:false,from:'profile',saving:false};
var HSVC_PT={visit:['Per visit','/visit'],season:['Season','/season'],job:['Per job','/job'],month:['Month','/month'],year:['Year','/year']};

(function(){ // styles live here so index.html stays untouched
  var css=`
.hsvc-line:empty,.hsvc-prof:empty{display:none}
.hsvc-line{display:inline-block;align-self:flex-start;font-size:12.5px;font-weight:800;color:var(--lime);background:rgba(46,125,82,.08);border-radius:100px;padding:3px 10px}
.hsvc-prof{margin-top:12px}
.hsvc-prof .lbl{font-size:12.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px}
.hsvc-row{border:1.5px solid var(--border);border-radius:var(--radius-sm);margin-bottom:7px;overflow:hidden}
.hsvc-row.open{border-color:var(--lime)}
.hsvc-rh{display:flex;align-items:center;gap:8px;padding:11px 12px;cursor:pointer;font-size:14.5px;font-weight:800;color:var(--text)}
.hsvc-rh .p{margin-left:auto;color:var(--lime);font-size:13.5px;white-space:nowrap}
.hsvc-rh .c{color:var(--muted);transition:transform .2s}
.hsvc-row.open .c{transform:rotate(90deg)}
.hsvc-rb{display:none;padding:0 12px 10px;font-size:13.5px;font-weight:700;color:var(--text2)}
.hsvc-row.open .hsvc-rb{display:block}
.hsvc-rb div{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-top:1px solid var(--surface2)}
.hsvc-rb div span:last-child{text-align:right;font-weight:800}
.hsvc-set .sub{font-size:13.5px;color:var(--muted);font-weight:700;margin-bottom:10px;line-height:1.5}
.hsvc-req{font-size:13px;font-weight:700;color:var(--text2);background:var(--surface2);border-radius:var(--radius-sm);padding:9px 12px;margin-bottom:10px;line-height:1.5}
.hsvc-lock{font-size:13.5px;font-weight:800;color:#B6463D;background:rgba(220,80,70,.07);border:1.5px solid rgba(220,80,70,.25);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:10px;line-height:1.5;display:none}
.hsvc-set.locked .hsvc-lock{display:block}
.hsvc-set.locked .hsvc-cards{opacity:.45;pointer-events:none}
.hsvc-card{background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius-sm);margin-bottom:10px;overflow:hidden}
.hsvc-card.on{border-color:var(--lime)}
.hsvc-ch{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;user-select:none}
.hsvc-ch .em{font-size:20px}
.hsvc-ch .nm{flex:1;font-weight:800;font-size:15px;color:var(--text)}
.hsvc-ch .sm{display:block;font-size:12.5px;color:var(--muted);font-weight:700}
.hsvc-tog{width:44px;height:26px;border-radius:13px;background:var(--border);position:relative;transition:.2s;flex:none}
.hsvc-tog:after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.hsvc-card.on .hsvc-tog{background:var(--lime)}
.hsvc-card.on .hsvc-tog:after{left:21px}
.hsvc-cb{display:none;padding:0 14px 14px;border-top:1px solid var(--surface2)}
.hsvc-card.on .hsvc-cb{display:block}
.hsvc-grid{display:grid;gap:6px 8px;align-items:center;margin-top:10px}
.hsvc-gh{font-size:11.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;text-align:center}
.hsvc-ol{font-size:14px;font-weight:800;color:var(--text2)}
.hsvc-pi{display:flex;align-items:center;gap:3px;border:1.5px solid var(--border);border-radius:10px;padding:7px 8px;background:var(--surface2)}
.hsvc-pi span{font-weight:800;color:var(--muted);font-size:13px}
.hsvc-pi input{width:100%;min-width:0;border:none;background:none;outline:none;font-family:'Nunito',sans-serif;font-weight:800;font-size:16px;color:var(--text)}
.hsvc-gate{background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:16px;font-size:14.5px;font-weight:700;color:var(--text2);line-height:1.5}
.hsvc-gate button{margin-top:12px}
.hsvc-note{font-size:13px;font-weight:800;color:#B07A12;background:rgba(240,207,90,.12);border:1.5px solid rgba(240,207,90,.35);border-radius:var(--radius-sm);padding:9px 12px;margin-bottom:10px;line-height:1.5}
.hsvc-q{font-size:13px;font-weight:800;color:var(--muted);background:var(--surface2);border-radius:10px;padding:8px 10px;text-align:center}`;
  var s=document.createElement('style');s.id='hsvc-css';s.textContent=css;document.head.appendChild(s);
})();

function hsvcMoney(v){v=+v;return '$'+(Number.isInteger(v)?v:v.toFixed(2));}
function hsvcInSeason(c){var m=new Date().getMonth()+1;return !c.months||!c.months.length||c.months.indexOf(m)>=0;}

// Catalog (categories + options), loaded once per page
function hsvcCatalog(){
  if(!HSVC.catP){
    HSVC.catP=Promise.all([
      sb.from('service_catalog').select('key,name,emoji,months,price_types,sort_order').eq('active',true).order('sort_order'),
      sb.from('service_options').select('service_key,key,label,kind,quote_only,sort_order').order('sort_order')
    ]).then(function(r){
      if(r[0].error||r[1].error)throw(r[0].error||r[1].error);
      HSVC.cat=r[0].data||[];HSVC.opts=r[1].data||[];return HSVC.cat;
    }).catch(function(e){HSVC.catP=null;console.warn('[hsvc] catalog',e&&e.message||e);return [];});
  }
  return HSVC.catP;
}
function hsvcOptsFor(key){return HSVC.opts.filter(function(o){return o.service_key===key;});}

// Offers → per-service summary, catalog order, in-season only.
// [{key,emoji,name,min,unit,quoteOnly,lines:[[label,text]]}]
function hsvcSummary(rows){
  if(!rows||!rows.length)return [];
  var out=[];
  HSVC.cat.forEach(function(c){
    if(!hsvcInSeason(c))return;
    var mine=rows.filter(function(r){return r.service_key===c.key;});
    if(!mine.length)return;
    var min=null,unit='';
    mine.forEach(function(r){if(r.price!=null&&+r.price>0&&(min===null||+r.price<min)){min=+r.price;unit=(HSVC_PT[r.price_type]||['',''])[1];}});
    var lines=[];
    hsvcOptsFor(c.key).forEach(function(o){
      var rs=mine.filter(function(r){return r.option_key===o.key;});
      if(!rs.length)return;
      if(o.quote_only){lines.push([o.label.replace(/\s*[—-]\s*custom quote$/i,''),'Custom quote']);return;}
      var txt=(c.price_types||[]).map(function(t){var r=rs.find(function(x){return x.price_type===t&&x.price!=null&&+x.price>0;});return r?hsvcMoney(r.price)+HSVC_PT[t][1]:null;}).filter(Boolean).join(' · ');
      if(txt)lines.push([o.label,txt]);
    });
    if(!lines.length)return;
    out.push({key:c.key,emoji:c.emoji||'🏠',name:c.name,min:min,unit:unit,quoteOnly:min===null,lines:lines});
  });
  return out;
}

// ── List card: one line ("❄️ 🪟 🍂 +1 · Services from $8"), filled in after a batched load ──
function hsvcLineHtml(id){
  var s=hsvcSummary(HSVC.cache.get(id));
  if(!s.length)return '';
  var em=s.slice(0,3).map(function(x){return x.emoji;}).join(' ')+(s.length>3?' +'+(s.length-3):'');
  var mins=s.filter(function(x){return x.min!==null;}).map(function(x){return x.min;});
  return em+' · '+(mins.length?'Services from '+hsvcMoney(Math.min.apply(null,mins)):'Services · custom quote');
}
function hsvcCardLine(id){
  if(!id)return '';
  if(!HSVC.cache.has(id)){HSVC.pending.add(id);clearTimeout(HSVC.fillTimer);HSVC.fillTimer=setTimeout(hsvcFill,0);}
  return '<span class="hsvc-line" data-hsvc="'+esc(id)+'">'+(HSVC.cache.has(id)?esc(hsvcLineHtml(id)):'')+'</span>';
}
async function hsvcLoad(ids){
  ids=ids.filter(function(id){return id;});
  if(!ids.length)return;
  await hsvcCatalog();
  for(var i=0;i<ids.length;i+=60){ // chunks keep the request URL short
    var chunk=ids.slice(i,i+60);
    var r=await sb.from('helper_service_offers').select('profile_id,service_key,option_key,price_type,price').eq('active',true).in('profile_id',chunk);
    if(r.error){console.warn('[hsvc] offers',r.error.message);return;}
    chunk.forEach(function(id){HSVC.cache.set(id,[]);});
    (r.data||[]).forEach(function(row){HSVC.cache.get(row.profile_id).push(row);});
  }
}
async function hsvcFill(){
  var ids=Array.from(HSVC.pending).filter(function(id){return !HSVC.cache.has(id);});
  HSVC.pending.clear();
  try{await hsvcLoad(ids);}catch(e){console.warn('[hsvc] fill',e);return;}
  document.querySelectorAll('.hsvc-line[data-hsvc]').forEach(function(el){
    var id=el.getAttribute('data-hsvc');if(HSVC.cache.has(id))el.textContent=hsvcLineHtml(id);
  });
}

// ── Profile card: "Services" block, one collapsed row per service; tap to expand (one open at a time) ──
function hsvcProfileSlot(userId){
  if(!userId)return '';
  setTimeout(async function(){
    try{HSVC.cache.delete(userId);await hsvcLoad([userId]);}catch(e){return;}
    var el=document.querySelector('.hsvc-prof[data-hsvc-prof="'+userId+'"]');
    if(!el)return;
    var s=hsvcSummary(HSVC.cache.get(userId));
    if(!s.length){el.innerHTML='';return;}
    el.innerHTML='<div class="lbl">Services</div>'+s.map(function(x){
      return '<div class="hsvc-row"><div class="hsvc-rh" onclick="hsvcToggleRow(this.parentNode)">'+x.emoji+' '+esc(x.name)+
        '<span class="p">'+(x.quoteOnly?'Custom quote':'from '+hsvcMoney(x.min)+x.unit)+'</span><span class="c">›</span></div>'+
        '<div class="hsvc-rb">'+x.lines.map(function(l){return '<div><span>'+esc(l[0])+'</span><span>'+esc(l[1])+'</span></div>';}).join('')+'</div></div>';
    }).join('');
    document.querySelectorAll('.hsvc-line[data-hsvc="'+userId+'"]').forEach(function(l){l.textContent=hsvcLineHtml(userId);});
  },0);
  return '<div class="hsvc-prof" data-hsvc-prof="'+esc(userId)+'"></div>';
}
function hsvcToggleRow(el){
  var wasOpen=el.classList.contains('open');
  el.parentNode.querySelectorAll('.hsvc-row.open').forEach(function(r){r.classList.remove('open');});
  if(!wasOpen)el.classList.add('open');
}

// ── "Standard services" screen (#app-services, own Save) ──
// Built once from here so index.html only needs the entry points. Back goes to where it was opened from.
function hsvcBuildScreen(){
  if(document.getElementById('app-services'))return;
  var helper=document.getElementById('app-helper');if(!helper||!helper.parentNode)return;
  var v=document.createElement('div');v.className='app-view';v.id='app-services';
  v.innerHTML='<div class="myjobs-inner" style="padding-bottom:40px">'+
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">'+
      '<button onclick="hsvcBack()" aria-label="Back" style="background:none;border:none;color:var(--muted);font-size:22px;cursor:pointer;padding:0;line-height:1">←</button>'+
      '<div class="section-h" style="margin-bottom:0">Standard services</div></div>'+
    '<div id="hsvc-settings"></div>'+
    '<button class="btn-primary" id="hsvc-save-btn" onclick="hsvcSaveClick()" style="display:none">Save services</button>'+
  '</div>';
  helper.parentNode.insertBefore(v,helper.nextSibling);
  // entry points that exist in index.html but stay hidden unless this file loaded
  ['live-svc-btn'].forEach(function(id){var e=document.getElementById(id);if(e)e.style.display='';});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hsvcBuildScreen);else hsvcBuildScreen();

// Direct link from emails: https://yoodle.ca/?go=services opens this screen once the member is signed in
// (17 Nov 2026, Brevo announcement). Remembered for a day so it still works after a magic-link sign-in.
(function(){
  try{
    var q=new URLSearchParams(location.search);
    if(q.get('go')==='services'){
      localStorage.setItem('yoodle_go',JSON.stringify({to:'services',at:Date.now()}));
      q.delete('go');var qs=q.toString();
      history.replaceState(null,'',location.pathname+(qs?'?'+qs:'')+location.hash);
    }
    var g=JSON.parse(localStorage.getItem('yoodle_go')||'null');
    if(!g||g.to!=='services')return;
    if(Date.now()-g.at>86400000){localStorage.removeItem('yoodle_go');return;}
    var tries=0,t=setInterval(function(){
      tries++;
      var ready=typeof me!=='undefined'&&me&&typeof sb!=='undefined'&&sb&&typeof myProfileId!=='undefined'&&myProfileId;
      if(ready&&document.querySelector('.app-view.active')){
        clearInterval(t);localStorage.removeItem('yoodle_go');
        setTimeout(function(){hsvcGoSettings('profile');},400);
      }else if(tries>120)clearInterval(t); // 60 s; the flag stays for the next visit (e.g. after sign-in)
    },500);
  }catch(e){}
})();

// Profile tab button (active, paused and expired helper cards). "NEW" label until opened once on this device.
function hsvcProfileBtn(){
  var seen=false;try{seen=localStorage.getItem('yoodle_hsvc_seen')==='1';}catch(e){}
  return '<button onclick="hsvcGoSettings()" class="pf-btn sec">Standard services'+(seen?'':' <span style="font-size:11px;font-weight:800;color:#fff;background:var(--lime);border-radius:100px;padding:2px 7px;margin-left:4px;vertical-align:1px">NEW</span>')+' ›</button>';
}
function hsvcGoSettings(from){
  try{localStorage.setItem('yoodle_hsvc_seen','1');}catch(e){}
  document.querySelectorAll('.pf-btn').forEach(function(b){if(/Standard services/.test(b.textContent)){var n=b.querySelector('span');if(n)n.remove();}});
  hsvcBuildScreen();
  HSVC.from=from||'profile';
  nav('services');
  try{window.scrollTo(0,0);}catch(e){}
  hsvcOpenSettings();
}
function hsvcBack(){nav(HSVC.from==='helper'?'helper':'profile');}
function hsvcGate(html,btn,to){
  var box=document.getElementById('hsvc-settings'),sv=document.getElementById('hsvc-save-btn');
  if(sv)sv.style.display='none';
  box.innerHTML='<div class="hsvc-gate">'+html+(btn?'<button class="btn-primary" onclick="nav(\''+to+'\')">'+btn+'</button>':'')+'</div>';
}
async function hsvcOpenSettings(){
  var box=document.getElementById('hsvc-settings'),sv=document.getElementById('hsvc-save-btn');
  if(!box||!sb||!me)return;
  HSVC.mine=null;
  if(sv)sv.style.display='none';
  box.innerHTML='<div style="color:var(--muted);font-weight:700;font-size:14px">Loading…</div>';
  var pid=myProfileId||me.id;
  var res=await Promise.all([
    hsvcCatalog(),
    sb.from('helper_service_offers').select('service_key,option_key,price_type,price,active').eq('profile_id',pid),
    sb.from('profiles').select('helper_address,visible_on_map').eq('id',pid).maybeSingle()
  ]);
  var cats=res[0],own=res[1],prof=res[2]&&res[2].data;
  if(own.error||!cats.length){hsvcGate('Could not load services right now. Please try again in a minute.');return;}
  if(!prof||!prof.helper_address){hsvcGate('Standard services are part of your helper profile. Set up your helper profile first, then come back here to add fixed prices.','Set up helper profile ›','helper');return;}
  HSVC.locked=typeof hpIsVagueText==='function'?hpIsVagueText(prof.helper_address):false;
  HSVC.paused=!prof.visible_on_map;
  HSVC.mine=own.data||[];
  var mine=HSVC.mine;
  box.innerHTML='<div class="hsvc-set'+(HSVC.locked?' locked':'')+'" id="hsvc-set">'+
    '<div class="sub">Set fixed prices so homeowners near you can book you directly. Leave a price empty if you don\'t offer that option.</div>'+
    (prof.visible_on_map?'':'<div class="hsvc-note">⏸️ Your helper listing is paused or expired, so neighbours can\'t see these services until you resume it.<br><button class="btn-primary" style="margin-top:10px" onclick="hsvcResume()">Resume listing ›</button></div>')+
    '<div class="hsvc-req">🔒 Uses your helper address to match you with homeowners nearby. It\'s never shown.</div>'+
    '<div class="hsvc-lock">📍 Your helper location is only a city. Add your street address to offer standard services.<br><button class="btn-primary" style="margin-top:10px" onclick="nav(\'helper\')">Add street address ›</button></div>'+
    '<div class="hsvc-cards">'+cats.map(function(c){
      var rows=mine.filter(function(r){return r.service_key===c.key;});
      var on=rows.some(function(r){return r.active;});
      var types=c.price_types||['visit'];
      var opts=hsvcOptsFor(c.key);
      var head='<div></div>'+types.map(function(t){return '<div class="hsvc-gh">'+(HSVC_PT[t]||[t])[0]+'</div>';}).join('');
      var body=opts.map(function(o){
        if(o.quote_only)return '<div class="hsvc-ol">'+esc(o.label.replace(/\s*[—-]\s*custom quote$/i,''))+'</div><div class="hsvc-q" style="grid-column:span '+types.length+'">Custom quote — homeowner messages you</div>';
        return '<div class="hsvc-ol">'+esc(o.label)+'</div>'+types.map(function(t){
          var r=rows.find(function(x){return x.option_key===o.key&&x.price_type===t;});
          var v=r&&r.price!=null&&+r.price>0?(+r.price):''; // $0 = not offered → show empty
          return '<div class="hsvc-pi"><span>$</span><input inputmode="decimal" maxlength="7" data-s="'+c.key+'" data-o="'+o.key+'" data-t="'+t+'" value="'+v+'" placeholder="—" oninput="hsvcSub(\''+c.key+'\')"></div>';
        }).join('');
      }).join('');
      return '<div class="hsvc-card'+(on?' on':'')+'" data-svc="'+c.key+'">'+
        '<div class="hsvc-ch" onclick="hsvcToggleCard(this.parentNode)"><span class="em">'+(c.emoji||'🏠')+'</span><span class="nm">'+esc(c.name)+'<span class="sm" id="hsvc-sm-'+c.key+'"></span></span><span class="hsvc-tog"></span></div>'+
        '<div class="hsvc-cb"><div class="hsvc-grid" style="grid-template-columns:1.25fr repeat('+types.length+',1fr)">'+head+body+'</div></div></div>';
    }).join('')+'</div></div>';
  cats.forEach(function(c){hsvcSub(c.key);});
  if(sv)sv.style.display=HSVC.locked?'none':'';
}
function hsvcLocked(){return !!HSVC.locked;}
async function hsvcSaveClick(){
  if(HSVC.saving||HSVC.mine===null)return;
  if(!hsvcValidate())return;
  var b=document.getElementById('hsvc-save-btn');
  HSVC.saving=true;if(b){b.disabled=true;b.textContent='Saving…';}
  var ok=await hsvcSave();
  HSVC.saving=false;if(b){b.disabled=false;b.textContent='Save services';}
  if(!ok)return;
  toast('✅ Services saved');
  var anyOn=!!document.querySelector('.hsvc-card.on');
  if(HSVC.paused&&anyOn){hsvcAskResume();return;} // paused listing: offer to resume so the services are visible
  hsvcBack();
}
// Resume = the existing helper profile screen (saving it turns the listing back on and renews 90 days)
function hsvcResume(){var w=document.getElementById('hsvc-resume');if(w)w.remove();nav('helper');}
function hsvcAskResume(){
  if(document.getElementById('hsvc-resume'))return;
  var w=document.createElement('div');w.id='hsvc-resume';
  w.style.cssText='position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;justify-content:center;padding:16px 16px calc(16px + var(--sab,0px))';
  w.innerHTML='<div style="width:100%;max-width:420px;background:var(--surface);color:var(--text);border-radius:var(--radius);padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.25);font-family:\'Nunito\',sans-serif">'+
    '<div style="font-size:28px;line-height:1;margin-bottom:8px">⏸️</div>'+
    '<div style="font-size:18px;font-weight:800;margin-bottom:6px">Your listing is paused</div>'+
    '<div style="font-size:15px;font-weight:600;line-height:1.45;margin-bottom:16px">Your services are saved, but neighbours can\'t see them until you resume your helper listing.</div>'+
    '<div style="display:flex;gap:10px">'+
      '<button id="hsvc-rs-later" style="flex:1;padding:12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);background:transparent;color:var(--muted);font-family:\'Nunito\',sans-serif;font-size:15px;font-weight:800;cursor:pointer">Later</button>'+
      '<button onclick="hsvcResume()" style="flex:1;padding:12px;border:none;border-radius:var(--radius-sm);background:var(--btn-a);color:#fff;font-family:\'Nunito\',sans-serif;font-size:15px;font-weight:800;cursor:pointer">Resume listing</button>'+
    '</div></div>';
  document.body.appendChild(w);
  var later=function(){w.remove();hsvcBack();};
  w.addEventListener('click',function(e){if(e.target===w)later();});
  w.querySelector('#hsvc-rs-later').addEventListener('click',later);
}
function hsvcToggleCard(card){card.classList.toggle('on');hsvcSub(card.getAttribute('data-svc'));}
function hsvcSub(key){
  var card=document.querySelector('.hsvc-card[data-svc="'+key+'"]');
  var sm=document.getElementById('hsvc-sm-'+key);
  if(!card||!sm)return;
  if(!card.classList.contains('on')){sm.textContent='Tap to offer';return;}
  var best=null,unit='';
  card.querySelectorAll('input[data-t]').forEach(function(i){var v=parseFloat(i.value);if(!isNaN(v)&&v>0&&(best===null||v<best)){best=v;unit=HSVC_PT[i.getAttribute('data-t')][1];}});
  sm.textContent=best===null?'Add at least one price':'from '+hsvcMoney(best)+unit;
}
// Before saving the helper profile: every switched-on service needs at least one valid price.
function hsvcValidate(){
  if(HSVC.mine===null)return true; // section not loaded → nothing to check
  if(hsvcLocked())return false;    // city-only: save button is hidden; nothing to save
  var cards=document.querySelectorAll('.hsvc-card.on');
  for(var i=0;i<cards.length;i++){
    var c=cards[i],n=0,bad=false;
    c.querySelectorAll('input[data-t]').forEach(function(inp){
      var raw=inp.value.trim();if(!raw)return;
      var v=Number(raw.replace(/^\$/,''));
      if(isNaN(v)||v<0||v>10000)bad=true;else if(v>0)n++; // $0 counts as empty (not offered)
    });
    var name=(c.querySelector('.nm')||{}).firstChild;name=name?name.textContent:'a service';
    if(bad){toast('⚠️ Check the prices for '+name+' (numbers up to 10,000)');c.scrollIntoView({block:'center'});return false;}
    if(!n){toast('⚠️ Add at least one price for '+name+', or switch it off');c.scrollIntoView({block:'center'});return false;}
  }
  return true;
}
// Save button on the services screen: upsert current prices, delete emptied ones.
// Switched-off service → its prices stay but active=false (comes back when switched on).
async function hsvcSave(){
  if(HSVC.mine===null||!sb||!me)return false;
  var pid=myProfileId||me.id,locked=false,now=new Date().toISOString(),rows=[];
  document.querySelectorAll('.hsvc-card').forEach(function(card){
    var key=card.getAttribute('data-svc'),on=card.classList.contains('on')&&!locked,svcRows=[];
    card.querySelectorAll('input[data-t]').forEach(function(inp){
      var raw=inp.value.trim();if(!raw)return;
      var v=Number(raw.replace(/^\$/,''));if(isNaN(v)||v<=0||v>10000)return; // $0 = not offered
      svcRows.push({profile_id:pid,service_key:key,option_key:inp.getAttribute('data-o'),price_type:inp.getAttribute('data-t'),price:Math.round(v*100)/100,active:on,updated_at:now});
    });
    if(svcRows.length){ // quote-only options ride along with the service
      var c=HSVC.cat.find(function(x){return x.key===key;});
      hsvcOptsFor(key).filter(function(o){return o.quote_only;}).forEach(function(o){
        svcRows.push({profile_id:pid,service_key:key,option_key:o.key,price_type:(c&&c.price_types&&c.price_types[0])||'visit',price:null,active:on,updated_at:now});
      });
    }
    rows=rows.concat(svcRows);
  });
  var k=function(r){return r.service_key+'|'+r.option_key+'|'+r.price_type;};
  var keep=new Set(rows.map(k));
  var gone=(HSVC.mine||[]).filter(function(r){return !keep.has(k(r));});
  try{
    if(rows.length){var up=await sb.from('helper_service_offers').upsert(rows,{onConflict:'profile_id,service_key,option_key,price_type'});if(up.error)throw up.error;}
    var dels=await Promise.all(gone.map(function(r){return sb.from('helper_service_offers').delete().match({profile_id:pid,service_key:r.service_key,option_key:r.option_key,price_type:r.price_type});}));
    dels.forEach(function(d){if(d.error)throw d.error;});
  }catch(e){toast('⚠️ Services not saved: '+(e&&e.message||e));return false;}
  HSVC.mine=rows.map(function(r){return {service_key:r.service_key,option_key:r.option_key,price_type:r.price_type,price:r.price,active:r.active};});
  HSVC.cache.delete(pid);
  return true;
}

// ── FILTER: "💲 Fixed-price services" (21 Nov 2026) ──
// 3rd choice in the Filter popup (#hs-ov, index.html), shown ONLY when at least one helper within the map radius
// (ysBaseHelpers) offers an in-season service (Roman, 21 Nov 2026). Its submenu lists those services with counts
// (services nobody nearby offers are left out). Picking one sets hsCat='svc:<service_key>' — same rules as a skill
// pick: one filter at a time, matching helpers glow / others fade, list Helpers tab filtered, ✕ clears.
// Tracking: log_search('svc:<key>') for picks; helper taps carry filter 'svc:<key>' (log_tap).
// index.html hooks (all guarded): ysRender() → hsvcFilterRefresh(); fsStep('svc') → hsvcFilterGrid();
// hsName / hsIcon / hsMatch → hsvcIsKey / hsvcFilterName / hsvcFilterIcon / hsvcFilterMatch.
// This file adds the choice button and the #fs-svc pane itself (hsvcFilterMarkup).
var HSVC_F={timer:null};
function hsvcIsKey(k){return typeof k==='string'&&k.indexOf('svc:')===0;}
function hsvcFilterCat(k){var key=String(k).slice(4);return HSVC.cat.find(function(c){return c.key===key;});}
// short name for the filter ("Snow removal — driveway" → "Snow removal") so it fits the tiles and the Filter button
function hsvcShort(n){return String(n||'').replace(/\s+[—–-]\s.*$/,'');}
function hsvcFilterName(k){var c=hsvcFilterCat(k);return c?hsvcShort(c.name):'Fixed-price services';}
function hsvcFilterIcon(k){var c=hsvcFilterCat(k);return c?(c.emoji||'🏠'):'💲';}
function hsvcOffers(h,key){var rows=h&&HSVC.cache.get(h.id);return !!rows&&hsvcSummary(rows).some(function(s){return s.key===key;});}
function hsvcFilterMatch(h,k){return hsvcOffers(h,String(k).slice(4));}
function hsvcBase(){return (typeof ysBaseHelpers!=='undefined'&&ysBaseHelpers)||[];}
// {service_key: number of nearby helpers offering it} — in-season, active services with a real price or custom quote
function hsvcFilterCounts(){
  var c={};
  hsvcBase().forEach(function(h){
    var rows=HSVC.cache.get(h.id);if(!rows||!rows.length)return;
    hsvcSummary(rows).forEach(function(s){c[s.key]=(c[s.key]||0)+1;});
  });
  return c;
}
function hsvcFilterMarkup(){
  var st=document.getElementById('fs-start');
  if(!st||document.getElementById('fs-svc-choice'))return;
  var b=document.createElement('button');
  b.className='fs-choice svc';b.id='fs-svc-choice';b.style.display='none';b.setAttribute('onclick',"fsStep('svc')");
  b.innerHTML='<span class="e">💲</span><span><b>Fixed-price services</b><small id="fs-svc-small">Prices set up front</small></span>';
  var pro=st.querySelector('.fs-choice.pro');if(pro)pro.insertAdjacentElement('afterend',b);else st.appendChild(b);
  var pane=document.createElement('div');pane.className='fs-pane';pane.id='fs-svc';
  pane.innerHTML='<div class="hs-head"><b><button class="fs-back" onclick="fsStep(\'start\')" aria-label="Back">‹</button>Fixed-price services</b>'+
    '<button class="hs-close" onclick="hsClose()" aria-label="Close">✕</button></div>'+
    '<div class="hs-sub">Helpers near you who list their prices</div><div id="fs-svc-grid" class="hs-grid" style="margin-top:12px"></div>';
  var pp=document.getElementById('fs-pro');
  if(pp)pp.insertAdjacentElement('afterend',pane);else{var pop=document.getElementById('fs-pop');if(pop)pop.appendChild(pane);}
}
function hsvcFilterGrid(){
  var el=document.getElementById('fs-svc-grid');if(!el)return;
  var cnt=hsvcFilterCounts(),cur=(typeof hsCat!=='undefined')?hsCat:null;
  var list=HSVC.cat.filter(function(c){return cnt[c.key];});
  el.innerHTML=list.length?list.map(function(c){
    return '<button class="hs-cat'+(cur==='svc:'+c.key?' on':'')+'" onclick="hsPick(\'svc:'+esc(c.key)+'\')"><span class="e">'+(c.emoji||'🏠')+'</span>'+
      '<span class="t">'+esc(hsvcShort(c.name))+'</span><span class="n">'+cnt[c.key]+'</span></button>';
  }).join(''):'<div class="ps-empty">No fixed-price helpers near you yet.</div>';
}
// called (debounced) whenever the nearby helpers change: load missing offers, then show/hide the choice
function hsvcFilterRefresh(){clearTimeout(HSVC_F.timer);HSVC_F.timer=setTimeout(hsvcFilterSync,250);}
async function hsvcFilterSync(){
  if(typeof sb==='undefined'||!sb)return;
  hsvcFilterMarkup();
  var miss=hsvcBase().map(function(h){return h.id;}).filter(function(id){return id&&!HSVC.cache.has(id);});
  try{await hsvcCatalog();if(miss.length)await hsvcLoad(miss);}catch(e){console.warn('[hsvc] filter',e&&e.message||e);}
  var cnt=hsvcFilterCounts(),names=HSVC.cat.filter(function(c){return cnt[c.key];}).map(function(c){return hsvcShort(c.name);});
  var ch=document.getElementById('fs-svc-choice');if(ch)ch.style.display=names.length?'':'none';
  var sm=document.getElementById('fs-svc-small');
  if(sm)sm.textContent=names.length>2?names.slice(0,2).join(', ')+' & more':names.join(' · ');
  if(document.getElementById('fs-svc')&&document.getElementById('fs-svc').classList.contains('on'))hsvcFilterGrid();
  // a service filter is on and new helpers came into range → redraw so they glow / list correctly
  if(miss.length&&typeof hsCat!=='undefined'&&hsvcIsKey(hsCat)){
    try{renderMapPins();renderListTabContent();}catch(e){}
  }
}
(function(){var s=document.getElementById('hsvc-css');if(s)s.textContent+='\n.fs-choice.svc{border-color:rgba(46,125,82,.55)}';})();
