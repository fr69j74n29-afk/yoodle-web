// App-wide constants: Supabase project, staging flags, job category colours, emoji and icons.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

const SUPABASE_URL  = 'https://pyzugtltkbpcxvokdmps.supabase.co';
// Staging copy (17 Nov 2026): the staging branch is published at yoodle.ca/staging/ (see .github/workflows/deploy.yml).
// Same database as the live site. On staging: sign-in returns to /staging/, no push signup, and a STAGING label shows.
const IS_STAGING=location.pathname.startsWith('/staging/');
const AUTH_RETURN=IS_STAGING?location.origin+'/staging/':location.origin; // live: unchanged (origin)
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
