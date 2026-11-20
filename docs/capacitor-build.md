# Capacitor mobile app build

The working record of how the Yoodle iOS and Android apps are built with Capacitor. It covers the plan, the plugins and why each one is there, how we test, and an exact log of the commands that were run. Update it as the build goes. When a decision changes, edit the plan and add an entry to the decision log. Don't just leave the old plan in place.

- **Started:** 2026-11-20
- **Owner:** Rhea
- **Status (2026-11-20):** iOS-first. Capacitor 8.6.2 project in `mobile/` on branch `mobile-app`. iOS builds run in GitHub Actions (Simulator build → Appetize, iPhone `.ipa` → Sideloadly). Google sign-in, links, share, location and keyboard are wired up for the app and waiting on Rhea's Appetize test. Android isn't started (needs Android Studio + JDK). Capgo live updates are next after the Phase 2 test passes.

---

## 0. Pending actions

The things currently waiting on someone. Remove a line when it's done and note it in the build log (§9).

| # | Action | Who | Why |
|---|--------|-----|-----|
| P1 | Supabase → Authentication → URL Configuration → **Redirect URLs**: add `ca.yoodle.app://auth` (exactly, with no `https://` and no trailing slash; also `ca.yoodle.app://**` if needed) → Save | **Roman** (Rhea doesn't have permission to change Supabase Auth settings. Waiting on him, 2026-11-20) | Google sign-in (and email links) can't return to the app without it. Supabase falls back to the website. **Confirmed missing in the 2026-11-20 test.** Until it's done, test the app with the **email code** sign-in. After it's done, re-test Google in Appetize (no new build needed). |
| P3 | Appetize → Apps: delete the older Yoodle apps `xj5rqqzprlq2cbpvp7xxlvtrfu`, `uimifbaisvdwjiwtbe4b22jukm`, `auvftf7pb27umop5fiwvbygyc4` | Rhea | Avoid testing an old build by mistake. |
| P4 | Run the Phase 2 Appetize checklist (§7.1) on https://appetize.io/app/2atf3cdwym3jkudn7pbf7x7gda | Rhea | Verifies sign-in, links, share, location and keyboard in one short session. |
| P5 | Confirm the branch plan (§3, O8): merge `mobile-app` into `main`, mirror `deploy.yml` on `staging`, delete `mobile-app` | Rhea (+ tell Roman) | So `main` feeds both the site and the app. |
| P6 | Sideloadly setup (§2.4): iTunes + iCloud from apple.com, Sideloadly, a spare Apple Account | Rhea | Unlimited real-iPhone testing until TestFlight. |
| P7 | Apple Developer Program enrolment (organization needs a D-U-N-S number) | Rhea | TestFlight, push, Sign in with Apple, App Store. |
| P8 | Install Android Studio (+ JDK) and set `ANDROID_HOME` | Rhea | Unlimited local testing on the Android emulator, and the Android build. |
| P9 | Fix the global npm registry in `~/.npmrc` (`http://` → `https://registry.npmjs.org/`) | Rhea | Packages are currently downloaded unencrypted outside `mobile/`. |

## 1. Goal

Ship Yoodle as a native app on the App Store and Google Play. Web changes pushed to `main` should reach installed apps **without a store release**, through Capgo live updates. A store release should only be needed when native code changes (new plugins, permissions, Capacitor upgrades).

## 2. How the app is put together

```
yoodle-web repo
├── index.html, js/, *.html, icons ...   ← the web app (deployed to yoodle.ca by GitHub Pages; also bundled into the app)
├── .github/workflows/deploy.yml         ← website deploy (excludes mobile/)
├── .github/workflows/ios-build.yml      ← iOS builds on a GitHub-hosted Mac (§2.2)
└── mobile/                              ← Capacitor project (NOT published to yoodle.ca)
    ├── package.json, package-lock.json  ← Capacitor 8.6.2 + plugins (§6)
    ├── .npmrc                           ← forces https npm registry for this folder
    ├── capacitor.config.json            ← appId ca.yoodle.app, plugin settings
    ├── scripts/build-www.mjs            ← copies the site into mobile/www (same file set as the Pages deploy)
    ├── www/                             ← generated bundle (git-ignored)
    ├── ios/                             ← Xcode project, Swift Package Manager (committed)
    └── android/                         ← not added yet (needs Android Studio)
```

npm scripts in `mobile/`: `npm run build:www` (bundle only), `npm run sync:ios` (bundle + `cap sync ios`), `npm run sync` (all platforms).

- **The web app is bundled inside the app.** We don't point the app at `https://yoodle.ca` (`server.url`). A bundle starts faster, works on a bad connection, and is what Apple expects. Guideline 4.2 rejects apps that are "just a website in a wrapper".
- **One `index.html` for both.** App-only behaviour sits behind `IS_NATIVE` (always false on the website). It's not in a separate copy or branch.
- **Capgo replaces the bundle over the air** (Phase 3, not set up yet). On every push to `main`, CI builds `www/` and uploads it to Capgo. Installed apps download it in the background and switch to it on the next launch or resume. `staging` uploads to a separate `staging` channel used by test devices.
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
| `capacitor.config.json` settings (these are copied into the native project at build time) | | ✅ |
| App icon, splash screen, app name, bundle ID | | ✅ |
| OneSignal / Firebase native config (`google-services.json`, notification service extension) | | ✅ |

**Why this matters:**

1. **The bundle and the binary must match.** Suppose a bundle's JS calls a plugin, or a plugin version, that an older installed binary doesn't contain. On that phone the call fails with "plugin not implemented" or misbehaves. Users don't all update from the store, so **old binaries stay in use for months** and keep receiving live updates.
2. **Capgo's compatibility check.** When a bundle is uploaded, `npx @capgo/cli bundle upload` compares the native dependencies in `mobile/package.json` with those of the bundles already in the channel. If they differ, it warns or refuses, depending on the flags. Don't bypass that warning. It means a store release is required first.
3. **Version-gate new bundles.** After any native change, bump the app's native version (`versionName` / `CFBundleShortVersionString`, e.g. 1.0 → 1.1). Set the Capgo channel so that bundles built for 1.1 are only offered to 1.1+ binaries, using Capgo's channel version rules / `min_update_version`. Binaries on 1.0 keep getting 1.0-compatible bundles, or nothing, until they update from the store.
4. **Guard new native calls in the web code.** Even with gating, write `if (Capacitor.isPluginAvailable('Haptics')) { ... }` around calls to anything newer than the oldest supported binary. Then a bundle that reaches an old binary by mistake degrades quietly instead of breaking. (The app-only block in `index.html` already checks `if (P.Share)`, `if (P.Geolocation)` and so on.)
5. **Batch native changes.** Every plugin add or upgrade costs a store review: about 1–2 days on Apple, sometimes hours to days on Google. Group them into planned native releases. Web-only work keeps shipping daily through Capgo.

**Workflow for a native change:**
1. Change plugins/config in `mobile/` → `npm run sync` → bump the native version.
2. Build and test on emulators/devices, then submit to TestFlight / the Play testing track.
3. Change the web code to use the new plugin, guarded with `isPluginAvailable`.
4. Release the store build. Only then upload bundles that rely on it, gated to the new native version.
5. Record it in the build log (§9) and the decision log (§3).

**Store rules on live updates:** Apple allows downloading web code (guideline 3.3.1(b) / 2.5.2) as long as it doesn't change the app's primary purpose, add features that bypass review, or create a storefront for other code. Google Play has a similar rule. Use Capgo for fixes and features in line with what was reviewed. Anything that would change what reviewers saw substantially, such as new payments or a new major feature area, should go through a store review anyway.

### 2.2 How iOS is built: GitHub Actions on a GitHub-hosted Mac (no local Mac)

Xcode and the iOS Simulator only run on macOS, and development happens on Windows. **All iOS builds run in GitHub Actions on GitHub's macOS runners** (`.github/workflows/ios-build.yml`). The `yoodle-web` repo is public, so those runners are free with no minute limit.

**When it runs:** on a push to `mobile-app`, `main` or `staging` that changes `mobile/**`, `index.html`, `js/**`, any `*.html` or the workflow itself. Docs-only pushes don't trigger it. There's also a manual "Run workflow" button, which only appears once the workflow is on `main`. Until then, re-run a past run with `gh run rerun <id>`.

**Stage A: now, no paid Apple account needed.** Two jobs run in parallel, each taking ~1.5–3 min:

| Job | What it builds | Output |
|-----|----------------|--------|
| `simulator` | `npm ci` → `npm run build:www` → `npx cap sync ios` → `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' ARCHS="arm64 x86_64" ONLY_ACTIVE_ARCH=NO CODE_SIGNING_ALLOWED=NO` → zip `App.app` | Artifact **`Yoodle-ios-simulator`** (`Yoodle-sim.zip`, kept 14 days), then **uploaded to Appetize automatically** (below) |
| `device` | Same steps, but `-configuration Release -sdk iphoneos -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO` → `Payload/App.app` zipped as `.ipa` | Artifact **`Yoodle-iphone-sideloadly`** (`Yoodle-device.ipa`, kept 14 days) for Sideloadly (§2.4) |

- Simulator builds need no Apple certificate. The device build is unsigned, and Sideloadly signs it at install time.
- Both architectures are built for the simulator, so the zip runs on Appetize whichever Mac type it uses.
- Capacitor 8 uses Swift Package Manager, so the build uses `App.xcodeproj`. There's no `.xcworkspace` or CocoaPods.

**Automatic Appetize upload** (end of the `simulator` job): `POST https://api.appetize.io/v1/apps[/<APPETIZE_APP_KEY>]` with the `X-API-KEY` header, `platform=ios`, and a note of branch + commit. The run summary shows the **"Open"** link.
- Repo secret **`YOODLE_MOBILE_APPETIZE_TOKEN`** (Appetize → Organization Settings → API Token). If it's missing, the step is skipped.
- Repo variable **`APPETIZE_APP_KEY`** (the Appetize app's public key, the part after `appetize.io/app/`). If it's set, each build replaces that app (same link). If it's empty, a new app is created and its key is printed in the run summary.
- **Only the repo owner (Roman, `fr69j74n29-afk`) can add secrets and variables**, because `yoodle-web` is a personal-account repo. Rhea (`rhea333`) has push access but not admin. Moving the repo to a GitHub organization later would let both manage them.
- Manual fallback: run page → Artifacts → `Yoodle-ios-simulator` → extract once → upload `Yoodle-sim.zip` (still zipped) to Appetize.

**What Stage A can test:** layout, safe areas and notch, WebKit-specific bugs, sign-in (Google, email code), map, GPS (Appetize lets you set a location), deep links, share, live updates.
**What it can't test:** push notifications and Sign in with Apple. Both need a signed build from the paid account.

**Stage B: after the Apple Developer Program account is approved.** A `testflight` job builds a **signed release** and uploads it to TestFlight (steps in §2.5). The App Store submission uses the same TestFlight build. No Mac is needed at any point.

**Rules for this setup**
- Workflow logs are public, because the repo is public. Never `echo` secrets. Keep keys, certificates and tokens only in Actions secrets.
- Each iOS test is a push followed by a CI build, so do day-to-day testing on the Android emulator (once installed) and use iOS builds for spot checks.
- If iOS-only bugs get hard to debug without Safari Web Inspector, revisit this: rent a cloud Mac by the hour, or buy a used Mac mini.

### 2.3 Appetize (iOS Simulator in the browser)

- Free plan: **30 streaming minutes per month, 2 concurrent users, resets on the 1st.** Starter is $59/mo if that's ever not enough.
- Minutes count only while a session is running (after **Tap to play**). End a session by leaving the player page (click **Apps** in the sidebar) or closing the tab. The device toolbar on the right (home, lock, screenshot …) controls the phone and has no stop button. Set a short inactivity timeout in Organization Settings → Session Defaults.
- **Rationing rule (decided 2026-11-20):** batch fixes into one build, then test them all in one short session against a written checklist (§7.1).

### 2.4 Testing on a real iPhone from Windows (Sideloadly)

Unlimited testing of the real app on a real iPhone without a Mac or the paid Apple account. **Sideloadly needs only an ordinary Apple Account**, the same kind used for the App Store. It doesn't need the paid Developer Program.

1. Download `Yoodle-device.ipa` from the run's **Artifacts → Yoodle-iphone-sideloadly** and extract it once.
2. One-time PC setup: install **iTunes and iCloud from apple.com** (the direct-download versions, not the Microsoft Store versions), because Sideloadly needs Apple's USB drivers from them. Install **Sideloadly** from sideloadly.io only. Restart the PC.
3. Connect the iPhone by USB, unlock it, and tap **Trust**.
4. In Sideloadly: choose the iPhone, enter the Apple Account email, drag in the `.ipa`, **Advanced options → bundle ID `ca.yoodle.app.dev`**, then Start (password + 2FA code).
5. First install only, on the iPhone: **Settings → General → VPN & Device Management** → trust the Apple Account. On iOS 16+: **Settings → Privacy & Security → Developer Mode** → on (the phone restarts).

**Rules / limits**
- **Use a spare Apple Account, not your main one.** Sideloadly needs its password to request a free signing certificate. Turn on two-factor authentication for it.
- **Always change the bundle ID** (`ca.yoodle.app.dev`). If a free account registers `ca.yoodle.app`, Apple can block that ID from the paid account later.
- Free-account limits: the app stops opening after **7 days** (re-install from Sideloadly to renew, and the app's data is kept), at most **3 sideloaded apps** on the phone, and about **10 new app IDs per week**. New builds aren't automatic: download the new `.ipa` and install again.
- Push notifications and Sign in with Apple don't work with free signing.
- The `ca.yoodle.app://auth` URL scheme is inside the app, so Google sign-in works with the changed bundle ID too.
- With the paid account, Sideloadly-signed apps last 1 year, but TestFlight (§2.5) is the better route.

### 2.5 After the paid Apple account: TestFlight (cloud only)

`push → GitHub Mac builds + signs → uploads to App Store Connect → TestFlight app installs it on the iPhone over the air`

1. In developer.apple.com → Identifiers, register the App ID `ca.yoodle.app` (capabilities: Push Notifications, Sign in with Apple, Associated Domains).
2. In App Store Connect → Apps → +, create the Yoodle app record with that bundle ID.
3. In App Store Connect → Users and Access → Integrations, create an **App Store Connect API key** (role App Manager). The `.p8` file downloads **once**, so keep a copy.
4. The repo owner stores the key ID, issuer ID and `.p8` contents as GitHub Actions secrets.
5. Add a `testflight` job to `ios-build.yml`: archive (`-sdk iphoneos`, Release), sign automatically with the API key (`-allowProvisioningUpdates -authenticationKeyPath/-ID/-IssuerID`), and export with `method: app-store-connect, destination: upload`. Run it manually or on an `app-v*` tag, and bump `CURRENT_PROJECT_VERSION` on every upload. (It can be written in advance and skip itself until the secrets exist.)
6. In App Store Connect → TestFlight, add testers. **Internal testers** (team members, up to 100) get builds right away with no review. **External testers** (anyone by email or public link, up to 10,000) need a short Beta App Review for the first build of each version.
7. Testers install the **TestFlight** app from the App Store and accept the invite. New builds arrive with a notification and an **Update** button. Builds expire after **90 days**.
8. Web-only changes then arrive through Capgo live updates without a new TestFlight build (§2.1).

## 3. Decisions

### Open

| # | Question | Proposal | Why |
|---|----------|----------|-----|
| O4 | Push notifications | Keep **OneSignal** and switch to its native SDK inside the app | The backend already sends through OneSignal. Web push (`sw.js`) doesn't work inside a native WebView. iOS push needs the paid account (APNs key). |
| O5 | Sign in with Apple | Add it on iOS, next to Google and the email code | Apple guideline 4.8: an app that offers Google sign-in must also offer an equivalent privacy-friendly option. Needs the paid account. |
| O6 | ID verification fee ($2.99 through Stripe Identity) | **Needs a decision.** See §10 | Apple and Google may treat it as a digital service that must use in-app purchase. |
| O7 | Capgo plan, and self-hosted vs Capgo cloud | Capgo cloud | Least setup. Check the price against the expected number of monthly active devices. |
| O8 | Branches for the app | **One codebase:** merge `mobile-app` into `main` and delete it. `main` → site + Capgo `production` channel, `staging` → site/staging + Capgo `staging` channel. Production bundles start **gated** (promote in Capgo after checking on a test phone), then switch to automatic once trusted. Store builds come from `app-v*` tags on `main`. | Rejected: separate "app-production"/"app-staging" branches. Every web fix would need merging twice, Roman's pushes to `main` wouldn't reach the app, and the branches would drift apart. Capgo channels + promotion + one-click rollback give the same control. `mobile-app` was only a temporary scaffold branch. **Waiting on Rhea's OK (P5).** |
| O10 | Yoodle Tutor (tutor.yoodle.ca, separate repo): its own app? | **No separate app for launch.** The Yoodle app opens Tutor in the in-app browser sheet, already signed in (`openTutorSignedIn()` session handoff → `window.open` shim → `Browser.open`). Revisit later: (a) a separate Capacitor app in the tutor repo, if Tutor becomes its own business/audience; or (b) build Tutor into the Yoodle app, if it becomes core and needs native features (push for lesson reminders). | A second app doubles store review, listing, privacy forms, Capgo and CI, and risks Apple's 4.3 near-duplicate rule. The sheet works today with zero extra work and stays live with Tutor's own deploys. Tradeoff: it looks like a web page in a sheet and can't use push. The tutor repo hasn't been reviewed yet (build setup, payments). |
| O9 | Apple Developer enrolment: individual or organization | Organization, if Yoodle is incorporated | The App Store shows "Yoodle" as the seller instead of a personal name. Needs a D-U-N-S number (free, ~5 business days). A sole proprietorship can't enrol as an organization. |

### Decision log

Add a row whenever a tradeoff is settled. Newest first.

| Date | Decision | Reason / tradeoff |
|------|----------|-------------------|
| 2026-11-20 | App-only behaviour is added by **shimming browser APIs once** (`window.open`, link clicks, `navigator.share`, `navigator.geolocation`) in an `IS_NATIVE` block, not by editing each call site | Keeps `index.html` identical for the website, and future web code that uses those APIs works in the app automatically. |
| 2026-11-20 | Ration Appetize minutes: batch fixes, test once per batch against a checklist, and use Sideloadly (real iPhone) and later TestFlight for longer testing | Free plan is 30 min/month. |
| 2026-11-20 | Real-iPhone testing before the paid account: unsigned `.ipa` from CI + **Sideloadly** on Windows with a spare Apple Account, bundle ID `ca.yoodle.app.dev` | Unlimited and free. Tradeoffs: 7-day expiry, a USB cable, an Apple Account password typed into a third-party tool. |
| 2026-11-20 | App sign-in: in-app browser sheet (`@capacitor/browser`, SFSafariViewController on iOS) + custom-scheme deep link `ca.yoodle.app://auth` + Supabase **PKCE** (app only) | Google forbids OAuth in embedded web views. PKCE means the deep link carries a one-time code, not tokens. Custom scheme instead of Universal Links for now, because Universal Links need the paid Apple account (Associated Domains). Revisit then. |
| 2026-11-20 | **iOS first**, Android after Android Studio is installed | iOS builds need nothing local (CI). Android needs a JDK + Android Studio on the PC. |
| 2026-11-20 | Capacitor project in **`mobile/`** in this repo, excluded from the Pages deploy (was O1). App ID **`ca.yoodle.app`** (was O3, can still change until the first store upload) | One repo keeps web changes and app bundles in step. `package.json`/`node_modules` stay out of the site root. |
| 2026-11-20 | **iOS builds run on GitHub Actions macOS runners. They're free because the repo is public.** Simulator builds (no signing) are tested in the browser with Appetize.io's free tier. Once the paid Apple account exists, the same workflow signs the build and uploads it to TestFlight. | No Mac needed and $0. Tradeoffs: no local iOS debugging, and every iOS test is a push followed by a CI build. Workflow logs are public, so print no secrets and keep them in Actions secrets. Revisit (cloud Mac rental or a used Mac mini) if iOS-only bugs get hard to chase. |
| 2026-11-20 | Plugin adds, upgrades and removals, plus all native config changes, ship only in planned store releases. Bundles relying on them are gated to the new native version (§2.1) | Old binaries stay in use for months. A mismatched bundle would call native code that isn't there. |
| 2026-11-20 | Bundle the web app and update it with Capgo, instead of loading `yoodle.ca` remotely | Faster start, works offline, lower review risk. The cost is a CI upload step on each deploy. |

## 4. Prerequisites and tooling

| Tool | For | Status (2026-11-20) |
|------|-----|---------------------|
| Node.js | Capacitor CLI | v24.13.1 installed. **Global `~/.npmrc` uses an `http://` registry (P9).** `mobile/.npmrc` forces https. |
| Android Studio (includes JDK + SDK + emulator) | Android build and emulator | Not installed. SDK folder exists at `%LOCALAPPDATA%\Android\Sdk` with an emulator `Yoodle_API34`. No `java`, no `ANDROID_HOME` (P8) |
| GitHub Actions `macos-latest` runner (Xcode 26.6) | iOS builds instead of a local Mac | ✅ Working (`ios-build.yml`) |
| Appetize.io free account | iOS Simulator in the browser | ✅ Created (Rhea). Token secret ✅. `APPETIZE_APP_KEY` variable ✅. Fixed link: https://appetize.io/app/2atf3cdwym3jkudn7pbf7x7gda |
| Sideloadly + iTunes + iCloud (apple.com versions) + spare Apple Account | Real-iPhone testing (§2.4) | To do (P6) |
| Apple Developer Program ($99 USD/yr) | TestFlight and App Store | To do (P7, O9) |
| Google Play Console ($25 one-off) | Play testing and release | To do. New personal accounts must run a closed test before production (see §10) |
| Capgo account + API key | Live updates | To do (Phase 3) |
| OneSignal app: iOS (APNs key) + Android (FCM) platforms | Native push | To do |
| Firebase project (`google-services.json`) | FCM for Android push | To do |

## 5. Build plan

Each phase ends with something you can test. The commands actually run go in the build log (§9). The order changed to **iOS first** (decision log).

**Phase 0: Accounts and tooling**
- [x] Settle how to build iOS → GitHub Actions + Appetize
- [x] Appetize account + token secret
- [ ] Install Android Studio, set `ANDROID_HOME`, check the emulator (P8)
- [ ] Apple Developer Program (P7), Google Play Console, Capgo account

**Phase 1: Capacitor scaffold**
- [x] Create `mobile/`, install Capacitor 8.6.2 (`core`, `cli`, `ios`, `android`)
- [x] `capacitor.config.json` (`ca.yoodle.app`, `webDir: www`)
- [x] `scripts/build-www.mjs` copies the site into `mobile/www` (same exclusions as the Pages deploy)
- [x] `npx cap add ios`
- [x] Exclude `mobile` from the Pages deploy (`deploy.yml`) + `mobile/.gitignore`
- [x] iOS CI build + Appetize. App opens on iPhone 14 Pro
- [ ] `npx cap add android` and run on the emulator (after P8)

**Phase 2: Make the web app native-aware** (changes to `index.html` that are safe on the website)
- [x] `IS_NATIVE` flag
- [x] Google sign-in: in-app browser + `ca.yoodle.app://auth` deep link + PKCE. *Needs P1, then test*
- [x] Email sign-in link returns to the app (the 6-digit code already worked)
- [x] Site-page links (`/terms`, `/faq` …) and external links / `window.open` (tutor handoff, agency jobs, notification links, Stripe Identity) → in-app browser sheet. *Test*
- [x] Share → native share sheet. *Test*
- [x] Location → native permission prompt + GPS. *Test*
- [x] Keyboard resizes the app (fixes header under the status bar while typing). *Test*
- [x] Standalone checks: the app counts as installed (no "Add to Home Screen" steps), and web-push prompts are off in the app until native push. *Test*
- [ ] Push: OneSignal native SDK when `IS_NATIVE`, keeping the same `OneSignal.login(userId)` mapping (iOS needs the paid account)
- [ ] CORS: check Supabase Edge Functions accept the `capacitor://localhost` and `https://localhost` origins (ID verification, etc.)
- [ ] Stripe Checkout / Identity: in the app, open in the in-app sheet and return to the app (currently `location.href` → Safari → website). Depends on O6.
- [ ] Android back button: close the open sheet/chat, then go back a tab, then exit

**Phase 3: Live updates (Capgo)**
1. Install `@capgo/capacitor-updater` and call `CapacitorUpdater.notifyAppReady()` early in `index.html`. Without that call Capgo rolls the bundle back as failed.
2. Create the `production` and `staging` channels.
3. Add a CI job that builds `www` and runs `npx @capgo/cli bundle upload --channel production` (or `staging`) on push to `main` (or `staging`). Production starts gated (O8).
4. Test it: install a build, push a visible web change, and confirm the app picks it up without reinstalling. Test rollback too.

**Phase 4: Native polish**
App icon and splash (`@capacitor/assets`), status bar text colour for the dark theme (`@capacitor/status-bar`), safe-area check (notch, home indicator), haptics if wanted.

**Phase 5: Signed iOS + TestFlight** (after P7, §2.5)
TestFlight job, Info.plist purpose strings review, push capability + OneSignal, Sign in with Apple (O5), Universal Links (Associated Domains) instead of the custom scheme.

**Phase 6: Store prep and beta.** See §10. TestFlight, Play internal or closed testing, then submission.

## 6. Plugins

> **Every plugin below is native code compiled into the app binary.** Adding, upgrading or removing any of them needs a new App Store / Play release. Capgo can't deliver it (§2.1). So the first store build should include every plugin we expect to need, including optional ones like haptics, to avoid an early second review.

All plugins are reached from `index.html` through `window.Capacitor.Plugins.<Name>`, which the iOS app injects at page start (checked in Capacitor's `JSExport.swift`). The page doesn't load the npm JS packages.

| Plugin | Installed | Why we need it | Replaces in the web app | Native config |
|--------|-----------|----------------|-------------------------|---------------|
| `@capacitor/app` | ✅ 8.1.2 | Deep links for the sign-in return (`appUrlOpen`, `getLaunchUrl`). Later: Android back button, resume events | Nothing (new) | iOS: `CFBundleURLTypes` scheme `ca.yoodle.app` ✅. Android: intent filter (later) |
| `@capacitor/browser` | ✅ 8.0.5 | Google OAuth in an in-app browser sheet (required by Google), plus site pages, external links, tutor handoff, Stripe Identity | `signInWithOAuth` redirect, `window.open`, link clicks | None |
| `@capacitor/geolocation` | ✅ 8.2.5 | Native location prompt with Yoodle's purpose text, GPS for map/distances/chat location bar | `navigator.geolocation` (shimmed) | `NSLocationWhenInUseUsageDescription` ✅. Android `ACCESS_FINE/COARSE_LOCATION` (later) |
| `@capacitor/share` | ✅ 8.0.3 | Native share sheet (invite, share a job, live screen) | `navigator.share` (shimmed; missing on Android WebView) | None |
| `@capacitor/keyboard` | ✅ 8.0.6 | Resizes the app above the keyboard, so chat input stays visible and the page doesn't scroll under the status bar | Nothing | `capacitor.config.json` → `plugins.Keyboard.resize: "native"` ✅ |
| `@capgo/capacitor-updater` | Phase 3 | Live updates: web changes reach installed apps without a store release | Nothing (new) | Capgo app ID / API key |
| `onesignal-cordova-plugin` (OneSignal's official Capacitor-compatible SDK) | Later | Native push. Web push doesn't work in the app WebView | OneSignal web SDK + `sw.js` | APNs key, FCM `google-services.json`, iOS push capability + notification service extension |
| `@capacitor/splash-screen` | Phase 4 | Branded launch screen. Hide it only once the map is ready | Nothing | Splash assets |
| `@capacitor/status-bar` | Phase 4 | Status bar text colour that matches the light/dark theme | `theme_color` meta | None |
| `@capacitor-community/apple-sign-in` (or Supabase Apple OAuth via Browser) | Phase 5 | Sign in with Apple (guideline 4.8) | Nothing (new) | Sign in with Apple capability, Apple Services ID, Supabase Apple provider |
| `@capacitor/clipboard` | Only if needed | Copy-link fallback. `navigator.clipboard` should work (`capacitor://localhost` is a secure context) | `navigator.clipboard` | None |
| `@capacitor/haptics` *(optional)* | Decide before the first store build | Small taps on confirm actions | Nothing | None |
| `@capacitor/assets` *(dev tool, not a runtime plugin)* | Phase 4 | Generates all icon and splash sizes from one source image | Nothing | None |

**Not needed for now:** a camera plugin (Stripe Identity takes its own photos in the browser) or file upload (the app has no file inputs today). Add rows here if that changes.

## 7. Testing and emulation

| What | How |
|------|-----|
| iOS Simulator (no Mac) | Push → the `simulator` job builds and uploads to Appetize → open the link from the run summary (§2.2, §2.3). Can't test push or Sign in with Apple. |
| Real iPhone (no paid account) | `device` job → `Yoodle-device.ipa` → Sideloadly (§2.4). Unlimited, 7-day expiry. |
| Real iPhone (paid account) | TestFlight (§2.5). Needed for push and Sign in with Apple. |
| iOS rendering quick check | Open yoodle.ca/staging/ in Safari on any iPhone. Same WebKit engine as the app's WebView, no native plugins. |
| App-only JS logic | Node test of the `IS_NATIVE` block against fake plugins (run on 2026-11-20 for links/share/location; caught the `URL.origin === "null"` bug before it reached a phone). |
| Android emulator | (After P8) Android Studio → Device Manager → `Yoodle_API34` or a newer Pixel AVD. Run `npx cap run android` from `mobile/`. |
| Debugging the Android WebView | Chrome → `chrome://inspect` → pick the Yoodle WebView. You get the full console and network tabs. |
| Live reload while editing | Serve the repo root locally (e.g. `npx serve .` on port 3000). Run `npx cap run android -l --external`, or set `server.url` to the PC's LAN IP **in a dev-only config**. Never ship with `server.url`. |
| Physical Android | USB debugging on, then `npx cap run android --target <device>`. Needed for real push and real GPS. |
| GPS | Appetize toolbar → location pin. Android emulator → Extended controls → Location. |
| Deep links / OAuth | Android: `adb shell am start -a android.intent.action.VIEW -d "ca.yoodle.app://auth?code=test"`. iOS: sign in with Google in the app. |
| Live updates | Point a test device at the Capgo `staging` channel, push to `staging`, and confirm the change shows after resume. Also check the rollback: a bundle that never calls `notifyAppReady` must revert. |
| Data | Same live Supabase database as the site. **Use test accounts** (as with yoodle.ca/staging/). |
| Beta testers | TestFlight (iOS) and Play internal testing track (Android). |

### 7.1 Current Appetize session checklist (Phase 2 batch, build `2340b62`)

One session, ~5 minutes. End it by leaving the page.
- [ ] Landing screen with **no keyboard open**: is the logo clear of the clock/battery?
- [ ] **Continue with Google** → sheet slides up → sign in → "Open in Yoodle?" → **Open** → signed in inside the app (needs P1)
- [ ] Location button → prompt "Yoodle uses your location…" → Allow → map moves (set a fake location from the Appetize toolbar pin)
- [ ] Open a chat, tap the message box: is the input visible above the keyboard?
- [x] **Share** on a job → iOS share sheet ✅ (link was `capacitor://localhost/…`, fixed in the next build. Re-check that it shows `https://yoodle.ca/job.html?job=…`)
- [x] **Terms** / **FAQ** links → yoodle.ca page opens in a sheet ✅ (FAQ checked)
- [ ] Google sign-in, waiting on P1 (Roman)
- [ ] No "Add to Home Screen" text anywhere. Profile's notification tip says "coming to the Yoodle app soon". No "Yes, notify me" pop-up. Sending a chat message doesn't ask to turn on notifications
- [ ] Tutor link opens tutor.yoodle.ca in the sheet, already signed in (O10)

**Appetize limitation (2026-11-20):** the mouse is one finger, so **pinch-to-zoom-out doesn't work** (double-tap zoom-in does). The map has no +/− buttons. In Appetize, use MapLibre's one-finger zoom (double-tap, hold, drag up/down). Confirm pinch zoom on a real iPhone (Sideloadly/TestFlight). Rhea confirmed it was the **map**, so this isn't an app bug and no code change is needed. Optional design idea: +/− map buttons for accessibility. Separate open question: should the app block whole-page zoom (`user-scalable=no` in the app only) so only the map zooms?

### 7.2 Per-release test checklist

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

Keep secrets out of the repo. Record *where* each one lives, not its value. On this personal-account repo, only the owner (Roman) can add Actions secrets and variables.

| Secret / setting | Lives in | Status |
|------------------|----------|--------|
| Appetize API token | GitHub Actions secret `YOODLE_MOBILE_APPETIZE_TOKEN` | ✅ Added 2026-11-20 |
| Appetize app key (not secret) | GitHub Actions **variable** `APPETIZE_APP_KEY` = `2atf3cdwym3jkudn7pbf7x7gda` | ✅ Set (confirmed 2026-11-20: build updated the same app) |
| Supabase redirect URL `ca.yoodle.app://auth` | Supabase → Authentication → URL Configuration (needs Roman's Supabase access) | Pending (P1, waiting on Roman) |
| Capgo API key | GitHub Actions secret `CAPGO_TOKEN` | Phase 3 |
| App Store Connect API key (key ID, issuer ID, `.p8`) | GitHub Actions secrets | After P7 |
| Android upload keystore + passwords | To decide: keep it **backed up**, because losing it blocks Play updates unless Play App Signing is used (recommended) | Later |
| APNs auth key (.p8) | OneSignal dashboard | After P7 |
| `google-services.json` | `mobile/android/app/`. It's fine to commit for FCM, but check | Later |

## 9. Build log

Exactly what was run, in order, with the date. Note versions installed and anything that went wrong and how it was fixed.

| Date | Step | Command / action | Result / notes |
|------|------|------------------|----------------|
| 2026-11-20 | Plan | Wrote this document | No code changes yet |
| 2026-11-20 | Check the Android toolchain | Looked at `%LOCALAPPDATA%\Android\Sdk`, `~\.android\avd`, PATH | **Found:** SDK with `platform-tools` (adb), `emulator`, platform `android-34`, build-tools `34.0.0`, system images `android-34` + `android-VanillaIceCream` (35). An emulator `Yoodle_API34` already exists. **Missing:** Android Studio app, a JDK (`java`/`JAVA_HOME`), `ANDROID_HOME` env var, PATH entries. Newer platforms Capacitor needs (API 35/36) will be installed by SDK Manager or Gradle. |
| 2026-11-20 | Decide to go iOS first | — | Android waits until Android Studio + JDK are installed. iOS is built in CI (§2.2), so it needs nothing local. |
| 2026-11-20 | Branch | `git switch -c mobile-app` | Temporary branch for the scaffold. Only `main`/`staging` deploy the site, so this branch doesn't touch yoodle.ca. To be merged into `main` and deleted (O8). |
| 2026-11-20 | npm registry over HTTPS | Created `mobile/.npmrc` with `registry=https://registry.npmjs.org/` | Rhea's user `~/.npmrc` sets `registry=http://registry.npmjs.org` (plain http: packages could be tampered with in transit). The project file overrides it for `mobile/`. Rhea's global file is unchanged (P9). |
| 2026-11-20 | Install Capacitor | `cd mobile` → `npm init -y` → `npm install @capacitor/core@8.6.2 @capacitor/ios@8.6.2 @capacitor/android@8.6.2` → `npm install -D @capacitor/cli@8.6.2` | Capacitor **8.6.2** (latest). 0 vulnerabilities. |
| 2026-11-20 | Web bundle script | Wrote `mobile/scripts/build-www.mjs`, `npm run build:www` | Copies the site into `mobile/www` with the same exclusions as the Pages deploy (+ `mobile`, `CNAME`, `node_modules`). Not minified (easier debugging). 22 top-level entries. |
| 2026-11-20 | Capacitor config | Wrote `mobile/capacitor.config.json` (`appId: ca.yoodle.app`, `appName: Yoodle`, `webDir: www`, `backgroundColor: #0A0A0A`, `ios.contentInset: never`) | JSON rather than TS (no TypeScript needed). |
| 2026-11-20 | Add iOS | `npx cap add ios` (on Windows) | Works on Windows. Capacitor 8 uses **Swift Package Manager** (no CocoaPods / `.xcworkspace`), so CI builds `ios/App/App.xcodeproj`. `ios/App/App/public` (copied bundle) is git-ignored. It's regenerated by `cap sync`. |
| 2026-11-20 | iOS CI workflow | Wrote `.github/workflows/ios-build.yml` | `macos-latest` runner: `npm ci` → `build:www` → `cap sync ios` → `xcodebuild -sdk iphonesimulator ARCHS="arm64 x86_64" CODE_SIGNING_ALLOWED=NO` → zips `App.app` → artifact **Yoodle-ios-simulator**. |
| 2026-11-20 | Keep `mobile/` off yoodle.ca | `deploy.yml`: added `--exclude=./mobile` | Must also be on `main` and `staging` when merged (deploy.yml must match on both). |
| 2026-11-20 | Known issues noted | — | Links like `/terms`, `/privacy`, `/faq` rely on GitHub Pages dropping `.html`, so in the app they'd land on the home screen. Google sign-in would fail until the deep-link work. Both were fixed later the same day (below). |
| 2026-11-20 | First iOS CI build | Pushed `mobile-app` → run [44777542202](https://github.com/fr69j74n29-afk/yoodle-web/actions/runs/44777542202) | ✅ **BUILD SUCCEEDED** on Xcode 26.6 (17F113), about 1.5 min for the build steps. Artifact `Yoodle-sim.zip` is 2.1 MB and contains `App.app` with the binary, `Info.plist` and `public/index.html` + `js/`. |
| 2026-11-20 | Auto-upload to Appetize | Added an "Upload to Appetize" step to `ios-build.yml` | Rhea's account can't add repo secrets (push, not admin). The secret was added as `YOODLE_MOBILE_APPETIZE_TOKEN` and the workflow was changed to that name. The first re-run skipped the upload because the workflow was still reading `APPETIZE_API_TOKEN`. |
| 2026-11-20 | First automatic Appetize upload | Run [44782985550](https://github.com/fr69j74n29-afk/yoodle-web/actions/runs/44782985550) | ✅ Created Appetize app `xj5rqqzprlq2cbpvp7xxlvtrfu`. **Also fixed:** a PowerShell 5.1 edit garbled `→`/emoji and added a BOM to the workflow and this doc. Edit files with UTF-8-safe tools (not `Get-Content`/`Set-Content` in PowerShell 5.1). |
| 2026-11-20 | First Appetize test (Rhea) | iPhone 14 Pro, iOS 17.2 | App opens to the sign-in screen and the email code arrives. **Google sign-in opened Safari** and signed in the *website*, not the app: Capacitor iOS hands any top-level navigation to another site over to the system (`WebViewDelegationHandler.swift` lines 107–121), and Supabase fell back to the Site URL because `capacitor://localhost` isn't an allowed redirect. **Also seen:** the logo and "Sign in" under the status bar, with the keyboard open. |
| 2026-11-20 | Fix Google sign-in in the app | `npm install @capacitor/app@8 @capacitor/browser@8` (→ 8.1.2 / 8.0.5). `Info.plist`: `CFBundleURLTypes` scheme `ca.yoodle.app`. `index.html`: `IS_NATIVE`, `NATIVE_AUTH_RETURN='ca.yoodle.app://auth'`, Supabase client with `flowType:'pkce'` in the app only, `signIn()` → `signInWithOAuth({skipBrowserRedirect:true})` + `Browser.open`, new `_nativeAuthInit()` (`appUrlOpen` + `getLaunchUrl` → `exchangeCodeForSession` or `setSession`). Email OTP `emailRedirectTo` → deep link in the app. `npm run sync:ios`. Commit `5681120` | Website code path unchanged (`IS_NATIVE` is false). **Requires P1** (Supabase redirect URL). Tradeoff: in the app, the email *link* only works when tapped on the same phone. On a computer use the 6-digit code. |
| 2026-11-20 | Build with the sign-in fix | Run 44785112087 | ✅ BUILD SUCCEEDED. Created a second Appetize app `uimifbaisvdwjiwtbe4b22jukm` (`APPETIZE_APP_KEY` not set). |
| 2026-11-20 | iPhone build for Sideloadly | Added the `device` job to `ios-build.yml`. Run [44785586414](https://github.com/fr69j74n29-afk/yoodle-web/actions/runs/44785586414) | ✅ BUILD SUCCEEDED. `Yoodle-device.ipa` is 1.1 MB: `Payload/App.app` with the binary, `Info.plist`, `public/index.html`, `Capacitor.framework`, `Cordova.framework`, app icons. The simulator job created a third Appetize app `auvftf7pb27umop5fiwvbygyc4`. |
| 2026-11-20 | Rhea: app opens on iPhone 14 (Appetize) | — | Decision: ration Appetize minutes until TestFlight. |
| 2026-11-20 | Phase 2 batch: links, share, location, keyboard | `npm install @capacitor/geolocation@8 @capacitor/share@8 @capacitor/keyboard@8` (→ 8.2.5 / 8.0.3 / 8.0.6). `capacitor.config.json`: `plugins.Keyboard = {resize: "native", resizeOnFullScreen: true}`. `Info.plist`: `NSLocationWhenInUseUsageDescription`. `index.html`: one app-only block after `NATIVE_AUTH_RETURN` that routes existing web APIs to plugins (`window.open`, link clicks, `navigator.share`, `navigator.geolocation`), plus the sign-in GPS refresh now uses `Geolocation.checkPermissions()` in the app. Commit `2340b62` | **Links:** site pages (`/terms`, `faq.html` …) open the live `https://yoodle.ca/...` page in the in-app sheet, other sites open in the sheet too, and `mailto:`/`tel:` go to the system. **Bug caught before testing:** for `capacitor://` URLs, `URL.origin` is `"null"`, so the same-site check compares protocol + host. Verified with a Node test against fake plugins for both `capacitor://localhost` (iOS) and `https://localhost` (Android). **Status-bar overlap:** CSS already pads with `env(safe-area-inset-top)` (`--sat`). The overlap in the screenshot happened with the keyboard open (iOS scrolls the page up), so the fix is the keyboard `resize: native` setting. Re-check without the keyboard (§7.1). |
| 2026-11-20 | Phase 2 batch build | Run 44787173097 | ✅ Both jobs succeeded (simulator + iPhone `.ipa`). Created a fourth Appetize app `2atf3cdwym3jkudn7pbf7x7gda`. **This is the one to keep (P2, P3).** |
| 2026-11-20 | Rhea: Google sign-in test (build `2340b62`) | Appetize, iPhone 14 Pro | **Partly working.** ✅ The in-app browser sheet opens and Google accepts the sign-in there. ❌ Afterwards Supabase redirected to **yoodle.ca** inside the sheet (signing in the website, not the app), which means `ca.yoodle.app://auth` isn't on Supabase's Redirect URLs yet (P1). Fix is a Supabase setting only, no new build. Seen in the sheet: the site's Terms of Use acceptance prompt for new accounts (covers the App Store UGC "agree to terms" requirement). |
| 2026-11-20 | Rhea: share + FAQ test (build `2340b62`) | Appetize | ✅ **FAQ** opens the live yoodle.ca page in the in-app sheet (Done / yoodle.ca bar). ✅ **Share** opens the native iOS share sheet. ❌ The shared job link was `capacitor://localhost/job.html?job=…` (dead link for anyone receiving it). |
| 2026-11-20 | Fix shared job link + "Become a PRO" | `index.html`: `shareJob()` uses `https://yoodle.ca` in the app (`IS_NATIVE ? 'https://yoodle.ca' : window.location.origin`). `fsBecomePro()` opens `pro.yoodle.ca` in the in-app sheet in the app (it used `location.href`, which Capacitor would throw out to Safari) and resets the Continue button | A search for `location.origin`/`location.href` found these were the only two. The other share links already hard-code `https://yoodle.ca`. Website behaviour unchanged. **Found, not fixed:** Stripe Checkout / Stripe Identity (`window.location.href = b.url`) would also leave the app for Safari and return to the website. Left until the ID-verification payment decision (O6), because in-app purchase rules may change this flow anyway. |
| 2026-11-20 | Hide website-only install/push prompts in the app | `index.html`: `isInStandaloneMode()` returns true when `IS_NATIVE`. `registerOneSignal()` and `maybeAskPushAfterSend()` return early in the app. `updateNotifNudge()` hides the bell nudge. `requestNotifPermission()` → Profile. `updateNotifTip()` (Profile) says "Notifications are coming to the Yoodle app soon…". Ready to work's push check returns a new `'app'` state ("Notifications are coming to the Yoodle app soon … you can turn it on at yoodle.ca") | **Why:** inside the app, the old checks told iPhone users to "Add Yoodle to your Home Screen" (they already have the app, and a reviewer would flag it), and the push buttons couldn't work: `window.Notification` doesn't exist in the app's web view, and the OneSignal web SDK would pop its own "Yes, notify me" prompt that does nothing. **Tradeoff:** no push and no Ready to work in the app until native push (OneSignal native SDK, iOS needs the paid account), so the app says so plainly instead of offering broken buttons. Checked that every remaining unguarded `Notification.*` read is only reached after the app's early return. Website behaviour unchanged. The `ios-pwa-tip` on the sign-in sheet checks `navigator.standalone` directly, so it stays hidden in the app. |
| 2026-11-20 | Build with the prompt changes | Run 44796123104 (commit `e26bec3`) | ✅ Both jobs succeeded. **Updated the existing Appetize app** `2atf3cdwym3jkudn7pbf7x7gda` instead of creating a new one, so the `APPETIZE_APP_KEY` variable is set (P2 done). This build also includes the shared-link and "Become a PRO" fixes (`12cdba2`). |
| 2026-11-20 | Doc review | Rewrote this document | Fixed out-of-date sections (status, §2.2 build command, folder diagram), section order, resolved decisions O1/O3, added pending actions (§0), branch plan (O8), plugin install status, secrets status and the current test checklist. |

## 10. Store submission checklist

The full list was shared in chat on 2026-11-20. Tick items here as they are done.

**Both stores**
- [ ] Privacy policy URL (`https://yoodle.ca/privacy.html`). Check that it mentions location, push, ID verification (Stripe) and analytics
- [ ] Support URL and contact email
- [ ] In-app account deletion (exists: Settings → Delete my account). Play also needs a web deletion URL
- [ ] User-generated content safeguards: report, block, terms acceptance and a way to remove content (report and block exist. ✅ Terms acceptance at sign-up confirmed 2026-11-20: "Our Terms of Use … zero tolerance for objectionable content or abusive behaviour" with I agree / Not now — sign out)
- [ ] Demo / review account with sample jobs and chats, plus notes for the reviewer
- [ ] Screenshots per required device size, icon, short and long description, keywords
- [ ] Age rating questionnaire
- [ ] **ID verification payment decision (O6).** In-app purchase rules may apply to the $2.99 fee. Options: make it free in the app, route it through IAP / Play Billing, or argue it is a real-world service. Decide before submitting.

**Apple**
- [ ] Sign in with Apple (O5)
- [ ] Purpose strings for location ✅ added, and push prompt timing
- [ ] App Privacy "nutrition label" answers
- [ ] Export compliance (standard HTTPS only → exempt)
- [ ] TestFlight beta pass

**Google Play**
- [ ] Data safety form
- [ ] Target API level meets the current Play requirement
- [ ] Closed test with the required number of testers for the required days (new personal developer accounts)
- [ ] Play App Signing enrolled
