// render three dark test images (hero 2400x1350, tile 1024x1024, product 1024x1024): charcoal ground, matte grey shapes
import { chromium } from "playwright";
const b = await chromium.launch();
const mk = async (w, h, body, file) => {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;background:radial-gradient(circle at 40% 40%,#2b2724 0%,#14110d 70%);overflow:hidden">${body}</body></html>`);
  await p.screenshot({ path: file, type: "png" });
  await p.close();
};
const circle = (x, y, r, c) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${r}px;height:${r}px;border-radius:50%;background:radial-gradient(circle at 35% 30%,${c} 0%,#3a3632 75%);box-shadow:0 30px 60px rgba(0,0,0,.6)"></div>`;
const box = (x, y, s, c) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;background:linear-gradient(135deg,${c},#2a2724);box-shadow:0 30px 60px rgba(0,0,0,.6)"></div>`;
await mk(2400, 1350, circle(1300, 380, 520, "#8a8580") + box(900, 620, 360, "#6b6661") + circle(1850, 700, 300, "#5a5550"), process.argv[2] + "/dark-hero.png");
await mk(1024, 1024, circle(180, 260, 420, "#8a8580") + circle(560, 420, 300, "#5a5550"), process.argv[2] + "/dark-tile.png");
await mk(1024, 1024, box(330, 330, 380, "#7a7570"), process.argv[2] + "/dark-product.png");
await b.close();
console.log("ok");
