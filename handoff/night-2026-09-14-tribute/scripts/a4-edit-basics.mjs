import { open, login, PANEL, ART } from "./lib.mjs";
const ID = "prod_01M2EY6NV1RDYSW4KPAXGNWQ1A";
const { b, p, errs, bad } = await open();
await login(p);

// --- 1. title / subtitle / description ---
await p.goto(`${PANEL}/products/${ID}/edit`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForSelector("input[name=title]", { timeout: 20000 });
await p.fill("input[name=title]", "Куб №1 · Меловой белый");
await p.fill("input[name=subtitle]", "Матовый гипс, стартовый каталог");
await p.fill("textarea[name=description]", "Матовый гипсовый куб мелового-белого цвета со скруглёнными рёбрами. Метка приёмки: NIGHT-PROD-EDIT-1.");
const saveBtns = await p.$$eval("button", els => els.map(e=>(e.innerText||"").trim()).filter(Boolean));
console.log("EDIT BUTTONS:", JSON.stringify([...new Set(saveBtns)]));
await p.click('button[type=submit]:has-text("Сохранить"), button[type=submit]:has-text("Save")');
await p.waitForTimeout(3500);
await p.screenshot({ path: `${ART}/a4-1-title-saved.png`, fullPage: true });
console.log("AFTER SAVE URL:", p.url());
console.log("TITLE ON PAGE:", (await p.innerText("body")).includes("Куб №1"));

// --- 2. attributes ---
await p.goto(`${PANEL}/products/${ID}/attributes`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForSelector("input[name=weight]", { timeout: 20000 });
await p.fill("input[name=weight]", "512");
await p.fill("input[name=height]", "12");
await p.fill("input[name=width]", "12");
await p.fill("input[name=length]", "12");
await p.click('button[type=submit]:has-text("Сохранить"), button[type=submit]:has-text("Save")');
await p.waitForTimeout(3000);
await p.screenshot({ path: `${ART}/a4-2-attributes-saved.png`, fullPage: true });
const bodyAttr = (await p.innerText("body")).replace(/\n+/g," | ");
console.log("ATTR page shows 512:", bodyAttr.includes("512"));

// --- 3. price grid: is there RUB? ---
await p.goto(`${PANEL}/products/${ID}/prices`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(2500);
const names = await p.$$eval("input", els => els.map(e=>e.getAttribute("name")||"").filter(n=>n.includes("prices")));
console.log("PRICE FIELDS sample:", JSON.stringify(names.slice(0,4)), "count:", names.length);
console.log("HAS RUB FIELD:", names.some(n=>n.endsWith(".rub")));
const heads = await p.$$eval("th,[role=columnheader]", els => els.map(e=>(e.innerText||"").trim()).filter(Boolean));
console.log("PRICE COLUMNS:", JSON.stringify(heads.slice(0,20)));
await p.screenshot({ path: `${ART}/a4-3-prices.png`, fullPage: true });
console.log("ERRS:", JSON.stringify(errs.slice(0,6)));
console.log("BAD:", JSON.stringify(bad.slice(0,6)));
await b.close();
