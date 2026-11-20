// Native app only (Capacitor iOS/Android, docs/capacitor-build.md). Does nothing on the website.
// Capgo live updates: tell the updater this bundle started fine, or it rolls back to the previous bundle.
// Plain script (the site has no bundler), so the plugin comes from window.Capacitor.Plugins, not an import.
(function(){
  var C=window.Capacitor;
  if(!(C&&C.isNativePlatform&&C.isNativePlatform()))return;
  var P=C.Plugins||{};
  if(P.CapacitorUpdater)window.Capacitor.Plugins.CapacitorUpdater.notifyAppReady().catch(function(){});
})();
