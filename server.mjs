#!/usr/bin/env node
/*
 * server.mjs — dependency-free static server for the sweet-tape.com mirror.
 * Mirrors the origin (S3/CloudFront): correct MIME types, HTTP Range (206) for
 * video/audio seeking, CORS *, and index.html fallback for "/".
 *
 * Usage: node server.mjs [dir=public] [port=4700]
 */
import { createServer } from "node:http";
import { stat, open } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, normalize, extname, resolve } from "node:path";

const ROOT = resolve(process.argv[2] || "public");
const PORT = Number(process.env.PORT) || Number(process.argv[3]) || 4700;
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".otf": "font/otf", ".ttf": "font/ttf",
  ".woff": "font/woff", ".woff2": "font/woff2", ".mp4": "video/mp4", ".webm": "video/webm",
  ".mp3": "audio/mpeg", ".wasm": "application/wasm", ".glb": "model/gltf-binary",
  ".ktx2": "image/ktx2", ".wav": "audio/wav", ".rsc": "text/x-component", ".webmanifest": "application/manifest+json",
};

async function resolveFile(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0]);
  const abs = normalize(join(ROOT, p));
  if (!abs.startsWith(ROOT)) return null;
  try {
    const st = await stat(abs);
    if (st.isFile()) return { abs, st };
    if (st.isDirectory()) {
      const idx = join(abs, "index.html");
      return { abs: idx, st: await stat(idx) };
    }
  } catch {}
  return null;
}

createServer(async (req, res) => {
  const f = await resolveFile(req.url);
  if (!f) {
    // Like the origin (and GitHub Pages), unknown routes get the site's own 404 page.
    // GitHub Pages project sites use /<repo>/404.html, so try the first path segment too.
    const seg = req.url.split("?")[0].split("/")[1];
    const nf = !extname(req.url.split("?")[0]) && ((seg && (await resolveFile(`/${seg}/404.html`))) || (await resolveFile("/404.html")));
    if (nf) {
      res.writeHead(404, { "content-type": MIME[".html"], "access-control-allow-origin": "*" });
      return createReadStream(nf.abs).pipe(res);
    }
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("404 Not Found");
  }
  const type = MIME[extname(f.abs).toLowerCase()] || "application/octet-stream";
  const size = f.st.size;
  const headers = {
    "content-type": type,
    "access-control-allow-origin": "*",
    "accept-ranges": "bytes",
    "cache-control": "no-cache",
  };
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) {
    let start = range[1] === "" ? size - Number(range[2]) : Number(range[1]);
    let end = range[1] === "" || range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1);
    if (start > end || start >= size) {
      res.writeHead(416, { "content-range": `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
    if (req.method === "HEAD") return res.end();
    return createReadStream(f.abs, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "content-length": size });
  if (req.method === "HEAD") return res.end();
  createReadStream(f.abs).pipe(res);
}).listen(PORT, "0.0.0.0", () => console.log(`sweet-tape.com mirror → http://localhost:${PORT}  (root: ${ROOT})`));
