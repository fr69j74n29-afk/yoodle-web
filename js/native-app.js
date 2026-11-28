// Native app only (Capacitor iOS/Android, capacitor-build.md §2.7 in the private yoodle-docs repo). Does nothing on the website.
// Self-hosted live updates: the free @capgo/capacitor-updater plugin in manual mode (capacitor.config.json autoUpdate "off"),
// no Capgo account. https://yoodle.ca/app-version.json says which web bundle is current (bundle.version / url / checksum /
// min_native). The zip itself is a GitHub Release asset made by .github/workflows/app-bundle.yml.
// Flow: check on start and on resume (at most every 10 min) → if the file names a different bundle than the one running,
// download it (the plugin verifies the sha256 checksum) → next(): the phone switches to it the next time the app goes to the
// background. The new bundle must call notifyAppReady() (below) within 10 s or the plugin rolls back to the previous one;
// that version is then remembered as failed and not downloaded again.
// Rollback for everyone: point app-version.json back at an older bundle; phones switch to whatever the file names.
// Test phones: tap "App version" at the bottom of Settings 7 times to use /staging/app-version.json instead.
// Plain script (the site has no bundler), so the plugin comes from window.Capacitor.Plugins, not an import.
var AU = { plugin: null, busy: false, lastCheck: 0, taps: 0, tapTimer: null };
var AU_EVERY_MS = 10 * 60 * 1000; // resume checks: at most every 10 minutes (Supabase isn't involved, but keep it light)

(function () {
  var C = window.Capacitor;
  if (!(C && C.isNativePlatform && C.isNativePlatform())) return;
  var P = C.Plugins || {};
  var U = P.CapacitorUpdater;
  if (!U) return;
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
  if (P.App) P.App.addListener('resume', function () { auCheck(false); });
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

async function auCheck(force) {
  var U = AU.plugin;
  if (!U || AU.busy) return;
  var now = Date.now();
  if (!force && now - AU.lastCheck < AU_EVERY_MS) return;
  AU.busy = true; AU.lastCheck = now;
  try {
    var r = await fetch(auManifestUrl() + '?t=' + now, { cache: 'no-store' });
    if (!r.ok) return;
    var b = (await r.json()).bundle;
    if (!b || !b.version || !b.url) return; // no live update published: keep the bundle that's running
    var cur = await U.current(); // { bundle: { id, version, ... }, native: "1.0" }
    if (b.min_native && auCmp(cur.native, b.min_native) < 0) return; // made for a newer app build: this phone needs the store update first
    // Bundles are numbered <app major.minor>.<run>. One below the installed app version (e.g. 1.0.57 on app 1.1) is older
    // than the bundle built into this app, so never go back to it (same rule as Capgo's "no bundles below native").
    if (auCmp(b.version, cur.native) < 0) return;
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
  } catch (e) {
    console.warn('Live update check failed:', e);
  } finally {
    AU.busy = false;
  }
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
