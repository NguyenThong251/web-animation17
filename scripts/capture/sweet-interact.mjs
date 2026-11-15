// node sweet-interact.mjs <baseUrl>   — titles after soft nav, contact form, back-to-home
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const BASE = process.argv[2];
const origin = new URL(BASE).origin;
const prefix = BASE.replace(origin, "");
const browser = await chromium.launch({ headless: true, args: ["--enable-gpu", "--use-angle=d3d11"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [], posts = [], external = new Set();
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
page.on("request", (r) => { const u = new URL(r.url()); if (u.origin !== origin && !u.protocol.startsWith("data") && !u.protocol.startsWith("blob")) external.add(u.hostname); if (r.method() === "POST") posts.push(r.url()); });

const ab = JSON.parse(readFileSync("ab-sweet-origin.json", "utf8"));
const expected = Object.fromEntries(Object.entries(ab.routes).map(([r, v]) => [r, v.dom.title]));

// soft nav titles
await page.goto(BASE + "/products/cloth", { waitUntil: "load" });
await page.waitForTimeout(5000);
await page.evaluate(() => (window.__m = 1));
const nav = [];
for (const t of ["/about", "/news", "/products", "/contact", "/"]) {
  await page.evaluate((h) => { const a = [...document.querySelectorAll("a")].find((x) => x.getAttribute("href") === h); a && a.click(); }, prefix + t || "/");
  await page.waitForTimeout(4500);
  const s = await page.evaluate(() => ({ path: location.pathname, title: document.title, soft: window.__m === 1, h: document.documentElement.scrollHeight }));
  nav.push(`${t} -> ${s.path} soft=${s.soft} titleOK=${s.title === expected[t]}`);
}
console.log(nav.join("\n"));

// contact form
await page.goto(BASE + "/contact", { waitUntil: "load" });
await page.waitForTimeout(4000);
await page.fill('form.contact-form [name="email"]', "test@example.com").catch((e) => console.log("email field:", e.message));
await page.fill('form.contact-form [name="message"]', "clone test").catch((e) => console.log("message field:", e.message));
await page.evaluate(() => document.querySelector("form.contact-form").requestSubmit());
await page.waitForTimeout(2500);
const status = await page.evaluate(() => document.querySelector("form.contact-form").innerText.replace(/\s+/g, " ").slice(-120));
console.log("form status:", status);
console.log("POSTs that left the page:", posts, "| external hosts:", [...external], "| errors:", errors);
await browser.close();
