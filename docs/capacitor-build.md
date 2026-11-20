# Capacitor mobile app build

The working record of how the Yoodle iOS and Android apps are built with Capacitor. It covers the plan, the plugins and why each one is there, how we test, and an exact log of the commands that were run. Update it as the build goes. When a decision changes, edit the plan and add an entry to the decision log. Don't just leave the old plan in place.

- **Started:** 2026-11-20
- **Status:** Phase 0, planning. Nothing is installed yet.
- **Owner:** Rhea

---

## 1. Goal

Ship Yoodle as a native app on the App Store and Google Play. Web changes pushed to `main` should reach installed apps **without a store release**, through Capgo live updates. A store release should only be needed when native code changes (new plugins, permissions, Capacitor upgrades).

## 2. How the app is put together

```
yoodle-web repo
├── index.html, js/, *.html, icons ...   ← the web app (unchanged; still deployed to yoodle.ca by GitHub Pages)
└── mobile/                              ← Capacitor project (NOT published to yoodle.ca)
    ├── package.json                     ← Capacitor + plugins
    ├── capacitor.config.ts
    ├── scripts/build-www.*              ← copies the site into mobile/www (same file set as the Pages deploy)
    ├── www/                             ← generated bundle (git-ignored)
    ├── ios/                             ← Xcode project (committed)
    └── android/                         ← Android Studio project (committed)
```

- **The web app is bundled inside the app.** We don't point the app at `https://yoodle.ca` (`server.url`). A bundle starts faster, works on a bad connection, and is what Apple expects. Guideline 4.2 rejects apps that are "just a website in a wrapper".
- **Capgo replaces the bundle over the air.** On every push to `main`, CI builds `www/` and uploads it to Capgo. Installed apps download it in the background and switch to it on the next launch or resume. The same thing happens for `staging`, which uploads to a separate `staging` channel used by test devices.
- **What Capgo can't update:** native code, plugins, permissions, app icon, splash screen and `Info.plist` / `AndroidManifest.xml`. Any of those needs a new store build. §2.1 has the details.

### 2.1 Live update vs store update

Capgo only swaps the **web bundle**: HTML, CSS, JS and images inside `www/`. A Capacitor plugin has two halves. The JS half ships in the bundle. The native half (Swift/Kotlin) is compiled into the app binary, and only a store release can change the binary.

| Change | Capgo live update | Needs a store release |
|--------|:-:|:-:|
| Edits to `index.html`, `js/*.js`, CSS, copy, images, other `.html` pages | ✅ | |
| New web features that only use plugins **already in the installed binary** | ✅ | |
| **Adding a new plugin** (e.g. adding `@capacitor/haptics` later) | | ✅ |
| **Updating a plugin's version** (any version bump that includes native code, even a patch) | | ✅ |
| **Removing a plugin** | | ✅ |
| Upgrading Capacitor itself (`@capacitor/core`, `/ios`, `/android`) | | ✅ |
| Upgrading `@capgo/capacitor-updater` itself | | ✅ |
| New permissions or purpose strings (camera, background location, etc.) | | ✅ |
| `Info.plist`, `AndroidManifest.xml`, entitlements (push, Sign in with Apple, Associated Domains, URL schemes) | | ✅ |
| `capacitor.config.ts` settings (these are copied into the native project at build time) | | ✅ |
| App icon, splash screen, app name, bundle ID | | ✅ |
| OneSignal / Firebase native config (`google-services.json`, notification service extension) | | ✅ |

**Why this matters:**

1. **The bundle and the binary must match.** Suppose a bundle's JS calls a plugin, or a plugin version, that an older installed binary doesn't contain. On that phone the call fails with "plugin not implemented" or misbehaves. Users don't all update from the store, so **old binaries stay in use for months** and keep receiving live updates.
2. **Capgo's compatibility check.** When a bundle is uploaded, `npx @capgo/cli bundle upload` compares the native dependencies in `mobile/package.json` with those of the bundles already in the channel. If they differ, it warns or refuses, depending on the flags. Don't bypass that warning. It means a store release is required first.
3. **Version-gate new bundles.** After any native change, bump the app's native version (`versionName` / `CFBundleShortVersionString`, e.g. 1.0 → 1.1). Set the Capgo channel so that bundles built for 1.1 are only offered to 1.1+ binaries, using Capgo's channel version rules / `min_update_version`. Binaries on 1.0 keep getting 1.0-compatible bundles, or nothing, until they update from the store.
4. **Guard new native calls in the web code.** Even with gating, write `if (Capacitor.isPluginAvailable('Haptics')) { ... }` around calls to anything newer than the oldest supported binary. Then a bundle that reaches an old binary by mistake degrades quietly instead of breaking.
5. **Batch native changes.** Every plugin add or upgrade costs a store review: about 1–2 days on Apple, sometimes hours to days on Google. Group them into planned native releases. Web-only work keeps shipping daily through Capgo.

**Workflow for a native change:**
1. Change plugins/config in `mobile/` → `npx cap sync` → bump the native version.
2. Build and test on emulators/devices, then submit to TestFlight / the Play testing track.
3. Change the web code to use the new plugin, guarded with `isPluginAvailable`.
4. Release the store build. Only then upload bundles that rely on it, gated to the new native version.
5. Record it in the build log (§9) and the decision log (§3).

**Store rules on live updates:** Apple allows downloading web code (guideline 3.3.1(b) / 2.5.2) as long as it doesn't change the app's primary purpose, add features that bypass review, or create a storefront for other code. Google Play has a similar rule. Use Capgo for fixes and features in line with what was reviewed. Anything that would change what reviewers saw substantially, such as new payments or a new major feature area, should go through a store review anyway.

### 2.2 How iOS is built: GitHub Actions on a GitHub-hosted Mac (no local Mac)

Xcode and the iOS Simulator only run on macOS, and development happens on Windows. **All iOS builds run in GitHub Actions on GitHub's macOS runners.** The `yoodle-web` repo is public, so those runners are free with no minute limit.

**Stage A: now, no paid Apple account needed**
1. A push to `main` or `staging` (or a manual run) starts the workflow `.github/workflows/ios-build.yml` (to create in Phase 5) on a `macos` runner. That runner comes with Xcode preinstalled.
2. The job runs `npm ci` in `mobile/`, builds `www/`, runs `npx cap sync ios`, then
   `xcodebuild -workspace ios/App/App.xcworkspace -scheme App -sdk iphonesimulator -configuration Debug -derivedDataPath build CODE_SIGNING_ALLOWED=NO`.
3. This produces an **unsigned iOS Simulator build** (`App.app`). Simulator builds need no Apple certificate or provisioning profile, which is why this works without the paid account.
4. The job zips `App.app` and attaches it to the run as a downloadable artifact.
5. **The workflow uploads the zip straight to Appetize.io** (free tier) through the Appetize API. It updates the same Appetize app each time, so the link stays the same. The run summary shows the "Open" link. Use the app in a browser tab on the PC, like an iPhone Simulator.
   - Needs repo secret **`YOODLE_MOBILE_APPETIZE_TOKEN`** (Appetize → Organization Settings → API Token) and repo variable **`APPETIZE_APP_KEY`** (the Appetize app's public key). Without the secret, the step is skipped and the zip can still be downloaded from the run's Artifacts.
   - **Only the repo owner (Roman, `fr69j74n29-afk`) can add secrets and variables**, because `yoodle-web` is a personal-account repo. Rhea (`rhea333`) has push access but not admin. Moving the repo to a GitHub organization later would let both manage them.
   - Manual fallback: run page → Artifacts → `Yoodle-ios-simulator` → extract → upload `Yoodle-sim.zip` (still zipped) to Appetize.

**What Stage A can test:** layout, safe areas and notch, WebKit-specific bugs, sign-in (Google, email code), map, GPS (Appetize lets you set a location), deep links, share, live updates.
**What it can't test:** push notifications and Sign in with Apple. Both need a signed build from the paid account on a real device.

**Stage B: after the Apple Developer Program account is approved**
1. The same workflow gets a second job, for tags or manual runs, that builds a **signed release** (`-sdk iphoneos`, archive and export `.ipa`). It uses an App Store Connect API key and signing certificate stored as **GitHub Actions secrets**.
2. The job uploads the `.ipa` to **TestFlight**. You install it on a real iPhone through the TestFlight app.
3. The App Store submission uses this same TestFlight build. No Mac is needed at any point.

**Rules for this setup**
- Workflow logs are public, because the repo is public. Never `echo` secrets. Keep keys, certificates and tokens only in Actions secrets.
- Each iOS test is a push followed by a ~10–15 min build, so do day-to-day testing on the Android emulator and use iOS builds for spot checks.
- If iOS-only bugs get hard to debug without Safari Web Inspector, revisit this: rent a cloud Mac by the hour, or buy a used Mac mini.
## 3. Decisions

### Open (to settle before or during Phase 1)

| # | Question | Proposal | Why |
|---|----------|----------|-----|
| O1 | Where does the Capacitor project live? | A `mobile/` folder in this repo, added to the Pages deploy excludes | One repo, and web changes and bundle uploads stay in step. Keeps `package.json` and `node_modules` away from the site root. |
| O3 | App ID / bundle ID | `ca.yoodle.app` | It can't be changed after the first store upload. |
| O4 | Push notifications | Keep **OneSignal** and switch to its native SDK inside the app | The backend already sends through OneSignal. Web push (`sw.js`) doesn't work inside a native WebView. |
| O5 | Sign in with Apple | Add it on iOS, next to Google and the email code | Apple guideline 4.8: an app that offers Google sign-in must also offer an equivalent privacy-friendly option. |
| O6 | ID verification fee ($2.99 through Stripe Identity) | **Needs a decision.** See §10 | Apple and Google may treat it as a digital service that must use in-app purchase. |
| O7 | Capgo plan, and self-hosted vs Capgo cloud | Capgo cloud | Least setup. Check the price against the expected number of monthly active devices. |

### Decision log

Add a row whenever a tradeoff is settled. Newest first.

| Date | Decision | Reason / tradeoff |
|------|----------|-------------------|
| 2026-11-20 | **iOS builds run on GitHub Actions macOS runners. They're free because the repo is public.** Simulator builds (no signing) are tested in the browser with Appetize.io's free tier. Once the paid Apple account exists, the same workflow signs the build and uploads it to TestFlight. | No Mac needed and $0. Tradeoffs: no local iOS debugging. Every iOS test is a push followed by a CI build (~10–15 min). Appetize's free tier caps minutes per month. Workflow logs are public, so print no secrets and keep them in Actions secrets. Revisit (cloud Mac rental or a used Mac mini) if iOS-only bugs get hard to chase. |
| 2026-11-20 | Plugin adds, upgrades and removals, plus all native config changes, ship only in planned store releases. Bundles relying on them are gated to the new native version (§2.1) | Old binaries stay in use for months. A mismatched bundle would call native code that isn't there. |
| 2026-11-20 | Bundle the web app and update it with Capgo, instead of loading `yoodle.ca` remotely | Faster start, works offline, lower review risk. The cost is a CI upload step on each deploy. |

## 4. Prerequisites and tooling

| Tool | For | Status on Rhea's PC (2026-11-20) |
|------|-----|-------------------------------|
| Node.js (LTS) | Capacitor CLI | v24.13.1 installed |
| Android Studio (includes JDK + SDK + emulator) | Android build and emulator | SDK folder exists at `%LOCALAPPDATA%\Android\Sdk`. Android Studio, `java` and `adb` aren't on PATH yet |
| `ANDROID_HOME` env var + `platform-tools` on PATH | `npx cap run android`, `adb` | Not set |
| GitHub Actions `macos` runner (Xcode preinstalled) | iOS build, instead of a local Mac | Free (public repo). Workflow to create in Phase 5 |
| Appetize.io free account | Running the iOS Simulator build in the browser | Created 2026-11-20 (Rhea). **Free plan: 30 streaming minutes/month, 2 concurrent users, resets on the 1st.** Starter is $59/mo if that's ever not enough. Use iOS sessions for short spot checks and do long testing on the Android emulator. |
| Apple Developer Program ($99 USD/yr) | TestFlight and App Store | To do. Enrolling as an organization needs a D-U-N-S number, which can take days |
| Google Play Console ($25 one-off) | Play testing and release | To do. New personal accounts must run a closed test before production (see §10) |
| Capgo account + API key | Live updates | To do |
| OneSignal app: iOS (APNs key) + Android (FCM) platforms | Native push | To do |
| Firebase project (`google-services.json`) | FCM for Android push | To do |

## 5. Build plan (outline)

Each phase ends with something you can test. The commands actually run go in the build log (§9).

**Phase 0: Accounts and tooling**
1. Install Android Studio, set `ANDROID_HOME`, and create an emulator (Pixel, recent API level).
2. ~~Settle how to build iOS.~~ Done: GitHub Actions + Appetize (decision log).
3. Enrol in the Apple Developer Program and Google Play Console. Create the Capgo account.

**Phase 1: Capacitor scaffold (Android first)**
1. Create `mobile/`, `npm init`, and install `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` and `@capacitor/ios`.
2. Run `npx cap init Yoodle ca.yoodle.app --web-dir www`.
3. Write `scripts/build-www`. It copies the same files the Pages deploy publishes (everything except `.git`, `.github`, `docs`, `supabase`, `mobile`) into `mobile/www`.
4. Run `npx cap add android` and `npx cap add ios`.
5. Add `mobile` to the `tar --exclude` list in [deploy.yml](../.github/workflows/deploy.yml) and `mobile/www`, `mobile/node_modules` to `.gitignore`.
6. Run it in the Android emulator. **Expect auth, push and some links to be broken at this point.** Phase 2 fixes them.

**Phase 2: Make the web app native-aware** (changes to `index.html` that are safe on the website)
1. Add a single `IS_NATIVE = !!window.Capacitor?.isNativePlatform?.()` flag, then branch on it in the places below.
2. **Auth return URL.** `AUTH_RETURN` is built from `location.origin`. In the app that origin is `capacitor://localhost` (iOS) or `https://localhost` (Android). Use a deep link instead (`ca.yoodle.app://auth`). Open Google OAuth in the system browser through `@capacitor/browser`, because Google blocks sign-in inside embedded WebViews. Catch the return through `@capacitor/app` `appUrlOpen` and finish with `exchangeCodeForSession`. Add the deep link to Supabase Auth → Redirect URLs. The email code (`signInWithOtp`) already works without a redirect.
3. **Standalone checks.** `isInStandaloneMode()` and `isIos()` decide whether to show "add to home screen" and push setup. In the app, treat native as already installed and skip the PWA install prompts.
4. **Push.** Swap the OneSignal web SDK for the native SDK when `IS_NATIVE`, and keep the same `OneSignal.login(userId)` mapping so the server-side sends don't change.
5. **External links** (`window.open` for tutor handoff, agency job links, notification links, Stripe Identity). Open them with `Browser.open`.
6. **Share / clipboard** (`navigator.share`, `navigator.clipboard`). Use `@capacitor/share`, because Android WebView has no `navigator.share`.
7. **Geolocation.** Use `@capacitor/geolocation` so the OS permission prompt shows Yoodle's name and purpose text.
8. **CORS.** Check that Supabase Edge Functions accept the `capacitor://localhost` and `https://localhost` origins.
9. **Android back button.** Close the open sheet or chat first, then go back a tab, then exit.

**Phase 3: Live updates (Capgo)**
1. Install `@capgo/capacitor-updater` and call `CapacitorUpdater.notifyAppReady()` early in `index.html`. Without that call Capgo rolls the bundle back as failed.
2. Create the `production` and `staging` channels.
3. Add a CI job that builds `www` and runs `npx @capgo/cli bundle upload --channel production` (or `staging`) on push to `main` (or `staging`).
4. Test it: install a build, push a visible web change, and confirm the app picks it up without reinstalling.

**Phase 4: Native polish**
Add the app icon and splash (`@capacitor/assets`), status bar colour (`#9B59D4` / dark theme), keyboard behaviour in chat, safe-area insets (notch, home indicator) and haptics if wanted.

**Phase 5: iOS build** (GitHub Actions macOS runner, §2.2)
1. Create `.github/workflows/ios-build.yml`. It builds an unsigned **iOS Simulator** `App.app` on a GitHub Mac and uploads it as an artifact.
2. Test that build in Appetize.io.
3. Once the paid Apple account is approved, add the signed build job that uploads to TestFlight.
4. Sign with the Apple team, set the `Info.plist` purpose strings, configure Associated Domains or the URL scheme, enable the push capability, and add Sign in with Apple (O5).

**Phase 6: Store prep and beta.** See §10. TestFlight, Play internal or closed testing, then submission.

## 6. Plugins

> **Every plugin below is native code compiled into the app binary.** Adding, upgrading or removing any of them needs a new App Store / Play release. Capgo can't deliver it (§2.1). So the first store build should include every plugin we expect to need, including optional ones like haptics, to avoid an early second review.

| Plugin | Why we need it | Replaces in the web app | Native config needed |
|--------|----------------|-------------------------|---------------------|
| `@capgo/capacitor-updater` | Live updates: web changes reach installed apps without a store release | Nothing (new) | Capgo app ID / API key in `capacitor.config.ts` |
| `@capacitor/app` | Deep links for the OAuth return (`appUrlOpen`), Android back button, resume events (refresh chats/notifications) | Nothing (new) | URL scheme in `Info.plist`, intent filter in `AndroidManifest.xml` |
| `@capacitor/browser` | Google OAuth in the system browser (required by Google), plus external links and Stripe Identity | `signInWithOAuth` redirect, `window.open` | None |
| `onesignal-cordova-plugin` (OneSignal's official Capacitor-compatible SDK) | Native push. Web push doesn't work in the app WebView | OneSignal web SDK + `sw.js` | APNs key, FCM `google-services.json`, iOS push capability + notification service extension |
| `@capacitor/geolocation` | Native location permission and reliable GPS for the map, distances and the chat location bar | `navigator.geolocation` | `NSLocationWhenInUseUsageDescription`, Android `ACCESS_FINE/COARSE_LOCATION` |
| `@capacitor/share` | Native share sheet (invite, share a job) | `navigator.share` (missing on Android WebView) | None |
| `@capacitor/clipboard` | Copy-link fallback that works on all WebViews | `navigator.clipboard` | None |
| `@capacitor/splash-screen` | Branded launch screen. Hide it only once the map is ready | Nothing | Splash assets |
| `@capacitor/status-bar` | Status bar colour/style that matches the theme | `theme_color` meta | None |
| `@capacitor/keyboard` | Keeps the chat input visible above the keyboard | Nothing | `resize` mode in config |
| `@capacitor-community/apple-sign-in` (or Supabase Apple OAuth via Browser) | Sign in with Apple (guideline 4.8) | Nothing (new) | Sign in with Apple capability, Apple Services ID, Supabase Apple provider |
| `@capacitor/haptics` *(optional)* | Small taps on confirm actions | Nothing | None |
| `@capacitor/assets` *(dev tool, not a runtime plugin)* | Generates all icon and splash sizes from one source image | Nothing | None |

**Not needed for now:** a camera plugin (Stripe Identity takes its own photos in the browser) or file upload (the app has no file inputs today). Add rows here if that changes.

## 7. Testing and emulation

| What | How |
|------|-----|
| Android emulator | Android Studio → Device Manager → Pixel AVD. Run `npx cap run android` from `mobile/`. |
| Debugging the Android WebView | Chrome → `chrome://inspect` → pick the Yoodle WebView. You get the full console and network tabs. |
| Live reload while editing | Serve the repo root locally (e.g. `npx serve .` on port 3000). Run `npx cap run android -l --external`, or set `server.url` to the PC's LAN IP **in a dev-only config**. Never ship with `server.url`. |
| Physical Android | USB debugging on, then `npx cap run android --target <device>`. Needed for real push and real GPS. |
| iOS Simulator (no Mac) | Push to the branch, and the GitHub Actions macOS job builds an unsigned Simulator `.app` (`xcodebuild -sdk iphonesimulator`). Upload the zipped `.app` to Appetize.io and use it in the browser. Can't test push or Sign in with Apple. |
| iOS rendering quick check | Open yoodle.ca/staging/ in Safari on any iPhone. Same WebKit engine as the app's WebView, no native plugins. |
| Physical iPhone | After the paid Apple account exists, the same workflow signs the build and uploads it to TestFlight. Install it on an iPhone. Needed for push and Sign in with Apple. |
| GPS | Emulator → Extended controls → Location (set a pin in your test city). iOS Simulator → Features → Location. |
| Deep links / OAuth | `adb shell am start -a android.intent.action.VIEW -d "ca.yoodle.app://auth?code=test"`. iOS: `xcrun simctl openurl booted "ca.yoodle.app://auth"`. |
| Live updates | Point a test device at the Capgo `staging` channel, push to `staging`, and confirm the change shows after resume. Also check the rollback: a bundle that never calls `notifyAppReady` must revert. |
| Data | Same live Supabase database as the site. **Use test accounts** (as with yoodle.ca/staging/). |
| Beta testers | TestFlight (iOS) and Play internal testing track (Android). |

**Per-release test checklist** (fill in as features are verified):
- [ ] Sign in: Google, email code, Apple (iOS)
- [ ] Sign out and back in. The session survives an app restart
- [ ] Map loads, GPS permission prompt, distances
- [ ] Post a job, browse, chat, chat location bar → map → back to chat
- [ ] Push: receive, tap opens the right chat
- [ ] Share and copy link
- [ ] External links and Stripe Identity open in the browser and return
- [ ] Android back button behaviour
- [ ] Delete account
- [ ] Live update applied and rolled back

## 8. Environment and secrets

Keep secrets out of the repo. Record *where* each one lives, not its value.

| Secret | Lives in |
|--------|----------|
| Capgo API key | GitHub Actions secret `CAPGO_TOKEN` (to create) |
| Android upload keystore + passwords | To decide: keep it **backed up**, because losing it blocks Play updates unless Play App Signing is used (recommended) |
| Apple signing certs / profiles | Xcode automatic signing, or the cloud build service |
| APNs auth key (.p8) | OneSignal dashboard |
| `google-services.json` | `mobile/android/app/`. It's fine to commit for FCM, but check |

## 9. Build log

Exactly what was run, in order, with the date. Note versions installed and anything that went wrong and how it was fixed.

| Date | Step | Command / action | Result / notes |
|------|------|------------------|----------------|
| 2026-11-20 | Plan | Wrote this document | No code changes yet |
| 2026-11-20 | Check the Android toolchain | Looked at `%LOCALAPPDATA%\Android\Sdk`, `~\.android\avd`, PATH | **Found:** SDK with `platform-tools` (adb), `emulator`, platform `android-34`, build-tools `34.0.0`, system images `android-34` + `android-VanillaIceCream` (35). An emulator `Yoodle_API34` already exists. **Missing:** Android Studio app, a JDK (`java`/`JAVA_HOME`), `ANDROID_HOME` env var, PATH entries. Newer platforms Capacitor needs (API 35/36) will be installed by SDK Manager or Gradle. |
| 2026-11-20 | Decide to go iOS first | — | Android waits until Android Studio + JDK are installed. iOS is built in CI (§2.2), so it needs nothing local. |
| 2026-11-20 | Branch | `git switch -c mobile-app` | All mobile work happens here until it's ready to merge. Only `main`/`staging` deploy the site, so this branch doesn't touch yoodle.ca. |
| 2026-11-20 | npm registry over HTTPS | Created `mobile/.npmrc` with `registry=https://registry.npmjs.org/` | Rhea's user `~/.npmrc` sets `registry=http://registry.npmjs.org` (plain http: packages could be tampered with in transit). The project file overrides it for `mobile/`. Rhea's global file is unchanged. **Recommend fixing the global one too.** |
| 2026-11-20 | Install Capacitor | `cd mobile` → `npm init -y` → `npm install @capacitor/core@8.6.2 @capacitor/ios@8.6.2 @capacitor/android@8.6.2` → `npm install -D @capacitor/cli@8.6.2` | Capacitor **8.6.2** (latest). 0 vulnerabilities. |
| 2026-11-20 | Web bundle script | Wrote `mobile/scripts/build-www.mjs`, `npm run build:www` | Copies the site into `mobile/www` with the same exclusions as the Pages deploy (+ `mobile`, `CNAME`). Not minified (easier debugging). |
| 2026-11-20 | Capacitor config | Wrote `mobile/capacitor.config.json` (`appId: ca.yoodle.app`, `appName: Yoodle`, `webDir: www`) | JSON rather than TS (no TypeScript needed). App ID used as proposed. It can still change until the first store upload. |
| 2026-11-20 | Add iOS | `npx cap add ios` (on Windows) | Works on Windows. Capacitor 8 uses **Swift Package Manager** (no CocoaPods / `.xcworkspace`), so CI builds `ios/App/App.xcodeproj`. `ios/App/App/public` (copied bundle) is git-ignored. It's regenerated by `cap sync`. |
| 2026-11-20 | iOS CI workflow | Wrote `.github/workflows/ios-build.yml` | `macos-latest` runner: `npm ci` → `build:www` → `cap sync ios` → `xcodebuild -sdk iphonesimulator ARCHS="arm64 x86_64" CODE_SIGNING_ALLOWED=NO` → zips `App.app` → artifact **Yoodle-ios-simulator**. Both architectures are built so the zip runs on Appetize whichever Mac type it uses. Runs on push to `mobile-app`/`main`/`staging` (web or mobile files changed) or manually. |
| 2026-11-20 | First iOS CI build | Pushed `mobile-app` → run [44777542202](https://github.com/fr69j74n29-afk/yoodle-web/actions/runs/44777542202) | ✅ **BUILD SUCCEEDED** on Xcode 26.6 (17F113), about 1.5 min for the build steps. Artifact `Yoodle-sim.zip` is 2.1 MB and contains `App.app` with the binary, `Info.plist` and `public/index.html` + `js/`. Next: upload to Appetize. |
| 2026-11-20 | Auto-upload to Appetize | Added an "Upload to Appetize" step to `ios-build.yml` (`POST https://api.appetize.io/v1/apps[/<APPETIZE_APP_KEY>]` with `X-API-KEY`) | Secret added 2026-11-20 as `YOODLE_MOBILE_APPETIZE_TOKEN` (the workflow was changed to that name). `APPETIZE_APP_KEY` makes each build replace the same Appetize app instead of creating a new one. |
| 2026-11-20 | Keep `mobile/` off yoodle.ca | `deploy.yml`: added `--exclude=./mobile` | Must also be on `main` and `staging` when merged (deploy.yml must match on both). |
| 2026-11-20 | Known issue for Phase 2 | — | Links like `/terms`, `/privacy`, `/faq` rely on GitHub Pages dropping `.html`. In the app they'll land on the home screen. Fix: open them on `https://yoodle.ca` in the native app. Google sign-in will also fail until the deep-link work in Phase 2. **For the first iOS test, sign in with the email code.** |

## 10. Store submission checklist

The full list is shared in chat on 2026-11-20. Tick items here as they are done.

**Both stores**
- [ ] Privacy policy URL (`https://yoodle.ca/privacy.html`). Check that it mentions location, push, ID verification (Stripe) and analytics
- [ ] Support URL and contact email
- [ ] In-app account deletion (exists: Settings → Delete my account). Play also needs a web deletion URL
- [ ] User-generated content safeguards: report, block, terms acceptance and a way to remove content (report and block exist. Check that terms are accepted at sign-up)
- [ ] Demo / review account with sample jobs and chats, plus notes for the reviewer
- [ ] Screenshots per required device size, icon, short and long description, keywords
- [ ] Age rating questionnaire
- [ ] **ID verification payment decision (O6).** In-app purchase rules may apply to the $2.99 fee. Options: make it free in the app, route it through IAP / Play Billing, or argue it is a real-world service. Decide before submitting.

**Apple**
- [ ] Sign in with Apple (O5)
- [ ] Purpose strings for location (and push prompt timing)
- [ ] App Privacy "nutrition label" answers
- [ ] Export compliance (standard HTTPS only → exempt)
- [ ] TestFlight beta pass

**Google Play**
- [ ] Data safety form
- [ ] Target API level meets the current Play requirement
- [ ] Closed test with the required number of testers for the required days (new personal developer accounts)
- [ ] Play App Signing enrolled
