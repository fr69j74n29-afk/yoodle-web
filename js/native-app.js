// Native app only (Capacitor iOS/Android, capacitor-build.md §2.7 in the private yoodle-docs repo). Does nothing on the website.
// Reads https://yoodle.ca/app-version.json on start and on resume (at most every 10 min) and uses it for two things:
//
// 1. App version check (Roman, note 1 §3 / note 2 §B), against the installed app build (App Store / Play version):
//    below "min"    → full-screen "Update required" with one button to the store. For native changes old builds can't do
//                     without (plugins, permissions), or a database change old code would break on. Web-only changes
//                     never need it: live updates (2.) deliver them.
//    below "latest" → a "New version available" banner the user can close (once per "latest" version).
//    "store": { "ios": "https://apps.apple.com/app/id…", "android": "…" } is where the button goes. Set it before raising min.
//    A "min" above "latest" is treated as a typo and ignored, so one wrong digit can't lock everyone out.
//
// 2. Self-hosted live updates: the free @capgo/capacitor-updater plugin in manual mode (capacitor.config.json autoUpdate
//    "off"), no Capgo account. "bundle" (version / url / checksum / min_native) names the current web bundle, a GitHub
//    Release asset made by .github/workflows/app-bundle.yml. If it differs from the one running: download it (the plugin
//    verifies the sha256 checksum) → next(): the phone switches to it the next time the app goes to the background.
//    The new bundle must call notifyAppReady() (below) within 10 s or the plugin rolls back to the previous one; that
//    version is then remembered as failed and not downloaded again.
//    Rollback for everyone: point app-version.json back at an older bundle; phones switch to whatever the file names.
//
// Test phones: tap "App version" at the bottom of Settings 7 times to use /staging/app-version.json instead.
// Plain script (the site has no bundler), so plugins come from window.Capacitor.Plugins, not imports.
var AU = { on: false, plugin: null, busy: false, lastCheck: 0, blocked: false, taps: 0, tapTimer: null };
var AU_EVERY_MS = 10 * 60 * 1000; // resume checks: at most every 10 minutes (Supabase isn't involved, but keep it light)

(function () {
  var C = window.Capacitor;
  if (!(C && C.isNativePlatform && C.isNativePlatform())) return;
  AU.on = true;
  var P = C.Plugins || {};
  var U = P.CapacitorUpdater;
  if (P.App) P.App.addListener('resume', function () { auCheck(false); });
  if (!U) { auCheck(true); return; }
  AU.plugin = U;
  // First, before anything else can fail: this bundle started fine, keep it.
  U.notifyAppReady().catch(function () {});
  // A bundle that rolled back since the last start: never offer that version again (the plugin deletes failed bundles,
  // so without this the same broken bundle would be downloaded and tried on every check).
  if (U.getFailedUpdate) U.getFailedUpdate().then(function (f) {
    var v = f && f.bundle && f.bundle.version;
    if (v) { auFailedAdd(v); console.warn('Live update ' + v + ' failed to start and was rolled back'); }
  }).catch(function () {}).then(function () { auCheck(true); });
  else auCheck(true);
  auShowVersion();
})();

function auChannel() {
  try { return localStorage.getItem('yoodle_update_channel') === 'staging' ? 'staging' : 'production'; } catch (e) { return 'production'; }
}
function auManifestUrl() {
  return 'https://yoodle.ca/' + (auChannel() === 'staging' ? 'staging/' : '') + 'app-version.json';
}
function auFailed() {
  try { return JSON.parse(localStorage.getItem('yoodle_update_failed') || '[]'); } catch (e) { return []; }
}
function auFailedAdd(v) {
  var l = auFailed().filter(function (x) { return x !== v; }); l.push(v);
  try { localStorage.setItem('yoodle_update_failed', JSON.stringify(l.slice(-20))); } catch (e) {}
}
// Compares dotted version numbers: -1, 0 or 1. "1.0" and "1.0.0" are equal.
function auCmp(a, b) {
  var x = String(a || '0').split('.'), y = String(b || '0').split('.');
  for (var i = 0; i < Math.max(x.length, y.length); i++) {
    var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
// Installed app build version ("1.0"): from the updater if present, else from @capacitor/app
async function auNativeVersion(cur) {
  if (cur && cur.native) return cur.native;
  var A = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  return A ? (await A.getInfo()).version : '';
}

async function auCheck(force) {
  if (!AU.on || AU.busy) return;
  var now = Date.now();
  // While "Update required" is showing, check on every resume: the user may have come back from the store.
  if (!force && !AU.blocked && now - AU.lastCheck < AU_EVERY_MS) return;
  AU.busy = true; AU.lastCheck = now;
  try {
    var r = await fetch(auManifestUrl() + '?t=' + now, { cache: 'no-store' });
    if (!r.ok) return;
    var m = await r.json();
    var U = AU.plugin;
    var cur = U ? await U.current() : null; // { bundle: { id, version, ... }, native: "1.0" }
    var native = await auNativeVersion(cur);
    if (native) auVersionGate(m, native);
    if (U) await auLiveUpdate(U, m.bundle, cur, native);
  } catch (e) {
    console.warn('App version / live update check failed:', e);
  } finally {
    AU.busy = false;
  }
}

async function auLiveUpdate(U, b, cur, native) {
  if (!b || !b.version || !b.url) return; // no live update published: keep the bundle that's running
  if (b.min_native && auCmp(native, b.min_native) < 0) return; // made for a newer app build: this phone needs the store update first
  // Bundles are numbered <app major.minor>.<run>. One below the installed app version (e.g. 1.0.57 on app 1.1) is older
  // than the bundle built into this app, so never go back to it (same rule as Capgo's "no bundles below native").
  if (auCmp(b.version, native) < 0) return;
  if (cur.bundle && cur.bundle.version === b.version) return; // already running it
  if (auFailed().indexOf(b.version) >= 0) return; // rolled back on this phone before
  var next = U.getNextBundle ? await U.getNextBundle() : null;
  if (next && next.version === b.version) return; // already downloaded, waiting for the app to go to the background
  // Downloaded before (e.g. going back to an older bundle)? Reuse it instead of downloading again.
  var have = ((await U.list()).bundles || []).filter(function (x) { return x.version === b.version && x.status !== 'error' && x.status !== 'deleted' && x.status !== 'deleting' && x.status !== 'downloading'; })[0];
  if (!have) {
    var opts = { url: b.url, version: b.version };
    if (b.checksum) opts.checksum = b.checksum;
    if (b.session_key) opts.sessionKey = b.session_key; // only if bundles are encrypted (capacitor-build.md §2.7 change 1)
    have = await U.download(opts);
  }
  await U.next({ id: have.id });
  console.log('Live update ' + b.version + ' (' + auChannel() + ') ready; it starts the next time the app goes to the background');
}

// ---- App version check: "Update required" screen and "New version available" banner ----
function auVersionGate(m, native) {
  var min = m && m.min, latest = m && m.latest;
  if (min && latest && auCmp(min, latest) > 0) { console.warn('app-version.json: min ' + min + ' is above latest ' + latest + ', ignored'); min = ''; }
  var block = !!(min && auCmp(native, min) < 0);
  AU.blocked = block;
  var ov = document.getElementById('au-required');
  if (block) auShowRequired(m);
  else if (ov) ov.remove();
  var dismissed = '';
  try { dismissed = localStorage.getItem('yoodle_update_banner_closed') || ''; } catch (e) {}
  var banner = document.getElementById('au-banner');
  if (!block && latest && auCmp(native, latest) < 0 && dismissed !== latest) auShowBanner(m);
  else if (banner) banner.remove();
}
function auStoreUrl(m) {
  var s = (m && m.store) || {};
  var android = window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'android';
  if (android) return (s.android || 'https://play.google.com/store/apps/details?id=ca.yoodle.app').replace(/^https:\/\/play\.google\.com\/store\/apps\//, 'market://');
  return (s.ios || 'https://apps.apple.com/').replace(/^https:/, 'itms-apps:');
}
// itms-apps: / market: aren't web links, so Capacitor hands them to the phone, which opens the App Store / Play app
// (core-config.js only sends http(s) links to the in-app browser sheet).
function auOpenStore() { window.location.href = auStoreUrl(AU.manifest); }
function auEsc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

function auShowRequired(m) {
  AU.manifest = m;
  var el = document.getElementById('au-required');
  if (!el) {
    el = document.createElement('div');
    el.id = 'au-required';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-modal', 'true');
    el.style.cssText = 'position:fixed;inset:0;z-index:5000;background:var(--bg);color:var(--text);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:calc(var(--sat,0px) + 24px) 28px calc(env(safe-area-inset-bottom,0px) + 24px);font-family:\'Nunito\',sans-serif';
    document.body.appendChild(el);
  }
  el.innerHTML =
    '<img src="icon-192.png" alt="" style="width:84px;height:84px;border-radius:20px;margin-bottom:22px">' +
    '<div style="font-size:24px;font-weight:800;margin-bottom:10px">Update required</div>' +
    '<div style="font-size:15.5px;line-height:1.55;color:var(--text2);max-width:340px;margin-bottom:26px">' +
      auEsc((m && m.message) || 'This version of Yoodle is no longer supported. Please update the app to keep using it.') + '</div>' +
    '<button class="btn-primary" style="max-width:340px" onclick="auOpenStore()">Update Yoodle</button>';
}
function auShowBanner(m) {
  AU.manifest = m;
  if (document.getElementById('au-banner')) return;
  var el = document.createElement('div');
  el.id = 'au-banner';
  el.setAttribute('role', 'status');
  el.style.cssText = 'position:fixed;left:10px;right:10px;top:calc(var(--sat,0px) + 8px);z-index:1900;display:flex;align-items:center;gap:10px;padding:10px 10px 10px 14px;border-radius:14px;background:var(--surface);color:var(--text);border:1px solid var(--border);box-shadow:0 6px 24px rgba(0,0,0,.18);font-family:\'Nunito\',sans-serif;font-size:14px;font-weight:600';
  el.innerHTML =
    '<span style="flex:1;line-height:1.35">A new version of Yoodle is available.</span>' +
    '<button onclick="auOpenStore()" style="border:0;border-radius:10px;padding:8px 12px;background:var(--text);color:var(--bg);font:inherit;font-weight:700">Update</button>' +
    '<button onclick="auCloseBanner()" aria-label="Close" style="border:0;background:none;color:var(--muted);font-size:20px;line-height:1;padding:4px 6px">×</button>';
  document.body.appendChild(el);
}
function auCloseBanner() {
  var el = document.getElementById('au-banner');
  if (el) el.remove();
  try { if (AU.manifest && AU.manifest.latest) localStorage.setItem('yoodle_update_banner_closed', AU.manifest.latest); } catch (e) {}
}

// "App version 1.0 · update 1.0.57" at the bottom of Settings (app only). Handy for support; 7 taps switch the update channel.
async function auShowVersion() {
  var el = document.getElementById('app-ver-line');
  if (!el || !AU.plugin) return;
  try {
    var cur = await AU.plugin.current();
    var v = cur.bundle && cur.bundle.version && cur.bundle.id !== 'builtin' ? cur.bundle.version : 'built-in';
    el.textContent = 'App version ' + cur.native + ' · update ' + v + (auChannel() === 'staging' ? ' · staging updates' : '');
    el.style.display = '';
  } catch (e) {}
}
function appVerTap() {
  if (!AU.plugin) return;
  AU.taps++;
  clearTimeout(AU.tapTimer);
  AU.tapTimer = setTimeout(function () { AU.taps = 0; }, 2000);
  if (AU.taps < 7) return;
  AU.taps = 0;
  var to = auChannel() === 'staging' ? 'production' : 'staging';
  try { if (to === 'staging') localStorage.setItem('yoodle_update_channel', 'staging'); else localStorage.removeItem('yoodle_update_channel'); } catch (e) {}
  if (typeof toast === 'function') toast(to === 'staging' ? 'Staging updates on (test phones only)' : 'Back to normal updates');
  auShowVersion();
  auCheck(true);
}
