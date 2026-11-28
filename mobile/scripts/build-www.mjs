// Builds mobile/www: the web bundle shipped inside the iOS/Android app (and zipped as a live update by app-bundle.yml).
// It copies the same files the GitHub Pages deploy publishes (.github/workflows/deploy.yml):
// everything in the repo root except the folders below. Files are copied as-is (not minified)
// so the app is easy to debug. Minifying can be added later to match the site.
// Usage (from mobile/): npm run build:www
import { cpSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const out = resolve(here, '..', 'www');

// Not part of the published site (keep in step with the tar --exclude list in deploy.yml)
const EXCLUDE = new Set(['.git', '.github', 'docs', 'supabase', 'mobile', 'node_modules', '.vscode', '.claude', 'CNAME']);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let files = 0;
for (const name of readdirSync(repoRoot)) {
  if (EXCLUDE.has(name)) continue;
  const src = join(repoRoot, name);
  cpSync(src, join(out, name), { recursive: true });
  files += statSync(src).isDirectory() ? readdirSync(src, { recursive: true }).length : 1;
}
console.log(`www built: ${files} files from ${repoRoot} -> ${out}`);
