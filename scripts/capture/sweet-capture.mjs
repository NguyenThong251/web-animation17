// node sweet-capture.mjs <destDir>
// Captures every same-origin asset sweet-tape.com loads across all sitemap routes,
// plus raw SSR HTML per route and RSC payloads seen during client navigation.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const ORIGIN = "https://sweet-tape.com";
const DEST = process.argv[2];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const ROUTES = ["/", "/products", "/about", "/news", "/contact", "/products/masking", "/products/double", "/products/stationery", "/products/cloth", "/products/opp", "/products/opp-quiet", "/news/same-tape-three-generations-finally-a-face", "/news/sweettape-now-at-mr-diy"];

const save = (p, buf) => { const d = join(DEST, p); mkdirSync(dirname(d), { recursive: true }); writeFileSync(d, buf); };
const htmlPath = (r) => (r === "/" ? "/index.html" : `${r}/index.html`);

// 1. raw SSR HTML
for (const r of ROUTES) {
  const res = await fetch(ORIGIN + r, { headers: { "user-agent": UA } });
  save(htmlPath(r), Buffer.from(await res.arrayBuffer()));
  console.log("html", res.status, r);
}

const browser = await chromium.launch({ headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 900 } });
const seen = new Map(); const rsc = [];
ctx.on("response", async (res) => {
  try {
    const u = new URL(res.url());
    if (u.origin !== ORIGIN || !res.ok()) return;
    const req = res.request();
    const isRsc = u.searchParams.has("_rsc") || req.headers()["rsc"] === "1";
    if (isRsc) {
      const body = await res.body();
      const key = `${u.pathname}|${req.headers()["next-router-prefetch"] ? "prefetch" : "full"}|${req.headers()["next-router-segment-prefetch"] || ""}`;
      if (!seen.has("rsc:" + key)) { seen.set("rsc:" + key, true); rsc.push({ path: u.pathname, prefetch: !!req.headers()["next-router-prefetch"], segment: req.headers()["next-router-segment-prefetch"] || null, ct: res.headers()["content-type"], size: body.length, url: u.pathname + u.search }); save(`/__rsc${u.pathname === "/" ? "/index" : u.pathname}.${rsc.length}.rsc`, body); }
      return;
    }
    if (ROUTES.includes(u.pathname) || u.pathname.endsWith("/")) return;
    if (seen.has(u.pathname)) return;
    seen.set(u.pathname, true);
    const body = await res.body();
    if (body.length) save(decodeURIComponent(u.pathname), body);
  } catch {}
});

const page = await ctx.newPage();
for (const r of ROUTES) {
  await page.goto(ORIGIN + r, { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(4000);
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h + 2000; y += 500) { await page.mouse.wheel(0, 500); await page.waitForTimeout(120); }
  await page.waitForTimeout(2000);
  // hover + click internal links to trigger prefetch / soft navigation
  const links = await page.$$eval('a[href^="/"]', (as) => [...new Set(as.map((a) => a.getAttribute("href")))].slice(0, 20));
  for (const l of links) { try { await page.hover(`a[href="${l}"]`, { timeout: 1500 }); } catch {} }
  await page.waitForTimeout(1500);
  console.log("visited", r, "assets so far", seen.size);
}
// soft-navigation pass: click through nav from home
await page.goto(ORIGIN + "/", { waitUntil: "load" });
await page.waitForTimeout(4000);
for (const r of ROUTES.slice(1)) {
  try { await page.evaluate((href) => { const a = document.querySelector(`a[href="${href}"]`); if (a) a.click(); }, r); await page.waitForTimeout(3500); } catch {}
}
await browser.close();
writeFileSync(join(DEST, "..", "rsc-log.json"), JSON.stringify(rsc, null, 1));
console.log("done: files", seen.size, "rsc", rsc.length);
