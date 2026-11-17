// ══ STANDARD SERVICES (17 Nov 2026) ══
// Helpers set fixed prices for standard home services (snow removal, windows, gutters, bins…) in their
// helper profile; prices show on the helper list card (one line) and the profile card (collapsed rows).
// Tables: service_catalog (categories), service_options (sizes/add-ons), helper_service_offers (prices).
// Catalog is data-driven: add/remove a category in Supabase, no code change.
// Rules (Roman, 17 Nov 2026): street-level helper address required (city-only = hpLocVague → locked);
// services show only while the helper listing is active; empty price = option not offered;
// quote_only options (e.g. "Other — custom quote") have no price.
// Loaded as a classic deferred script (NOT a module): index.html calls these by name through guarded
// hooks (if(window.hsvcX)…), and this file reads index.html globals (sb, me, myProfileId, hpLocVague,
// esc, toast, nav) at call time. If this file fails to load, the app works as before without services.

var HSVC={catP:null,cat:[],opts:[],cache:new Map(),pending:new Set(),fillTimer:null,mine:null,lockTimer:null,scrollNext:false};
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
    mine.forEach(function(r){if(r.price!=null&&(min===null||+r.price<min)){min=+r.price;unit=(HSVC_PT[r.price_type]||['',''])[1];}});
    var lines=[];
    hsvcOptsFor(c.key).forEach(function(o){
      var rs=mine.filter(function(r){return r.option_key===o.key;});
      if(!rs.length)return;
      if(o.quote_only){lines.push([o.label.replace(/\s*[—-]\s*custom quote$/i,''),'Custom quote']);return;}
      var txt=(c.price_types||[]).map(function(t){var r=rs.find(function(x){return x.price_type===t&&x.price!=null;});return r?hsvcMoney(r.price)+HSVC_PT[t][1]:null;}).filter(Boolean).join(' · ');
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

// ── Helper profile: "Standard services" settings section (container #hsvc-settings) ──
function hsvcGoSettings(){HSVC.scrollNext=true;nav('helper');}
function hsvcLocked(){return typeof hpLocVague!=='undefined'&&!!hpLocVague;}
async function hsvcOpenSettings(){
  var box=document.getElementById('hsvc-settings');
  if(!box||!sb||!me)return;
  HSVC.mine=null;
  box.innerHTML='<div class="form-g hsvc-set"><label class="form-lbl">Standard services</label><div class="sub">Loading…</div></div>';
  var pid=myProfileId||me.id;
  var res=await Promise.all([hsvcCatalog(),sb.from('helper_service_offers').select('service_key,option_key,price_type,price,active').eq('profile_id',pid)]);
  var cats=res[0],own=res[1];
  if(own.error||!cats.length){box.innerHTML='<div class="form-g hsvc-set"><label class="form-lbl">Standard services</label><div class="sub">Could not load services right now. Your other profile details still save.</div></div>';return;}
  HSVC.mine=own.data||[];
  var mine=HSVC.mine;
  box.innerHTML='<div class="form-g hsvc-set" id="hsvc-set">'+
    '<label class="form-lbl">Standard services</label>'+
    '<div class="hsvc-req">🔒 Needs your street address (set at the top of this screen). It\'s used only to match you with homeowners nearby and is never shown.</div>'+
    '<div class="hsvc-lock">📍 Your location is only a city. Add your street address at the top of this screen to offer standard services.</div>'+
    '<div class="sub">Set fixed prices so homeowners near you can book you directly. Leave a price empty if you don\'t offer that option.</div>'+
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
          var v=r&&r.price!=null?(+r.price):'';
          return '<div class="hsvc-pi"><span>$</span><input inputmode="decimal" maxlength="7" data-s="'+c.key+'" data-o="'+o.key+'" data-t="'+t+'" value="'+v+'" placeholder="—" oninput="hsvcSub(\''+c.key+'\')"></div>';
        }).join('');
      }).join('');
      return '<div class="hsvc-card'+(on?' on':'')+'" data-svc="'+c.key+'">'+
        '<div class="hsvc-ch" onclick="hsvcToggleCard(this.parentNode)"><span class="em">'+(c.emoji||'🏠')+'</span><span class="nm">'+esc(c.name)+'<span class="sm" id="hsvc-sm-'+c.key+'"></span></span><span class="hsvc-tog"></span></div>'+
        '<div class="hsvc-cb"><div class="hsvc-grid" style="grid-template-columns:1.25fr repeat('+types.length+',1fr)">'+head+body+'</div></div></div>';
    }).join('')+'</div></div>';
  cats.forEach(function(c){hsvcSub(c.key);});
  hsvcSyncLock();
  clearInterval(HSVC.lockTimer); // follow address changes while the helper screen is open
  HSVC.lockTimer=setInterval(function(){
    var scr=document.getElementById('app-helper');
    if(!scr||!scr.classList.contains('active')){clearInterval(HSVC.lockTimer);return;}
    hsvcSyncLock();
  },800);
  if(HSVC.scrollNext){HSVC.scrollNext=false;try{document.getElementById('hsvc-set').scrollIntoView({block:'start'});}catch(e){}}
}
function hsvcSyncLock(){var s=document.getElementById('hsvc-set');if(s)s.classList.toggle('locked',hsvcLocked());}
function hsvcToggleCard(card){card.classList.toggle('on');hsvcSub(card.getAttribute('data-svc'));}
function hsvcSub(key){
  var card=document.querySelector('.hsvc-card[data-svc="'+key+'"]');
  var sm=document.getElementById('hsvc-sm-'+key);
  if(!card||!sm)return;
  if(!card.classList.contains('on')){sm.textContent='Tap to offer';return;}
  var best=null,unit='';
  card.querySelectorAll('input[data-t]').forEach(function(i){var v=parseFloat(i.value);if(!isNaN(v)&&(best===null||v<best)){best=v;unit=HSVC_PT[i.getAttribute('data-t')][1];}});
  sm.textContent=best===null?'Add at least one price':'from '+hsvcMoney(best)+unit;
}
// Before saving the helper profile: every switched-on service needs at least one valid price.
function hsvcValidate(){
  if(HSVC.mine===null)return true; // section not loaded → nothing to check
  if(hsvcLocked())return true;     // city-only: services get paused on save, nothing to validate
  var cards=document.querySelectorAll('.hsvc-card.on');
  for(var i=0;i<cards.length;i++){
    var c=cards[i],n=0,bad=false;
    c.querySelectorAll('input[data-t]').forEach(function(inp){
      var raw=inp.value.trim();if(!raw)return;
      var v=Number(raw.replace(/^\$/,''));
      if(isNaN(v)||v<0||v>10000)bad=true;else n++;
    });
    var name=(c.querySelector('.nm')||{}).firstChild;name=name?name.textContent:'a service';
    if(bad){toast('⚠️ Check the prices for '+name+' (numbers from 0 to 10,000)');c.scrollIntoView({block:'center'});return false;}
    if(!n){toast('⚠️ Add at least one price for '+name+', or switch it off');c.scrollIntoView({block:'center'});return false;}
  }
  return true;
}
// After the helper profile saves: upsert current prices, delete emptied ones.
// Switched-off service → its prices stay but active=false (comes back when switched on).
// City-only address → everything saved as paused.
async function hsvcSave(){
  if(HSVC.mine===null||!sb||!me)return true;
  var pid=myProfileId||me.id,locked=hsvcLocked(),now=new Date().toISOString(),rows=[];
  document.querySelectorAll('.hsvc-card').forEach(function(card){
    var key=card.getAttribute('data-svc'),on=card.classList.contains('on')&&!locked,svcRows=[];
    card.querySelectorAll('input[data-t]').forEach(function(inp){
      var raw=inp.value.trim();if(!raw)return;
      var v=Number(raw.replace(/^\$/,''));if(isNaN(v)||v<0||v>10000)return;
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
  }catch(e){var m=e&&e.message||e;setTimeout(function(){toast('⚠️ Profile saved, but services were not: '+m);},1800);return false;} // after the "profile saved" toast
  HSVC.mine=rows.map(function(r){return {service_key:r.service_key,option_key:r.option_key,price_type:r.price_type,price:r.price,active:r.active};});
  HSVC.cache.delete(pid);
  if(locked&&rows.length)setTimeout(function(){toast('📍 Services paused: add your street address to offer them');},1800);
  return true;
}
