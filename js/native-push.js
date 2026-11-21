// Native app push notifications (Capacitor iOS/Android, docs/capacitor-build.md). Does nothing on the website.
// Uses OneSignal's native SDK (@onesignal/capacitor-plugin) through window.Capacitor.Plugins.OneSignalCapacitor.
// The site has no bundler, so this calls the plugin's bridge methods directly instead of importing its JS wrapper.
// Same OneSignal app and the same user mapping as the website (login(profile id) = OneSignal external_id),
// so the server's existing sends reach the app as well.
//
// index.html calls: npLogin() (from registerOneSignal, once signed in), npLogout(), npPermission(), npRequest().
// iOS only receives pushes in a signed build with the Push Notifications capability and an APNs key in OneSignal
// (paid Apple Developer account). Simulator / Appetize / Sideloadly builds can show the permission prompt but get no pushes.
var NP_APP_ID = '258cf4ad-768d-4775-a8ce-4f79a5c2de04'; // same OneSignal app as the website (index.html registerOneSignal)
var NP = { plugin: null, ready: false, perm: 'unavailable', wantLogin: false, init: Promise.resolve() };

(function () {
  var C = window.Capacitor;
  if (!(C && C.isNativePlatform && C.isNativePlatform())) return;
  var P = C.Plugins && C.Plugins.OneSignalCapacitor;
  if (!P) return; // an older app build without the plugin: behave as before (no push)
  NP.plugin = P;
  NP.perm = 'default';

  // Tap on a notification. Registered before initialize(): on a cold start the plugin replays the tap during
  // initialize(), and Capacitor holds it until this listener exists (retainUntilConsumed).
  P.addListener('notificationClick', function (e) { npOnClick(e && e.notification); });
  P.addListener('permissionChange', function () { npRefreshPerm(); });
  P.addListener('pushSubscriptionChange', function (s) { var id = s && s.current && s.current.id; if (id) npSaveId(id); });
  // The user may turn notifications on or off in the phone's Settings while the app is in the background
  if (C.Plugins.App) C.Plugins.App.addListener('resume', function () { npRefreshPerm(); });

  NP.init = P.initialize({ appId: NP_APP_ID }).then(function () {
    NP.ready = true;
    if (NP.wantLogin) npLogin();
    return npRefreshPerm();
  }).catch(function (e) { console.warn('OneSignal (app) init error:', e); NP.perm = 'unavailable'; });
})();

// 'granted' | 'denied' | 'default' (not asked yet) | 'unavailable' (website, or an app build without the plugin:
// Capgo can deliver this file to app installs built before push was added). Cached so the page can check it without waiting.
function npPermission() { return NP.perm; }

function npRefreshPerm() {
  var P = NP.plugin;
  if (!P || !NP.ready) return Promise.resolve(NP.perm);
  return P.getPermission().then(function (r) {
    if (r && r.permission) return 'granted';
    return P.canRequestPermission().then(function (c) { return c && c.canRequest ? 'default' : 'denied'; });
  }).then(function (p) {
    var changed = p !== NP.perm;
    NP.perm = p;
    if (changed) { try { updateNotifTip(); } catch (e) {} try { updateNotifNudge(); } catch (e) {} }
    return p;
  }).catch(function () { return NP.perm; });
}

// Show the system prompt. toSettings: if they said no before, offer to open the phone's Settings instead.
// Resolves true when notifications are allowed.
function npRequest(toSettings) {
  var P = NP.plugin;
  if (!P) return Promise.resolve(false);
  return NP.init.then(function () {
    if (!NP.ready) return false;
    return P.requestPermission({ fallbackToSettings: !!toSettings }).then(function (r) {
      var ok = !!(r && r.permission);
      if (ok) P.optInPushSubscription().catch(function () {});
      return npRefreshPerm().then(function () { if (ok) npLogin(); return ok; });
    });
  }).catch(function () { return false; });
}

// This phone belongs to the signed-in profile (OneSignal external_id), and the server gets its push id.
function npLogin() {
  var P = NP.plugin;
  if (!P) return;
  var pid = (typeof me !== 'undefined' && me) ? ((typeof myProfileId !== 'undefined' && myProfileId) || me.id) : null;
  if (!pid) return;
  if (!NP.ready) { NP.wantLogin = true; return; }
  NP.wantLogin = false;
  P.login({ externalId: pid }).catch(function (e) { console.warn('OneSignal (app) login error:', e); });
  P.getPushSubscriptionId().then(function (r) { if (r && r.id) npSaveId(r.id); }).catch(function () {});
}

function npLogout() {
  NP.wantLogin = false;
  if (NP.plugin && NP.ready) NP.plugin.logout().catch(function () {});
}

// profiles.onesignal_id: the server uses it (e.g. Ready to work's "no_push" check). Same as the website does.
var _npSavedId = null;
function npSaveId(id) {
  if (!id || id === _npSavedId) return;
  if (typeof sb === 'undefined' || !sb || typeof me === 'undefined' || !me) return;
  var pid = (typeof myProfileId !== 'undefined' && myProfileId) || me.id;
  _npSavedId = id;
  sb.from('profiles').update({ onesignal_id: id }).eq('id', pid).then(function (res) {
    if (res && res.error) _npSavedId = null;
  }, function () { _npSavedId = null; });
}

// Tap on a notification: same routing as the website.
// 1) task_id in the data → open that chat (as the website's OneSignal click listener does).
// 2) otherwise, a yoodle.ca link (e.g. ?ready=tomorrow, ?renew=…) → reload the app's own page with that query,
//    so the existing landing code handles it. iOS doesn't open the link itself (OneSignal_suppress_launch_urls).
function npOnClick(n) {
  if (!n) return;
  var data = n.additionalData || {};
  var taskId = data.task_id, convId = data.conversation_id;
  if (taskId) {
    if (typeof me !== 'undefined' && me && typeof sb !== 'undefined' && sb) { openChatFromNotification(taskId, convId); }
    else { window._pendingNotifTaskId = taskId; window._pendingNotifConvId = convId; }
    return;
  }
  var link = n.launchURL || data.url;
  if (!link) return;
  var u; try { u = new URL(link); } catch (e) { return; }
  if (!/(^|\.)yoodle\.ca$/i.test(u.hostname)) { window.open(u.href); return; } // other sites: in-app browser sheet
  if (u.pathname !== '/' && u.pathname !== '/index.html') { window.open(u.href); return; } // other yoodle.ca pages (job.html …)
  if (u.search || u.hash) location.href = location.pathname + u.search + u.hash;
}
