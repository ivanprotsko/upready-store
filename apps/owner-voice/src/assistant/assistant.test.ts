/**
 * The buyer assistant reaches the public catalog only, and a buyer's
 * contacts never reach the model.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../app.ts";
import { readConfig } from "../config.ts";
import type { ModelProvider, ModelRequest, ModelStep } from "../model/types.ts";
import { maskBuyerText } from "../pii.ts";
import type { FetchFn } from "../shop/api.ts";
import { fixtureFetch } from "../shop/fixtures.ts";
import { STORE_TOOLS } from "./tools.ts";

/** A shop with a login, so `/tenants/*` would be reachable if any tool asked; every request is kept. */
function recording() {
  const seen: { method: string; path: string }[] = [];
  const fixtures = fixtureFetch();
  const net: FetchFn = async (input, init) => {
    const url = new URL(String(input));
    seen.push({ method: (init?.method ?? "GET").toUpperCase(), path: url.pathname });
    return fixtures(input, init);
  };
  return { seen, net };
}
const liveShop = { SHOP_LOGIN_EMAIL: "fixture", SHOP_LOGIN_PASSWORD: "fixture", SHOP_API_URL: "https://shop.test" };

const QUESTIONS = [
  "Есть свечи от варикоза?",
  "Расскажи про тройчатку подробнее",
  "Какие разделы есть?",
  "Покажи мёд",
  "Как вернуть товар?",
  "Какие условия доставки и оплаты?",
  "Где мой заказ 1041?",
  "Контакты магазина",
];

test("every assistant question reads /store/* only, never /tenants/* or the login", async () => {
  const { seen, net } = recording();
  const app = createApp(readConfig(liveShop), { fetch: net });
  for (const q of QUESTIONS) {
    const turn = await app.assistant.text(q, []);
    assert.ok(turn.reply.length > 10, q);
  }
  assert.ok(seen.length > 0);
  for (const r of seen) {
    assert.equal(r.method, "GET", `${r.method} ${r.path}`);
    // `/storefront/by-host` is the public lookup of the shop's publishable key, as the storefront itself does.
    assert.match(r.path, /^\/store\/|^\/storefront\/by-host$/, r.path);
  }
});

test("the assistant answers from the catalog: a product, its price and stock, a page", async () => {
  const app = createApp(readConfig({ SHOP_FIXTURES: "1" }), { fetch: fixtureFetch() });
  const found = await app.assistant.text("Есть свечи от варикоза?", []);
  assert.equal(found.calls[0]?.name, "search_products");
  assert.match(found.reply, /\$, в наличии/);
  const page = await app.assistant.text("Как вернуть товар?", []);
  assert.deepEqual(page.calls, [{ name: "info_page", input: { key: "returns" } }]);
  const order = await app.assistant.text("Где мой заказ 1041?", []);
  assert.deepEqual(order.calls, [], "no tool for an order");
  assert.match(order.reply, /Контакты/);
});

test("the assistant has no tool for orders, customers or the panel", () => {
  assert.deepEqual(STORE_TOOLS.map((t) => t.name), ["search_products", "product_info", "list_categories", "category_products", "info_page"]);
  for (const t of STORE_TOOLS) assert.doesNotMatch(JSON.stringify(t.inputSchema), /email|phone|address|order|customer/i, t.name);
});

test("no email, phone, name or address reaches the model, now or from history", async () => {
  const seen: ModelRequest[] = [];
  const model: ModelProvider = {
    name: "spy",
    async next(request): Promise<ModelStep> {
      seen.push(structuredClone(request));
      return { kind: "text", text: "Хорошо." };
    },
  };
  const app = createApp(readConfig({ SHOP_FIXTURES: "1" }), { fetch: fixtureFetch(), provider: model });
  await app.assistant.text("Меня зовут Анна Петрова, почта anna.p@example.com, телефон +7 912 345-67-89, адрес ул. Ленина, д. 5, кв. 7, 620014", [
    { role: "user", text: "Я Иван Сидоров, пишите на ivan@example.org" },
    { role: "assistant", text: "Здравствуйте!" },
  ]);
  const said = JSON.stringify(seen);
  for (const leak of ["anna.p@example.com", "912 345", "Петрова", "Ленина", "620014", "ivan@example.org", "Сидоров"]) {
    assert.ok(!said.includes(leak), `${leak} reached the model`);
  }
  assert.match(said, /\[email скрыт\]/);
  assert.match(said, /\[имя скрыто\]/);
  assert.match(said, /\[адрес скрыт\]/);
  // The owner's prompt and tools are not the buyer's.
  assert.doesNotMatch(seen[0]!.system, /владел/i);
  assert.ok(seen[0]!.tools.every((t) => STORE_TOOLS.some((s) => s.name === t.name)));
});

test("maskBuyerText keeps the question and hides the contacts", () => {
  assert.equal(maskBuyerText("Есть свечи от варикоза?"), "Есть свечи от варикоза?");
  assert.doesNotMatch(maskBuyerText("моя почта a@b.ru"), /a@b\.ru/);
});
