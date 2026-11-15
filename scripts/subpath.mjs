#!/usr/bin/env node
/*
 * subpath.mjs — rebase the captured sweet-tape.com build onto a sub-path
 * (GitHub Pages serves this repo at /web-animation17/).
 *
 * The origin is a Next.js App Router (RSC) build compiled for basePath "" with
 * Turbopack. Same-origin references live in five places:
 *   1. HTML attributes            href|src|srcSet|imageSrcSet="/…"
 *   2. RSC flight data            "/assets/…", "/_next/…", "/api/media/…" (raw in __rsc/*.rsc,
 *                                 backslash-escaped inside the HTML's self.__next_f pushes)
 *   3. CSS                        url(/assets/…)
 *   4. JS literals                "/assets/…" (GLB models, textures) + Turbopack's chunk base let t="/_next/"
 *   5. Next router basePath       hasBasePath / addBasePath / removeBasePath compiled with ""
 * Route hrefs in RSC ("href":"/products") are NOT touched: next/link runs them through
 * the patched addBasePath. Plain anchors are kept inside the base by the clone shim.
 * The shim's own strings ("/__rsc/", "/_tree") are excluded. Every JS patch asserts its
 * exact match count; a final scan fails the build if any asset path is left un-prefixed.
 *
 * Usage: node scripts/subpath.mjs <siteDir> <base>     e.g. _site web-animation17
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

const [dir, baseArg] = process.argv.slice(2);
if (!dir || !baseArg) { console.error("usage: node subpath.mjs <siteDir> <base>"); process.exit(1); }
const BASE = "/" + baseArg.replace(/^\/+|\/+$/g, "");
const ASSET = "(?:assets|_next|api|__clone|icon\\.svg|apple-icon\\.png|manifest\\.webmanifest)";

const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } })(dir);
const byExt = (e) => files.filter((f) => extname(f) === e);

function fail(msg) { console.error("✗ " + msg); process.exit(1); }
function count(s, re) { return (s.match(re) || []).length; }
const totals = {};
function apply(file, rules) {
  let s = readFileSync(file, "utf8");
  for (const [name, re, to, expected] of rules) {
    const n = count(s, re);
    if (expected !== undefined && n !== expected) fail(`${file}: ${name} matched ${n}, expected ${expected}`);
    s = s.replace(re, to);
    totals[name] = (totals[name] || 0) + n;
  }
  writeFileSync(file, s);
}

// 1+2. HTML: attributes, escaped flight data, shim base
// data-* attributes carry asset paths the page JS loads (data-model GLBs, data-card,
// data-sticker, data-strip) — sometimes several joined by "|" (data-showcase="/a|/b").
const PIPE = ["pipe-list", new RegExp(`\\|\\/(${ASSET})`, "g"), `|${BASE}/$1`];
const htmlRules = [
  ["html-attr", /\b(href|src|srcSet|imageSrcSet|data-[a-z-]+)="\/(?!\/)/g, `$1="${BASE}/`],
  ["html-flight", new RegExp(`\\\\"\\/(${ASSET})`, "g"), `\\"${BASE}/$1`],
  PIPE,
  ["shim-base", /window\.__CLONE_BASE__ \|\| ""/g, JSON.stringify(BASE), 1],
];
for (const f of byExt(".html")) apply(f, htmlRules);

// 2. raw RSC payloads
for (const f of byExt(".rsc")) apply(f, [["rsc", new RegExp(`"\\/(${ASSET})`, "g"), `"${BASE}/$1`], PIPE]);

// 3. CSS
for (const f of byExt(".css")) apply(f, [["css-url", /url\(\/(?!\/)/g, `url(${BASE}/`]]);

// manifest icons + start_url
for (const f of byExt(".webmanifest")) apply(f, [["manifest", /"(src|start_url)":"\/(?!\/)/g, `"$1":"${BASE}/`]]);

// 4+5. JS
let router = 0, runtime = 0;
for (const f of byExt(".js")) {
  let s = readFileSync(f, "utf8");
  const a = count(s, /"\/assets\//g);
  s = s.replace(/"\/assets\//g, `"${BASE}/assets/`);
  totals["js-assets"] = (totals["js-assets"] || 0) + a;
  if (s.includes('let t="/_next/"')) { s = s.replace('let t="/_next/"', `let t="${BASE}/_next/"`); runtime++; }
  if (s.includes('"removeBasePath"')) {
    router++;
    const rules = [
      ['pathHasPrefix)(e,"")', `pathHasPrefix)(e,"${BASE}")`],
      // idempotent: the site's own link component pushes the already-based DOM href
      ['addPathPrefix)(e,"")', `addPathPrefix)(e.startsWith("${BASE}/")||e==="${BASE}"?e.slice(${BASE.length})||"/":e,"${BASE}")`],
      ['function n(e){return e}Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"removeBasePath"',
       `function n(e){return(e=e.slice(${BASE.length})).startsWith("/")?e:"/"+e}Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"removeBasePath"`],
    ];
    for (const [from, to] of rules) {
      const n = s.split(from).length - 1;
      if (n !== 1) fail(`${f}: router patch "${from.slice(0, 40)}…" matched ${n}, expected 1`);
      s = s.replace(from, to);
    }
  }
  writeFileSync(f, s);
}
if (router !== 1) fail(`router chunk patched ${router} times, expected 1`);
if (runtime !== 1) fail(`Turbopack runtime chunk base patched ${runtime} times, expected 1`);
if (totals["js-assets"] !== 27) fail(`js "/assets/ literals: ${totals["js-assets"]}, expected 27`);

// post-check: no un-prefixed asset path may remain anywhere
// ("/api/messages" in the shim is exempt: the shim matches it with or without the base.)
const leftover = new RegExp(`(\\\\?"|url\\(|\\|)\\/(${ASSET})(?!\\/messages")`, "g");
let bad = 0;
for (const f of [...byExt(".html"), ...byExt(".rsc"), ...byExt(".css"), ...byExt(".webmanifest")]) {
  const n = count(readFileSync(f, "utf8"), leftover);
  if (n) { console.error(`  leftover ${n} in ${f}`); bad += n; }
}
if (bad) fail(`${bad} un-prefixed asset references left`);

for (const [k, v] of Object.entries(totals)) console.log(`✓ ${k} ×${v}`);
console.log(`✓ router basePath helpers, Turbopack chunk base\nrebased ${dir} onto ${BASE}/`);
