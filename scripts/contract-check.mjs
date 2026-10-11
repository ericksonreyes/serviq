#!/usr/bin/env node
// BFF/API contract check — static verification that every path a frontend
// api.js calls resolves to a real backend route.
//
// Collects route tables from:
//   - Laravel services: Route::method('/path/{param}') under prefix v1
//   - Express BFFs + support: app.method('/api/...') / api.method('/path')
//   - FastAPI ai-agent: @router/@app.method('/api/...')
// Then every request(BASE, 'path') in each frontend api.js must match
// SOME route — the path-typo / method-mismatch class of silent breakage.
//
// Params normalize: ${x} → {param}, :name → {param}. Query strings are
// stripped. Method is checked when declared (default GET).
//
// Usage: node scripts/contract-check.mjs   (exit 1 on any miss)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SERVICES = join(ROOT, 'services');
const fail = [];

const norm = (p) => p
  .split('?')[0]
  .replace(/\$\{[^}]*\}/g, '{param}')
  .replace(/:([a-zA-Z_]+)/g, '{param}');
const toRegex = (p) => new RegExp(`^${norm(p).replace(/\{[^}]*\}/g, '[^/]+')}/?$`);

// ── Backend route tables ────────────────────────────────────────────────
const routes = []; // {method, path, src}

for (const dir of readdirSync(SERVICES)) {
  const api = join(SERVICES, dir, 'routes/api.php');
  if (existsSync(api)) {
    const src = readFileSync(api, 'utf8');
    const hasV1 = src.includes("prefix('v1')");
    for (const m of src.matchAll(/Route::(get|post|put|patch|delete)\s*\(\s*'([^']+)'/g)) {
      // '/health' and routes that carry '/v1/' in their literal are
      // top-level (outside the v1 group) → /api prefix only.
      const p = m[2];
      const base = (p === '/health' || p.startsWith('/v1/') || !hasV1) ? '/api' : '/api/v1';
      routes.push({ method: m[1].toUpperCase(), path: base + p, src: dir });
    }
  }
  for (const f of ['src/index.js', 'src/app.ts']) {
    const file = join(SERVICES, dir, f);
    if (!existsSync(file)) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\b(?:app|api)\.(get|post|put|patch|delete)\s*\(\s*'([^']+)'/g)) {
      const p = m[2].startsWith('/api') ? m[2] : '/api/v1' + m[2];
      routes.push({ method: m[1].toUpperCase(), path: p, src: dir });
    }
  }
  const ai = join(SERVICES, dir, 'app/main.py');
  if (existsSync(ai)) {
    const src = readFileSync(ai, 'utf8');
    for (const m of src.matchAll(/@(app|router)\.(get|post|put|patch|delete)\s*\(\s*'([^']+)'/g)) {
      routes.push({ method: m[2].toUpperCase(), path: m[3], src: dir });
    }
  }
}

// ── Frontend call sites ─────────────────────────────────────────────────
const calls = []; // {file, line, method, path}
for (const dir of readdirSync(SERVICES)) {
  const api = join(SERVICES, dir, 'src/api.js');
  if (!existsSync(api)) continue;
  const src = readFileSync(api, 'utf8');
  // Calls may span lines — capture each request(...) block (~500 chars
  // covers the options object) so method detection works multiline.
  for (const m of src.matchAll(/request\([^)]*\)/gs)) {
    const block = m[0];
    const path = block.match(/request\([^,]+,\s*[`'`]([^`'']+)[`'']/)?.[1];
    if (!path) continue;
    // A ${...} containing '?' is a conditional query — drop it; caller-
    // supplied query var names (params/query/filter/suffix/search) too.
    // Other templates are path params.
    const clean = path
      .replace(/\$\{[^}]*\?[^}]*\}/g, '')
      .replace(/\$\{[^}]*(?:param|quer|filter|suffix|search|args)[^}]*\}/gi, '')
      .replace(/\$\{[^}]*\}/g, '{param}')
      .split('?')[0];
    const method = block.match(/method:\s*'(GET|POST|PUT|PATCH|DELETE)'/)?.[1] ?? 'GET';
    calls.push({ file: join(dir, 'src/api.js'), line: src.slice(0, m.index).split('\n').length, method, path: clean });
  }
}

// ── Match ───────────────────────────────────────────────────────────────
for (const c of calls) {
  const hit = routes.find((r) => toRegex(r.path).test(c.path) && r.method === c.method);
  if (!hit) fail.push(`${c.file}:${c.line}  ${c.method} ${c.path}  → no matching route`);
}

console.log(`contract check: ${calls.length} frontend calls vs ${routes.length} backend routes`);
if (fail.length) {
  console.log('\nMISSING:'); fail.forEach((f) => console.log(`  ${f}`));
  process.exit(1);
}
console.log('all paths resolve');
