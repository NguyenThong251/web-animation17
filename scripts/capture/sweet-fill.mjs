// node sweet-fill.mjs <publicDir> — fetch everything in ../missing.txt from the origin, repeat closure until stable
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.argv[2];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const dead = new Set();
for (let round = 1; round <= 6; round++) {
  execFileSync(process.execPath, [new URL("./sweet-missing.mjs", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"), root]);
  const miss = readFileSync(join(root, "..", "missing.txt"), "utf8").split("\n").filter((p) => p && !dead.has(p));
  console.log(`round ${round}: ${miss.length} missing`);
  if (!miss.length) break;
  for (const p of miss) {
    const r = await fetch("https://sweet-tape.com" + encodeURI(p), { headers: { "user-agent": UA } });
    if (!r.ok) { dead.add(p); console.log("  dead", r.status, p); continue; }
    const d = join(root, p); mkdirSync(dirname(d), { recursive: true });
    writeFileSync(d, Buffer.from(await r.arrayBuffer()));
    console.log("  ok", p);
  }
}
writeFileSync(join(root, "..", "dead.txt"), [...dead].join("\n"));
