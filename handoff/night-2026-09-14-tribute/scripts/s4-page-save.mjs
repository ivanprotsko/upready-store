import { open, login, shot, PANEL } from "./lib.mjs";
const { b, p, errs, bad } = await open();
await login(p);
await p.goto(PANEL + "/pages/contacts", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(2500);
await p.fill('input[name=title]', "Доставка и оплата");
await p.fill('textarea[name=body]', "Доставляем по России за 2-5 дней.\n\nОплата картой при получении.\n\nМетка приёмки: NIGHT-1106-V1");
// published switch
const sw = await p.$('[role=switch]');
if (sw) { const st = await sw.getAttribute("aria-checked"); console.log("switch before:", st); if (st !== "true") await sw.click(); console.log("switch after:", await sw.getAttribute("aria-checked")); }
else { console.log("NO role=switch; checkbox:", await p.$eval('input[name=published]', e=>e.checked).catch(e=>"err:"+e)); await p.check('input[name=published]').catch(()=>{}); }
await shot(p, "10-page-filled");
await p.click('button[type=submit]:has-text("Save")');
await p.waitForTimeout(3000);
await shot(p, "11-page-saved");
console.log("URL:", p.url());
console.log("BODY:", (await p.innerText("body")).slice(400, 1400));
console.log("ERRS:", JSON.stringify(errs)); console.log("BAD:", JSON.stringify(bad));
// back to list
await p.goto(PANEL + "/pages", { waitUntil: "networkidle" }); await p.waitForTimeout(2000);
const rows = await p.$$eval("tr", els => els.map(e=>(e.innerText||"").replace(/\s+/g," ").trim()).filter(Boolean));
console.log("LIST ROWS:", JSON.stringify(rows,null,1));
await shot(p, "12-pages-after-save");
await b.close();
