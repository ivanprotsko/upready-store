import { open, SHOP, ART } from "./lib.mjs";
const { b, p, errs, bad } = await open({ w: 1440, h: 1100 });
const dump = async (tag) => {
  const t = (await p.innerText("body")).replace(/\n+/g," | ");
  console.log(`[${tag}]`, t.slice(0, 260));
};
await p.goto(`${SHOP}/ru/products/cube-1-accept-commerce-1106`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1200);
await p.click('button:has-text("Малый")').catch(()=>{});
await p.waitForTimeout(600);
await p.click('button:has-text("В корзину"), button:has-text("Добавить")');
await p.waitForTimeout(3000);
await p.goto(`${SHOP}/ru/checkout`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(6000);
let radios = [];
for (let i = 0; i < 10; i++) {
  radios = await p.$$('button[role=radio], input[type=radio]');
  if (radios.length >= 2) break;
  await p.waitForTimeout(2000);
}
console.log("shipping radios:", radios.length);
await radios[radios.length - 1].click();
await p.waitForTimeout(3000);
// address
await p.click('button:has-text("Адрес доставки")');
await p.waitForTimeout(2000);
await p.click('[role=dialog] button[role=checkbox]');
await p.waitForTimeout(1500);
for (const [n, v] of [["address_1","ул. Ленина, д. 1, кв. 2"],["postal_code","101000"],["city","Москва"],["province","Москва"]]) {
  const el = await p.$(`[role=dialog] [name="${n}"]`);
  if (el) await el.fill(v);
}
await p.click('[role=dialog] button:has-text("Сохранить")');
await p.waitForTimeout(3500);
// contacts
await p.click('button:has-text("Контакты")');
await p.waitForTimeout(2500);
const cf = await p.$$eval('[role=dialog] input', els => els.map(e=>e.getAttribute("name")||e.type));
console.log("CONTACT FIELDS:", JSON.stringify(cf));
for (const [n, v] of [["first_name","Иван"],["last_name","Тестовый"],["email","night-accept@upready.dev"],["phone","+79990000000"]]) {
  const el = await p.$(`[role=dialog] [name="${n}"]`);
  if (el) await el.fill(v);
}
await p.screenshot({ path: `${ART}/a31-1-contacts.png` });
await p.click('[role=dialog] button:has-text("Сохранить")');
await p.waitForTimeout(3500);
await dump("after-contacts");
// payment
// choose the payment method tile first — the submit button stays disabled until one is selected
const tiles = await p.$$('button, [role=radio], label');
let picked = false;
for (const el of tiles) {
  const txt = (await el.innerText().catch(()=>"")) .trim();
  if (txt.includes("Оплата вручную")) { await el.click().catch(e=>console.log("tile click err", String(e).slice(0,50))); picked = true; break; }
}
console.log("payment tile picked:", picked);
await p.waitForTimeout(3000);
await p.screenshot({ path: `${ART}/a31-2a-payment-picked.png`, fullPage: true });
// the manual provider is a DEMO CARD simulator (src/lib/demo-card.ts): a Luhn-valid
// number approves, «…0000» declines, «…9999» redirects. Use an approving one.
// the payment session is created when the tile is picked and the section
// re-mounts, so the card is typed AFTER that settles or the values are wiped
await p.waitForTimeout(6000);
for (const [tid, val] of [["demo-card-number-input","4242424242424242"],["demo-card-expiry-input","1230"],["demo-card-cvc-input","123"]]) {
  const el = await p.$(`[data-testid="${tid}"]`);
  if (!el) { console.log(`${tid}: MISSING`); continue; }
  await el.click();
  await el.type(val, { delay: 40 });
  await p.keyboard.press("Tab");
  await p.waitForTimeout(600);
  console.log(`${tid} value now:`, await el.inputValue());
}
await p.waitForTimeout(2500);
// what does the CART actually hold? the button's readiness is computed from it
const cookies = await p.context().cookies();
const cartCookie = cookies.find(c => c.name.includes("cart"));
console.log("CART COOKIE:", cartCookie ? `${cartCookie.name}=${cartCookie.value.slice(0,30)}` : "none");
if (cartCookie) {
  const info = await p.evaluate(async (cid) => {
    const r = await fetch(`/api/cart-probe?id=${cid}`).catch(() => null);
    return r ? r.status : "no-probe-route";
  }, cartCookie.value);
  console.log("probe:", info);
}
const payBtn = await p.$('button:has-text("Оплатить"), button:has-text("Выберите способ оплаты")');
console.log("pay button:", payBtn ? (await payBtn.innerText()).trim() : null);
await p.screenshot({ path: `${ART}/a31-2-before-pay.png`, fullPage: true });
if (payBtn) {
  for (let i = 0; i < 12; i++) {
    const st = await payBtn.evaluate(e => ({ dis: e.disabled, txt: (e.innerText||"").replace(/\n+/g," ").trim().slice(0,40) }));
    console.log(`pay state t=${i*3}s`, JSON.stringify(st));
    if (!st.dis) break;
    await p.waitForTimeout(3000);
  }
  await payBtn.click({ timeout: 20000 }).catch(e => console.log("pay click failed:", String(e).slice(0,80)));
  await p.waitForTimeout(9000);
  console.log("URL after pay:", p.url());
  await dump("after-pay");
  await p.screenshot({ path: `${ART}/a31-3-after-pay.png`, fullPage: true });
}
console.log("ERRS:", JSON.stringify(errs.slice(0,4)), "BAD:", JSON.stringify(bad.slice(0,4)));
await b.close();
