import { open, SHOP } from "./lib.mjs";
const { b, p } = await open();
for (const u of [SHOP + "/ru?cb=" + Date.now(), SHOP + "/ru/pages/contacts?cb=" + Date.now()]) {
  await p.goto(u, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(1000);
  const fl = await p.$$eval("footer a", els => els.map(e=>e.getAttribute("href"))).catch(()=>[]);
  console.log(u.split("?")[0], "->", JSON.stringify(fl));
}
await b.close();
