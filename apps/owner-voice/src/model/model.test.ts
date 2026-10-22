import { test } from "node:test";
import assert from "node:assert/strict";

import type { FetchFn } from "../shop/api.ts";
import { toolSpecs } from "../tools.ts";
import { AnthropicProvider, toAnthropicMessages } from "./anthropic.ts";
import { FallbackProvider, safeReason } from "./fallback.ts";
import { productPhrase, RulesProvider } from "./rules.ts";
import type { ChatMessage } from "./types.ts";

test("the neutral conversation maps onto Anthropic blocks", () => {
  const messages: ChatMessage[] = [
    { role: "user", text: "продажи?" },
    { role: "assistant", text: "", toolCalls: [{ id: "tu_1", name: "sales_summary", input: { period: "7d" } }] },
    { role: "tool", results: [{ id: "tu_1", name: "sales_summary", content: "Выручка 10 $" }] },
  ];
  assert.deepEqual(toAnthropicMessages(messages), [
    { role: "user", content: "продажи?" },
    { role: "assistant", content: [{ type: "tool_use", id: "tu_1", name: "sales_summary", input: { period: "7d" } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: "Выручка 10 $" }] },
  ]);
});

test("AnthropicProvider sends the tools and reads tool_use back (mocked fetch)", async () => {
  let sent: Record<string, unknown> = {};
  let headers: Record<string, string> = {};
  const fn: FetchFn = async (_url, init) => {
    sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    headers = init?.headers as Record<string, string>;
    return new Response(
      JSON.stringify({
        content: [
          { type: "text", text: "Смотрю." },
          { type: "tool_use", id: "tu_9", name: "recent_orders", input: { limit: 3 } },
        ],
      }),
    );
  };
  const provider = new AnthropicProvider("test-key-not-real", "claude-sonnet-5-5", fn);
  const step = await provider.next({ system: "sys", messages: [{ role: "user", text: "заказы" }], tools: toolSpecs() });

  assert.deepEqual(step, { kind: "tools", text: "Смотрю.", calls: [{ id: "tu_9", name: "recent_orders", input: { limit: 3 } }] });
  assert.equal(sent.model, "claude-sonnet-5-5");
  assert.equal(sent.system, "sys");
  assert.equal((sent.tools as unknown[]).length, 6);
  assert.equal(headers["x-api-key"], "test-key-not-real");
  assert.equal(provider.name, "anthropic claude-sonnet-5-5");
});

test("the rules provider picks a tool from the words, then reads its answer back", async () => {
  const rules = new RulesProvider();
  const ask = async (text: string) => rules.next({ system: "", tools: [], messages: [{ role: "user", text }] });

  assert.deepEqual(await ask("Сколько мы продали за неделю?"), {
    kind: "tools",
    text: "",
    calls: [{ id: "rules-sales_summary", name: "sales_summary", input: { period: "7d" } }],
  });
  const calls = async (text: string) => {
    const step = await ask(text);
    return step.kind === "tools" ? step.calls[0] : null;
  };
  assert.deepEqual((await calls("выручка сегодня"))?.input, { period: "today" });
  assert.deepEqual((await calls("какие заказы за месяц"))?.input, { days: 30 });
  assert.deepEqual(await calls("сколько осталось каштана на складе"), { id: "rules-product_stock", name: "product_stock", input: { query: "каштана" } });
  assert.deepEqual((await calls("покажи плохие отзывы"))?.input, { max_rating: 3 });
  assert.equal((await calls("открой карточку тройчатка"))?.name, "open_product");
  assert.equal((await calls("сколько стоит мумиё"))?.name, "find_products");
  assert.deepEqual((await calls("Сколько стоит мумие?"))?.input, { query: "мумие" }, "speech to text writes е for ё");
  assert.deepEqual((await calls("почём мумиё"))?.input, { query: "мумие" });
  assert.equal((await ask("привет")).kind, "text");
  assert.deepEqual(await ask("удали все заказы"), {
    kind: "text",
    text: "Я только читаю данные магазина и ничего в нём не меняю. Это можно сделать в панели.",
  });

  const done = await rules.next({
    system: "",
    tools: [],
    messages: [{ role: "tool", results: [{ id: "x", name: "sales_summary", content: "Выручка 10 $" }] }],
  });
  assert.deepEqual(done, { kind: "text", text: "Выручка 10 $" });
});

test("productPhrase keeps only the words that name the product", () => {
  assert.equal(productPhrase("Сколько осталось мази каштан на складе?"), "мази каштан");
  assert.equal(productPhrase("сколько у нас на складе"), null);
});

const creditTooLow: FetchFn = async () =>
  new Response(
    JSON.stringify({
      type: "error",
      error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." },
    }),
    { status: 400 },
  );

test("a failing model hands the same turn to the keyword router and says why", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const key = "sk-ant-test-key-not-real-0123456789";
  const provider = new FallbackProvider(new AnthropicProvider(key, "claude-sonnet-5-5", creditTooLow), new RulesProvider(), [key]);
  const step = await provider.next({ system: "", tools: [], messages: [{ role: "user", text: "Сколько стоит мумие?" }] });

  assert.deepEqual(step, { kind: "tools", text: "", calls: [{ id: "rules-find_products", name: "find_products", input: { query: "мумие" } }] });
  assert.match(provider.last?.reason ?? "", /^Anthropic answered 400: .*credit balance is too low/);
  assert.match(String(logged.mock.calls[0]?.arguments[0]), /keyword router answers this turn: Anthropic answered 400/);
  assert.equal(provider.name, "anthropic claude-sonnet-5-5");
});

test("safeReason masks keys and key-shaped strings", () => {
  assert.equal(safeReason("bad key abc123secret", ["abc123secret"]), "bad key ***");
  assert.equal(safeReason("invalid x-api-key sk-ant-api03-AbCdEf0123456789"), "invalid x-api-key ***");
});
