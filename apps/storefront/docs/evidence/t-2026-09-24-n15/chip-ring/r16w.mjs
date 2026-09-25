// Remark 16: real Firefox GUI (frontmost) — reload, then swipe the carousel both ways with small wheel ticks
// (trackpad-like) or smooth scrollBy; after each swipe sample the ring pixel of every dark chip in the window capture.
import { execFileSync } from "child_process";
import { createRequire } from "module";
import fs from "fs";
const require = createRequire(import.meta.url);
const sharp = require("/Users/ivanprotsko/upready/worktrees/upready-store/redesign-olavka/apps/backend/node_modules/sharp");
const [url, winId, width, out, how = "wheel", swipes = "RRRLLLLLLRRR"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const ws = new WebSocket("ws://127.0.0.1:9339/session");
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
await send("session.new", { capabilities: {} });
const ctx = (await send("browsingContext.getTree", {})).result.contexts[0].context;
const ev = async (expr) => (await send("script.evaluate", { expression: expr, target: { context: ctx }, awaitPromise: true, resultOwnership: "none" })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!String(width).startsWith("win")) await send("browsingContext.setViewport", { context: ctx, viewport: { width: +width, height: 1000 } });
await send("browsingContext.navigate", { context: ctx, url, wait: "complete" });
await sleep(2500);
const bad = [];
const sample = async (tag) => {
  const info = JSON.parse(await ev(`JSON.stringify({sl:Math.round(document.querySelector('[data-testid="olavka-hero-slider"] ul').scrollLeft),off:[mozInnerScreenX-screenX,mozInnerScreenY-screenY],dpr:devicePixelRatio,z:parseFloat(getComputedStyle(document.documentElement).zoom)||1,chips:[...document.querySelectorAll('[data-testid="olavka-hero-slider"] li')].flatMap((li,i)=>[...li.querySelectorAll('[data-testid="olavka-hero-slide-label"],[data-testid="olavka-hero-slide-title"]')].map(c=>{const r=c.getBoundingClientRect();return {i,t:c.textContent.trim().replace(/\\s+/g,' ').slice(0,10),x:r.left,r:r.right,y:r.top+r.height/2}})).filter(c=>c.x>2&&c.r<innerWidth-2)})`));
  const p = `${out}/${tag}.png`;
  execFileSync("screencapture", ["-x", "-o", `-l${winId}`, p]);
  const { data, info: im } = await sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (cx, cy) => { const X = Math.round(cx * info.dpr), Y = Math.round(cy * info.dpr); if (X < 0 || Y < 0 || X >= im.width || Y >= im.height) return "out"; const q = (Y * im.width + X) * 3; return [data[q], data[q + 1], data[q + 2]]; };
  const rows = info.chips.map((c) => { const L = px(info.off[0] + c.x + 2 * info.z, info.off[1] + c.y); const R = px(info.off[0] + c.r - 2 * info.z, info.off[1] + c.y); /* getBoundingClientRect is already in zoomed px */ const hex = (v) => v === "out" ? "out" : v.map((n) => n.toString(16).padStart(2, "0")).join(""); const light = [L, R].some((v) => v !== "out" && v[0] + v[1] + v[2] > 300); if (light) bad.push(`${tag}:${c.i}:${c.t}`); return `${c.i}:${c.t}@${Math.round(c.x)} L=${hex(L)} R=${hex(R)}${light ? " WHITE" : ""}`; });
  return `sl=${info.sl} ` + rows.join(" | ");
};
console.log("rest", await sample("00-rest"));
const iw = await ev("innerWidth"); const cx = Math.round(iw / 2), cy = 380;
for (const [n, d] of [...swipes].entries()) {
  const dir = d === "R" ? 1 : -1;
  if (how === "wheel") {
    const actions = [];
    for (let k = 0; k < 8; k++) actions.push({ type: "scroll", x: cx, y: cy, deltaX: dir * 90, deltaY: 0, duration: 16 });
    const r = await send("input.performActions", { context: ctx, actions: [{ type: "wheel", id: "wheel", actions }] });
    if (r.error) console.log("wheel err", r.message);
  } else {
    await ev(`document.querySelector('[data-testid="olavka-hero-slider"] ul').scrollBy({left:${dir * 708},behavior:"smooth"})`);
  }
  await sleep(1600);
  console.log(`${String(n + 1).padStart(2, "0")} ${d}`, await sample(`${String(n + 1).padStart(2, "0")}-${d}`));
}
console.log("WHITE:", bad.length ? bad.join(", ") : "none");
await send("session.end", {}); ws.close();
