// App-wide constants: Supabase project, staging flags, job category colours, emoji and icons.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

const SUPABASE_URL  = 'https://pyzugtltkbpcxvokdmps.supabase.co';
// Staging copy (17 Nov 2026): the staging branch is published at yoodle.ca/staging/ (see .github/workflows/deploy.yml).
// Same database as the live site. On staging: sign-in returns to /staging/, no push signup, and a STAGING label shows.
const IS_STAGING=location.pathname.startsWith('/staging/');
const AUTH_RETURN=IS_STAGING?location.origin+'/staging/':location.origin; // live: unchanged (origin)
// Native app (Capacitor iOS/Android, 20 Nov 2026, capacitor-build.md in the private yoodle-docs repo). Always false on the website.
// In the app, sign-in returns through the deep link below (registered in ios/App/App/Info.plist; must be in Supabase Auth → Redirect URLs).
const IS_NATIVE=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
const NATIVE_AUTH_RETURN='ca.yoodle.app://auth';
// App only (20 Nov 2026): route the page's existing web APIs to Capacitor plugins, so the rest of this file stays the same
// as the website. Plugins are injected by the app at page start (window.Capacitor.Plugins.*).
if(IS_NATIVE)(function(){
  document.documentElement.classList.add('native-app'); // app-only CSS (e.g. no paid ID verification offers)
  const P=window.Capacitor.Plugins||{};
  // Links/windows: site pages (/terms, /faq, faq.html …) open the live yoodle.ca page, other sites open in the in-app browser
  // sheet. Without this Capacitor sends them to Safari, and site pages bundled in the app would just show the home screen.
  // Compare scheme+host, not .origin: for capacitor:// URLs the URL parser's .origin is "null"
  const isApp=u=>u.protocol===location.protocol&&u.host===location.host;
  const openExt=url=>{
    if(!P.Browser)return false;
    let u;try{u=new URL(url,location.href);}catch(e){return false;}
    if(isApp(u))u=new URL(u.pathname+u.search+u.hash,'https://yoodle.ca');
    else if(!/^https?:$/.test(u.protocol))return false; // mailto:, tel: … → the system handles them
    P.Browser.open({url:u.href}).catch(()=>{});return true;
  };
  window.open=function(url){
    // window.open('') then w.location.replace(dest) (tutor handoff): hand back a stand-in window that opens dest in the sheet
    if(!url){const w={closed:false,opener:null,close(){w.closed=true;},location:{replace:d=>{w.closed=true;openExt(d);}}};return w;}
    openExt(url);return null;
  };
  document.addEventListener('click',e=>{
    if(e.defaultPrevented)return; // a handler already dealt with it (e.g. openTutorSignedIn)
    const a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;
    const href=a.getAttribute('href');if(!href||href[0]==='#'||/^javascript:/i.test(href))return;
    let u;try{u=new URL(href,location.href);}catch(_){return;}
    if(isApp(u)&&(u.pathname==='/'||u.pathname==='/index.html'))return; // stays in the app
    if(openExt(u.href))e.preventDefault();
  });
  // Share sheet (Android WebView has no navigator.share; iOS gets the native sheet)
  if(P.Share){
    Object.defineProperty(navigator,'share',{configurable:true,value:d=>P.Share.share({title:d&&d.title,text:d&&d.text,url:d&&d.url}).then(()=>{},err=>{const x=new Error((err&&err.message)||'Share cancelled');x.name='AbortError';throw x;})});
    Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
  }
  // Location: the native permission prompt names Yoodle (Info.plist purpose text) instead of WebKit's "localhost wants your location"
  if(P.Geolocation){
    const G=P.Geolocation,watches={};let n=0;
    const err=e=>{const m=(e&&e.message)||'Location unavailable';return{code:/denied|permission/i.test(m)?1:/time/i.test(m)?3:2,message:m,PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3};};
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
      getCurrentPosition(ok,fail,o){G.getCurrentPosition(o||{}).then(ok,e=>fail&&fail(err(e)));},
      watchPosition(ok,fail,o){
        const k=++n;watches[k]=undefined;
        Promise.resolve(G.watchPosition(o||{},(p,e)=>{if(e){if(fail)fail(err(e));}else if(p)ok(p);}))
          .then(id=>{if(watches[k]===null)G.clearWatch({id});else watches[k]=id;},e=>fail&&fail(err(e)));
        return k;
      },
      clearWatch(k){const id=watches[k];if(id)G.clearWatch({id});watches[k]=null;}
    }});
  }
})();
// STAGING badge: position:absolute inside body (not fixed): iOS Safari treats fixed elements on the top edge specially (toolbar tinting / page under the bars) (26 Nov 2026)
if(IS_STAGING)document.addEventListener('DOMContentLoaded',()=>{const b=document.createElement('div');b.textContent='STAGING';b.setAttribute('aria-hidden','true');b.style.cssText='position:absolute;top:max(6px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:99999;background:#DC2626;color:#fff;font:900 10.5px/1 Nunito,sans-serif;letter-spacing:1px;padding:4px 8px;border-radius:6px;pointer-events:none';document.body.appendChild(b);});
const SUPABASE_ANON = 'sb_publishable_9qnjqRwusYBArg79bBv81w_kauJZPBZ';

const CAT_COLOR = {
  assembly: '#8B6E3E',
  yard: '#5C8A6A',
  moving: '#4A9E7A',
  errands: '#7A8A7C',
  other: '#3D6B50'
};

const CAT_EMOJI = {
  assembly: '🔧',
  yard: '🌿',
  moving: '📦',
  errands: '🏃',
  other: '📋'
};

// Inline SVG icons for JS-built labels (Feather-style, matches bottom-nav strokes)
const ICO={
  hand:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M7 11v8m0-8L9.5 4.5a1.8 1.8 0 0 1 3.4 1.2L12 9h6.2a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 17 19H7"/><path d="M7 11H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h3"/></svg>',
  nav:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
  pin:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;vertical-align:-2px;margin-right:3px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
};
