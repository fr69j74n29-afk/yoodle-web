// Shared address search (Nominatim) used by Post a Job, Edit job, Home base and the helper profile.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

// ── SHARED ADDRESS LOOKUP ── used by the Post-a-Job form and the helper profile.
// Each screen keeps its own rules (formatting, rounding, confirm step) in its own functions below.
async function geoFetch(path){
  const r=await fetch('https://nominatim.openstreetmap.org/'+path,{headers:{'Accept-Language':'en','User-Agent':'Yoodle-App'}});
  return r.json();
}
// "road, area, city, prov" with blanks and repeats removed
function addrDisplay(parts){const seen=new Set();return parts.filter(v=>{if(!v||seen.has(v))return false;seen.add(v);return true;}).join(', ');}
// Debounced type-ahead: cfg = {sugId, statusId, pickFn (global fn name for onclick), format(item)->{main,sub}, noResults}
function makeAddrSearch(cfg){
  let timer=null,data=[];
  const sug=()=>document.getElementById(cfg.sugId),st=()=>document.getElementById(cfg.statusId);
  async function run(query){
    try{
      data=await geoFetch(`search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=6&countrycodes=ca,us`);
      if(!data.length){sug().classList.remove('open');st().textContent=cfg.noResults;st().className='loc-status manual';return;}
      sug().innerHTML=data.map((item,i)=>{const f=cfg.format(item);
        return`<div class="loc-suggestion" onclick="${cfg.pickFn}(${i})">
        <div class="sug-main">${esc(f.main)}</div>
        <div class="sug-sub">${esc(f.sub)}</div>
      </div>`;}).join('');
      sug().classList.add('open');st().textContent='';st().className='loc-status';
    }catch(e){st().textContent='Could not search — check connection';st().className='loc-status manual';}
  }
  return{
    input(val){clearTimeout(timer);if(val.length<3){sug().classList.remove('open');return false;}timer=setTimeout(()=>run(val),400);return true;},
    item(i){return data[i];}
  };
}
