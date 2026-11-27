# js/ — how the app's code is organized

Since 25 Nov 2026 the app's main code lives here, one file per feature, instead of one ~5,000-line `<script>` inside `index.html`. Nothing was rewritten in that move: every function and variable kept its name and its code. `index.html` now holds the page (HTML + CSS) and loads these files.

## How the files load

- **Plain (classic) scripts, not ES modules yet.** They all share one global scope, exactly as when the code was one inline script. So `onclick="signIn('google')"` in the HTML and Roman's feature files (`yoodi.js`, `support-chat.js`, `swipe-actions.js`, `home-services.js`) keep calling functions by name.
- **Order matters only for code that runs while the page loads.** Most files only *define* functions and variables; those can be in any order. Code that *runs* at load (a top-level call like `initTheme()`, or `const homeAddr = makeAddrSearch(...)`) needs what it calls to be in an earlier file. The order is the list of `<script src="js/...">` tags at the end of `index.html`:
  1. `core-*` — shared by everything: `core-config` (constants), `core-state` (shared app state: `sb`, `me`, `map`, user location…), `core-ui` (toast, overlays, `esc`, `linkify`, avatars, times), `core-address` (address search)
  2. feature files (map, theme, find a helper / pro, location, pins, list, jobs, chat, profile, ID verification, ready to work, ratings, referrals…)
  3. `main.js` last — the startup that runs on `DOMContentLoaded`
- Roman's newer feature files (`home-services.js`, `yoodi.js`, `support-chat.js`, `swipe-actions.js`) load with `defer` from `<head>`, so they run after all of the above, as before. `index.html` calls into them through guarded hooks (`if (window.yoodiInit) yoodiInit()`).
- The theme is applied by a one-line script right after `<body>` (dark-mode users don't see a light flash while the files load). `js/theme.js` is the full theme code.

## Rules for changes

- **Put code in the file for its feature.** New feature → new file (`js/<feature>.js`), loaded before `main.js`. Shared helpers → `core-ui.js`; shared state → `core-state.js`; constants → `core-config.js`.
- **Bump `?v=`** on the `<script>` tag of any file you change (`?v=YYYYMMDDx`), so browsers and the iOS app pick up the new file.
- **Don't add new top-level code that runs at load** unless it has to; prefer calling it from `main.js` / `showApp()`. If you do, make sure everything it uses is in an earlier file.
- **Keep files flat in `js/`.** The deploy (`.github/workflows/deploy.yml`) minifies `js/*.js`, not subfolders. Top-level names are kept by the minifier, so calls by name keep working.
- Each file starts with a one-line description; keep it accurate.
- **Text boxes (`input`, `textarea`, `select`) use at least `font-size:16px`**, including in the `font:` shorthand. Smaller text makes iPhone Safari zoom the page when the box is tapped, and the page stays zoomed under Safari's bars. Don't fix it with `maximum-scale=1` in the viewport tag: that blocks pinch-zoom for people who need it.

## Next steps (planned, not done yet)

The research-backed path for a site without a build step is to move to native ES modules gradually, the way Chrome DevTools migrated (developer.chrome.com/blog/migrating-to-js-modules):

1. **Done (25 Nov 2026):** split into feature files with a fixed load order. No behaviour change.
2. **Replace inline `onclick="…"` with `addEventListener`** (or one delegated listener with `data-action="…"`), feature by feature. This is what lets functions stop being global.
3. **Turn leaf features into ES modules** (`<script type="module">`, `import` / `export`) once their HTML no longer calls them by name; expose only what other code still needs, temporarily, via `window`.
4. **Move shared state behind small modules** (e.g. `state.js` exporting getters/setters) instead of global `let`s.
5. Optional later: CSS split the same way (`css/`), and JSDoc + `// @ts-check` for editor type checking.
