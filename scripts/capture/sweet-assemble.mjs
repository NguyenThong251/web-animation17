// node sweet-assemble.mjs <capturedPublic> <projectDir>
// Copies the capture into <projectDir>/public, injects the clone shim into every HTML page,
// and points the GA loader (HTML + RSC payloads) at a local no-op script.
import { cpSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const [src, proj] = process.argv.slice(2);
const pub = join(proj, "public");
mkdirSync(pub, { recursive: true }); for (const f of readdirSync(pub)) rmSync(join(pub, f), { recursive: true, force: true });
cpSync(src, pub, { recursive: true });

const GA_SRC = "https://www.googletagmanager.com/gtag/js?id=G-9DT4VY7JGP";
const NOOP = "/__clone/no-ga.js";
mkdirSync(join(pub, "__clone"), { recursive: true });
writeFileSync(join(pub, "__clone", "no-ga.js"), "/* [clone] Google Analytics (G-9DT4VY7JGP) disabled in this mirror. */\n");

const ROUTES = { "/": "index", "/products": "products", "/about": "about", "/news": "news", "/contact": "contact", "/products/masking": "products/masking", "/products/double": "products/double", "/products/stationery": "products/stationery", "/products/cloth": "products/cloth", "/products/opp": "products/opp", "/products/opp-quiet": "products/opp-quiet", "/news/same-tape-three-generations-finally-a-face": "news/same-tape-three-generations-finally-a-face", "/news/sweettape-now-at-mr-diy": "news/sweettape-now-at-mr-diy" };

const SHIM = `<script data-clone-shim="">/* [clone] sweet-tape.com mirror shim.
 1) Soft navigation: Next's router fetches RSC payloads with request headers (RSC,
    Next-Router-Prefetch, Next-Router-Segment-Prefetch), which a static host cannot vary on.
    Serve the payloads captured per route from __rsc/<route>/{full,pf,tree}.rsc instead.
 2) Contact form: POST /api/messages is answered locally - nothing is sent anywhere.
 3) Google Analytics: opt-out flag set; the gtag.js loader points at a local no-op file. */
(function () {
  window["ga-disable-G-9DT4VY7JGP"] = true;
  var BASE = window.__CLONE_BASE__ || "";
  var ROUTES = ${JSON.stringify(ROUTES)};
  var realFetch = window.fetch.bind(window);
  function hget(h, k) {
    if (!h) return null;
    if (typeof h.get === "function") return h.get(k);
    if (Array.isArray(h)) { for (var i = 0; i < h.length; i++) if (String(h[i][0]).toLowerCase() === k) return h[i][1]; return null; }
    for (var key in h) if (key.toLowerCase() === k) return h[key];
    return null;
  }
  function withUrl(res, url) { try { Object.defineProperty(res, "url", { value: url }); } catch (e) {} return res; }
  window.fetch = function (input, init) {
    var req = typeof Request !== "undefined" && input instanceof Request ? input : null;
    var url;
    try { url = new URL(req ? req.url : String(input), location.href); } catch (e) { return realFetch(input, init); }
    if (url.origin !== location.origin) return realFetch(input, init);
    var headers = (init && init.headers) || (req && req.headers);
    var method = String((init && init.method) || (req && req.method) || "GET").toUpperCase();
    var p = url.pathname;
    if (BASE && p.indexOf(BASE) === 0) p = p.slice(BASE.length) || "/";
    p = p.length > 1 ? p.replace(/\\/$/, "") : p;
    if (method === "POST" && p === "/api/messages") {
      console.info("[clone] contact form submit answered locally (not sent)");
      return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    if (hget(headers, "rsc") === "1") {
      var key = ROUTES[p];
      if (!key) return realFetch(input, init);
      var seg = hget(headers, "next-router-segment-prefetch");
      var variant = seg ? (seg === "/_tree" ? "tree" : null) : hget(headers, "next-router-prefetch") ? "pf" : "full";
      if (!variant) return Promise.resolve(withUrl(new Response("", { status: 404 }), url.href));
      return realFetch(BASE + "/__rsc/" + key + "/" + variant + ".rsc").then(function (r) {
        if (!r.ok) return r;
        return r.arrayBuffer().then(function (b) {
          return withUrl(new Response(b, { status: 200, headers: { "Content-Type": "text/x-component" } }), url.href);
        });
      });
    }
    return realFetch(input, init);
  };
  // Under a sub-path deploy, plain <a href="/x"> (not next/link) would leave the mirror: keep them inside BASE.
  if (BASE) document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href^='/']") : null;
    if (!a || a.getAttribute("href").indexOf(BASE + "/") === 0 || a.getAttribute("href") === BASE) return;
    a.setAttribute("href", BASE + a.getAttribute("href"));
  }, true);
})();</script>`;

let pages = 0, gaHtml = 0, gaRsc = 0;
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (f.endsWith(".html")) {
      let s = readFileSync(p, "utf8");
      const n = s.split(GA_SRC).length - 1; gaHtml += n;
      s = s.split(GA_SRC).join(NOOP);
      if (!s.includes('<meta charSet="utf-8"/>')) throw new Error("no charset meta in " + p);
      s = s.replace('<meta charSet="utf-8"/>', '<meta charSet="utf-8"/>' + SHIM);
      writeFileSync(p, s); pages++;
    } else if (f.endsWith(".rsc")) {
      let s = readFileSync(p, "utf8");
      const n = s.split(GA_SRC).length - 1; gaRsc += n;
      if (n) writeFileSync(p, s.split(GA_SRC).join(NOOP));
    }
  }
})(pub);
console.log({ pages, gaHtml, gaRsc });
