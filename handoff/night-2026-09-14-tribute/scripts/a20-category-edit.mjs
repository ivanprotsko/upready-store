import { open, login, PANEL, SHOP, ART } from "./lib.mjs";
const CID = "pcat_01M2EY6NPV1Q52M135M94JK5AS"; // Forms
const { b, p, errs, bad } = await open({ w: 1600, h: 950 });
await login(p);
await p.goto(`${PANEL}/categories/${CID}/edit`, { waitUntil: "domcontentloaded", timeout: 90000 });
await p.waitForSelector('[role=dialog] input, [role=dialog] textarea', { timeout: 60000 });
await p.waitForTimeout(1500);
const fields = await p.$$eval('[role=dialog] input, [role=dialog] textarea, [role=dialog] select', els => els.map(e=>`${e.tagName}:${e.getAttribute("name")||e.type}`));
console.log("EDIT FIELDS:", JSON.stringify(fields));
const dlgTxt = (await p.innerText('[role=dialog]')).replace(/\n+/g," | ");
console.log("DIALOG TEXT:", dlgTxt.slice(0, 400));
await p.screenshot({ path: `${ART}/a20-1-cat-edit-form.png` });
if (fields.some(f=>f.includes("name"))) {
  await p.fill('[role=dialog] input[name=name]', "Формы (ночная приёмка)");
  const hasDesc = await p.$('[role=dialog] textarea[name=description]');
  if (hasDesc) await p.fill('[role=dialog] textarea[name=description]', "Категория отредактирована ночью. Метка: NIGHT-CAT-EDIT.");
  const fi = await p.$('[role=dialog] input[type=file]');
  console.log("has file input:", !!fi);
  if (fi) await fi.setInputFiles("/tmp/night-upload-fixed.webp");
  await p.waitForTimeout(2000);
  await p.click('[role=dialog] button:has-text("Сохранить")');
  await p.waitForTimeout(6000);
  console.log("URL after save:", p.url());
  await p.screenshot({ path: `${ART}/a20-2-cat-saved.png`, fullPage: true });
}
console.log("ERRS:", JSON.stringify(errs.slice(0,3)), "BAD:", JSON.stringify(bad.slice(0,3)));
await b.close();
const { b: b2, p: p2, bad: bad2 } = await open();
await p2.goto(`${SHOP}/ru/categories/forms-accept-commerce-1106`, { waitUntil: "networkidle", timeout: 60000 });
await p2.waitForTimeout(2000);
const t2 = (await p2.innerText("body")).replace(/\n+/g," | ");
console.log("STOREFRONT CATEGORY:", t2.slice(0, 300));
console.log("has new name:", t2.includes("Формы (ночная приёмка)"), "| has marker:", t2.includes("NIGHT-CAT-EDIT"));
console.log("BAD:", JSON.stringify(bad2.slice(0,4)));
await p2.screenshot({ path: `${ART}/a20-3-storefront-category.png`, fullPage: true });
await b2.close();
