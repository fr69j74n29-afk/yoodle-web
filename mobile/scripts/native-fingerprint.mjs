// Native compatibility check for self-hosted live updates (capacitor-build.md §2.1 and §2.7 in the private yoodle-docs repo).
// A live update only replaces web files. If the native plugins differ from the ones compiled into the app build,
// the bundle could call native code that isn't on the phone. This script compares them.
//
// mobile/native-release.json records the native plugins (exact installed versions) of the app version we build for:
//   { "native": "1.0", "plugins": { "@capacitor/app": "8.1.2", ... } }
//
// Usage (from mobile/, after npm ci):
//   node scripts/native-fingerprint.mjs record   after changing plugins + bumping the app version (MARKETING_VERSION):
//                                                writes native-release.json. Commit it with the change.
//   node scripts/native-fingerprint.mjs check    CI (app-bundle.yml, ios-testflight.yml): fails if the installed native
//                                                plugins or the app version don't match native-release.json.
//                                                Prints the app version ("1.0") on success, which is the bundle's min_native.
// Optional: --version 1.1 uses that app version instead of the one in the Xcode project (TestFlight "version" input).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const recordFile = join(mobile, 'native-release.json');
const [mode, ...rest] = process.argv.slice(2);
const vArg = rest.indexOf('--version') >= 0 ? rest[rest.indexOf('--version') + 1] : '';

// App version as major.minor, from --version or the Xcode project (MARKETING_VERSION), e.g. "1.0"
function appVersion() {
  let v = vArg;
  if (!v) {
    const pbx = readFileSync(join(mobile, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
    const m = pbx.match(/MARKETING_VERSION = ([0-9.]+);/);
    if (!m) throw new Error('MARKETING_VERSION not found in the Xcode project');
    v = m[1];
  }
  const [a, b] = v.split('.');
  return `${parseInt(a, 10) || 0}.${parseInt(b, 10) || 0}`;
}

// Installed packages with native code: Capacitor's iOS/Android runtimes, and every dependency that declares
// native sources (a "capacitor" field for Capacitor plugins, "cordova" for Cordova plugins).
function nativePlugins() {
  const deps = JSON.parse(readFileSync(join(mobile, 'package.json'), 'utf8')).dependencies || {};
  const out = {};
  for (const name of Object.keys(deps).sort()) {
    const pj = join(mobile, 'node_modules', name, 'package.json');
    if (!existsSync(pj)) throw new Error(`${name} isn't installed: run npm ci first`);
    const j = JSON.parse(readFileSync(pj, 'utf8'));
    if (name === '@capacitor/ios' || name === '@capacitor/android' || j.capacitor || j.cordova) out[name] = j.version;
  }
  return out;
}

const now = { native: appVersion(), plugins: nativePlugins() };

if (mode === 'record') {
  writeFileSync(recordFile, JSON.stringify(now, null, 2) + '\n');
  console.log(`native-release.json: app ${now.native}, ${Object.keys(now.plugins).length} native packages`);
} else if (mode === 'check') {
  if (!existsSync(recordFile)) { console.error('mobile/native-release.json is missing: run node scripts/native-fingerprint.mjs record'); process.exit(1); }
  const rec = JSON.parse(readFileSync(recordFile, 'utf8'));
  const changed = [];
  for (const n of new Set([...Object.keys(rec.plugins || {}), ...Object.keys(now.plugins)])) {
    const a = (rec.plugins || {})[n], b = now.plugins[n];
    if (a !== b) changed.push(`  ${n}: ${a || '(none)'} -> ${b || '(removed)'}`);
  }
  if (changed.length) {
    console.error(`Native plugins changed since native-release.json (app ${rec.native}):\n${changed.join('\n')}\n` +
      'A live update can\'t deliver native code. Bump the app version (MARKETING_VERSION), run\n' +
      '  node scripts/native-fingerprint.mjs record\nand commit native-release.json. Bundles are then only offered to the new app build.');
    process.exit(1);
  }
  if (rec.native !== now.native) {
    console.error(`App version ${now.native} doesn't match native-release.json (${rec.native}). Run node scripts/native-fingerprint.mjs record and commit it.`);
    process.exit(1);
  }
  console.log(now.native);
} else {
  console.error('Usage: node scripts/native-fingerprint.mjs record|check [--version 1.1]');
  process.exit(2);
}
