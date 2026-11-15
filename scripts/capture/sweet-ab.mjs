// node sweet-ab.mjs <baseUrl> <label>   e.g. https://sweet-tape.com origin | http://localhost:4700 local
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const [BASE, label] = process.argv.slice(2);
const ROUTES = ["/", "/products", "/about", "/news", "/contact", "/products/masking", "/products/double", "/products/stationery", "/products/cloth", "/products/opp", "/products/opp-quiet", "/news/same-tape-three-generations-finally-a-face", "/news/sweettape-now-at-mr-diy"];
const origin = new URL(BASE).origin;
mkdirSync(`shots-${label}`, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const out = { routes: {}, softnav: null, form: null };

for (const r of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], bad = [], reqs = new Set(), external = new Set();
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 200)));
  page.on("response", (res) => {
    const u = new URL(res.url());
    if (u.origin === origin) { const p = u.pathname.replace(BASE.replace(origin, ""), "") || "/"; reqs.add(p); if (res.status() >= 400) bad.push(res.status() + " " + p); }
    else if (!u.protocol.startsWith("data") && !u.protocol.startsWith("blob")) external.add(u.hostname);
  });
  await page.goto(BASE + r, { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(5000);
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h + 1500; y += 450) { await page.mouse.wheel(0, 450); await page.waitForTimeout(110); }
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `shots-${label}/${r === "/" ? "home" : r.slice(1).replace(/\//g, "_")}.jpg`, type: "jpeg", quality: 55, timeout: 20000 }).catch(() => {});
  const dom = await page.evaluate(() => {
    const cs = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).fontFamily.split(",")[0].trim() : null; };
    return {
      title: document.title,
      elements: document.querySelectorAll("*").length,
      h1: document.querySelectorAll("h1").length, h2: document.querySelectorAll("h2").length, h3: document.querySelectorAll("h3").length,
      img: document.querySelectorAll("img").length, svg: document.querySelectorAll("svg").length, canvas: document.querySelectorAll("canvas").length,
      links: document.querySelectorAll("a").length, height: document.documentElement.scrollHeight,
      fontsLoaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")).sort().filter((v, i, a) => a.indexOf(v) === i),
      bodyFont: cs("body"), h1Font: cs("h1"), bg: getComputedStyle(document.body).backgroundColor,
      text: document.body.innerText.replace(/\s+/g, " ").slice(0, 300),
    };
  });
  out.routes[r] = { dom, errors, bad, reqs: [...reqs].sort(), external: [...external].sort() };
  console.log(label, r, JSON.stringify({ el: dom.elements, img: dom.img, errs: errors.length, bad: bad.length, fonts: dom.fontsLoaded.length }));
  await ctx.close();
}

// soft navigation: click menu links from home; a full reload would wipe the marker
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(5000);
  await page.evaluate(() => { window.__marker = 42; });
  const results = [];
  for (const target of ["/products", "/about", "/news", "/contact", "/products/masking"]) {
    const href = BASE.replace(origin, "") + target;
    const clicked = await page.evaluate((h) => { const a = [...document.querySelectorAll("a")].find((x) => x.getAttribute("href") === h || x.getAttribute("href") === h.replace(/^\/[^/]+/, "")); if (!a) return false; a.click(); return true; }, href);
    await page.waitForTimeout(4500);
    const st = await page.evaluate(() => ({ path: location.pathname, marker: window.__marker === 42, title: document.title }));
    results.push({ target, clicked, ...st });
  }
  out.softnav = { results, errors };
  console.log(label, "softnav", JSON.stringify(results.map((x) => `${x.target}:${x.clicked ? "click" : "nolink"}:${x.marker ? "soft" : "HARD"}:${x.path}`)));
  await ctx.close();
}
writeFileSync(`ab-sweet-${label}.json`, JSON.stringify(out, null, 1));
await browser.close();
