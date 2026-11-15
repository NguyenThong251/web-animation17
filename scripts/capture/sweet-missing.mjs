// node sweet-missing.mjs <publicDir>  → prints referenced-but-missing same-origin assets
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2];
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } })(root);
const have = new Set(files.map((f) => "/" + relative(root, f).split("\\").join("/")));
const RE = /(_next\/static\/[A-Za-z0-9_\-./~%]+|assets\/[A-Za-z0-9_\-./%~]+\.(?:svg|png|jpe?g|webp|avif|gif|mp3|mp4|webm|wav|ogg|json|woff2?|ttf|otf|glb|riv|lottie|ico)|api\/media\/file\/[A-Za-z0-9_\-.%]+)/g;
const refs = new Map();
for (const f of files) {
  if (!/\.(html|js|css|rsc|json|webmanifest)$/.test(f)) continue;
  const t = readFileSync(f, "utf8").replace(/\\u002F/g, "/").replace(/\\\//g, "/");
  for (const m of t.matchAll(RE)) {
    let p = "/" + m[1].replace(/[.,]+$/, ""); if (p.startsWith("/static/")) p = "/_next" + p;
    try { p = decodeURIComponent(p); } catch {}
    if (!refs.has(p)) refs.set(p, relative(root, f));
  }
}
const missing = [...refs].filter(([p]) => !have.has(p) && !p.endsWith("/"));
console.log("refs", refs.size, "missing", missing.length);
for (const [p, f] of missing) console.log(p, "  <-", f);
writeFileSync(join(root, "..", "missing.txt"), missing.map(([p]) => p).join("\n"));
