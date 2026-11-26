// Landing page visitors → sign-in rate (26 Nov 2026, idea board #7). Own file, classic deferred script; bump ?v= on every change.
// Counts real people who see the signed-out landing page (public.landing_visits, one row per browser per Toronto day)
// and links the visit to the account after sign-in. Bot filter: skips crawler user agents / automated browsers and
// only counts after a first tap, scroll or key press, or ~3 s with the page visible.
// Fire-and-forget like js/analytics.js: never blocks or breaks the page.
// Hooks (guarded, so the page works without this file):
//   main.js, signed out on load → if(window.trackLandingVisit)trackLandingVisit();
//   showApp(), after sign-in    → if(window.linkLandingVisit)linkLandingVisit();
(function(){
  const KEY='yoodle_lv'; // this browser's visit, kept through sign-in (Google sign-in reloads the page)
  const BOT=/bot|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|preview|facebookexternalhit|embedly|ahrefs|semrush|mj12|petal|yandex|baidu|python|curl|wget|httpclient|java\/|go-http|node-fetch|axios/i;
  const MAX_AGE=7*24*60*60*1000;

  function anon(){try{return typeof yAnonId==='function'?yAnonId():null;}catch(e){return null;}}
  function isBot(){try{return navigator.webdriver===true||BOT.test(navigator.userAgent||'');}catch(e){return true;}}
  function platform(){
    try{
      if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())return 'ios';
      if(window.navigator.standalone===true||window.matchMedia('(display-mode:standalone)').matches)return 'pwa';
    }catch(e){}
    return 'web';
  }
  // Where they came from: referrer site only (never the full URL), plus utm_source / utm_campaign if present.
  function source(){
    const s={ref:null,src:null,camp:null};
    try{
      const r=document.referrer?new URL(document.referrer).hostname.replace(/^www\./,''):'';
      if(r&&r!==location.hostname.replace(/^www\./,''))s.ref=r;
      const q=new URLSearchParams(location.search);
      s.src=q.get('utm_source');s.camp=q.get('utm_campaign');
    }catch(e){}
    return s;
  }
  function readSaved(){try{const d=JSON.parse(localStorage.getItem(KEY)||'null');return d&&Date.now()-(d.ts||0)<MAX_AGE?d:null;}catch(e){return null;}}
  function args(d){return{p_anon:anon(),p_ref:d.ref||null,p_utm_source:d.src||null,p_utm_campaign:d.camp||null,p_platform:d.plat||'web'};}
  function call(name,a,done){
    try{
      if(typeof sb==='undefined'||!sb||!a.p_anon)return;
      sb.rpc(name,a).then(r=>{if(r&&r.error)console.warn('[log] '+name+': '+r.error.message);else if(done)done();},
                          e=>console.warn('[log] '+name+': '+(e&&e.message||e)));
    }catch(e){}
  }

  let armed=false;
  // Signed out, landing page showing. Waits for a sign of a real person, then logs once.
  window.trackLandingVisit=function(){
    if(armed||isBot()||!anon())return;
    armed=true;
    // Keep the first source of the 7-day window (a reload or an OAuth return has no referrer).
    let d=readSaved();
    if(!d){const s=source();d={ts:Date.now(),ref:s.ref,src:s.src,camp:s.camp,plat:platform()};}
    let fired=false,timer=null;
    const evs=['pointerdown','touchstart','scroll','keydown','wheel'];
    function fire(){
      if(fired)return;fired=true;
      evs.forEach(e=>window.removeEventListener(e,fire,true));
      document.removeEventListener('visibilitychange',onVis);
      if(timer)clearTimeout(timer);
      if(typeof me!=='undefined'&&me)return; // signed in meanwhile: linkLandingVisit() covers it
      try{localStorage.setItem(KEY,JSON.stringify(d));}catch(e){}
      call('log_landing_visit',args(d));
    }
    function startTimer(){if(!timer&&document.visibilityState==='visible')timer=setTimeout(fire,3000);}
    function onVis(){if(document.visibilityState==='visible')startTimer();else if(timer){clearTimeout(timer);timer=null;}}
    evs.forEach(e=>window.addEventListener(e,fire,{capture:true,passive:true}));
    document.addEventListener('visibilitychange',onVis);
    startTimer();
  };

  // Signed in. Only does anything if this browser logged a landing visit in the last 7 days; then forgets it.
  window.linkLandingVisit=function(){
    const d=readSaved();
    if(!d){try{localStorage.removeItem(KEY);}catch(e){}return;}
    call('link_landing_visit',args(d),()=>{try{localStorage.removeItem(KEY);}catch(e){}});
  };
})();
