/**
 * Screenshots of the marketplace order desk (w15-mp-orders-desk).
 * Lives outside apps/backend on purpose: `medusa develop` watches that tree.
 */
/*
 * CJS package loaded as CJS (rule 19f): importing its entry BY PATH walks past
 * the ESM wrapper the package ships and hands back a namespace with no
 * `chromium` on it. Measured here, not remembered.
 */
import { createRequire } from "node:module";
const require_ = createRequire("/Users/ivanprotsko/upready/projects/upready-store/package.json");
const { chromium } = require_("playwright");
if (typeof chromium?.launch !== "function") {
  throw new Error("playwright: chromium.launch missing after require");
}

const PANEL = "http://localhost:5195";
const OUT = process.argv[2];
const EMAIL = "owner-cherkashino@example.test";
const PASSWORD = "w13-acceptance-scratch";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 200)}`);
});

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`shot ${name}`);
};

await page.goto(`${PANEL}/login`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('input[name="email"]', { timeout: 30000 });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 30000 });
console.log("logged in as", EMAIL, "->", page.url());

/* 1. Лента с умолчанием */
await page.goto(`${PANEL}/marketplace-orders`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="feed-row"]', { timeout: 30000 });
console.log("period line:", (await page.textContent('[data-testid="period-line"]')).trim());
console.log("count line:", (await page.textContent('[data-testid="count-line"]')).trim());
console.log("rows on screen:", await page.locator('[data-testid="feed-row"]').count());
await shot("01-feed-default");

/* 2. Фильтры применены */
await page.goto(`${PANEL}/marketplace-orders?source=wb&scheme=FBS&status=delivered`, {
  waitUntil: "domcontentloaded",
});
await page.waitForSelector('[data-testid="feed-row"]', { timeout: 30000 });
console.log("filtered count line:", (await page.textContent('[data-testid="count-line"]')).trim());
await shot("02-feed-filtered");

/* 3. Пустой период */
await page.goto(`${PANEL}/marketplace-orders?from=2020-01-01&to=2020-01-31`, {
  waitUntil: "domcontentloaded",
});
await page.waitForSelector('[data-testid="empty-state"]', { timeout: 30000 });
console.log("empty state:", (await page.textContent('[data-testid="empty-state"]')).trim());
await shot("03-feed-empty-period");

/* 4. Карточка заказа + доказательство «ни одной кнопки действия» */
const id = process.argv[3];
await page.goto(`${PANEL}/marketplace-orders/${id}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="order-line"]', { timeout: 30000 });
console.log("order:", (await page.textContent('[data-testid="order-number"]')).trim());
console.log("lines:", await page.locator('[data-testid="order-line"]').count());
console.log("history rows:", await page.locator('[data-testid="history-row"]').count());

const buttons = await page.locator("main button, main a[role=button]").allTextContents();
console.log("buttons in the card:", JSON.stringify(buttons));
console.log("forms in the card:", await page.locator("main form").count());
await shot("04-order-card");

/* 5. Карточка заказа с несвязанной строкой */
const unlinked = process.argv[4];
if (unlinked) {
  await page.goto(`${PANEL}/marketplace-orders/${unlinked}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="order-line"]', { timeout: 30000 });
  console.log(
    "unlinked cell:",
    (await page.locator('[data-testid="line-unlinked"]').first().textContent()) ?? "(none)"
  );
  await shot("05-order-card-unlinked");
}

console.log(problems.length ? `CONSOLE ERRORS: ${problems.join(" | ")}` : "console errors: 0");
await browser.close();
