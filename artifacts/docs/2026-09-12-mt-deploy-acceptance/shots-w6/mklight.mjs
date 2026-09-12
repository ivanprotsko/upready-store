// light twins: pale studio ground, same shapes as the dark set
import { chromium } from "playwright";
const b = await chromium.launch();
const mk = async (w, h, body, file) => {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;background:radial-gradient(circle at 40% 40%,#f2efe9 0%,#d9d5cf 70%);overflow:hidden">${body}</body></html>`);
  await p.screenshot({ path: file, type: "png" });
  await p.close();
};
const circle = (x, y, r, c) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${r}px;height:${r}px;border-radius:50%;background:radial-gradient(circle at 35% 30%,${c} 0%,#8a8580 80%);box-shadow:0 30px 60px rgba(0,0,0,.25)"></div>`;
const box = (x, y, s, c) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;background:linear-gradient(135deg,${c},#9a958f);box-shadow:0 30px 60px rgba(0,0,0,.25)"></div>`;
await mk(2400, 1350, circle(1300, 380, 520, "#ffffff") + box(900, 620, 360, "#e8e4de") + circle(1850, 700, 300, "#cfcac4"), process.argv[2] + "/light-hero.png");
await mk(1024, 1024, circle(180, 260, 420, "#ffffff") + circle(560, 420, 300, "#cfcac4"), process.argv[2] + "/light-tile.png");
await mk(1024, 1024, box(330, 330, 380, "#f4f1ec"), process.argv[2] + "/light-product.png");
await b.close();
console.log("ok");
