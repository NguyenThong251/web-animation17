// node sweet-rsc.mjs <publicDir> — capture RSC payload variants per route into <publicDir>/__rsc/<key>/{full,pf,tree}.rsc
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const ROUTES = ["/", "/products", "/about", "/news", "/contact", "/products/masking", "/products/double", "/products/stationery", "/products/cloth", "/products/opp", "/products/opp-quiet", "/news/same-tape-three-generations-finally-a-face", "/news/sweettape-now-at-mr-diy"];
const VARIANTS = {
  full: { RSC: "1" },
  pf: { RSC: "1", "Next-Router-Prefetch": "1" },
  tree: { RSC: "1", "Next-Router-Prefetch": "1", "Next-Router-Segment-Prefetch": "/_tree" },
};
const keyOf = (r) => (r === "/" ? "index" : r === NOT_FOUND ? "_404" : r.slice(1));
// Unknown routes hit the site's catch-all [slug] not-found tree; capture it once with a
// placeholder slug that the clone shim swaps for the requested path at runtime.
const NOT_FOUND = "/this-page-does-not-exist";
const SLUG_MARK = "__CLONE_404_SLUG__";
for (const r of [...ROUTES, NOT_FOUND]) {
  for (const [v, h] of Object.entries(VARIANTS)) {
    const res = await fetch(`https://sweet-tape.com${r}?_rsc=clone`, { headers: { "user-agent": UA, ...h } });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || !ct.startsWith("text/x-component")) { console.log("FAIL", res.status, ct, r, v); continue; }
    let buf = Buffer.from(await res.arrayBuffer());
    if (r === NOT_FOUND) {
      const s = buf.toString("utf8"), n = s.split(NOT_FOUND.slice(1)).length - 1;
      if (n < 1) { console.log("FAIL no slug in 404 payload", v); continue; }
      buf = Buffer.from(s.split(NOT_FOUND.slice(1)).join(SLUG_MARK), "utf8");
    }
    const d = join(root, "__rsc", keyOf(r)); mkdirSync(d, { recursive: true });
    writeFileSync(join(d, `${v}.rsc`), buf);
    console.log(String(buf.length).padStart(7), r, v);
  }
}
