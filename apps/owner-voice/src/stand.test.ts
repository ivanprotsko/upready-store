/**
 * Stage 2 through HTTP, as both pages use the stand: the owner page (chat,
 * palette, confirm, voice settings) and the buyer assistant. The shop and
 * ElevenLabs sit behind one stub that keeps every request, so the test can
 * say what left the process: GETs, the shop login, and paid speech, nothing
 * that writes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Script } from "node:vm";

import { createApp } from "./app.ts";
import { COMMANDS } from "./commands/index.ts";
import { readConfig } from "./config.ts";
import { handler } from "./server.ts";
import type { FetchFn } from "./shop/api.ts";
import { fixtureFetch } from "./shop/fixtures.ts";
import { catalogFixtureFetch } from "./voices.ts";

const KEY = "test-key-not-real";
const PASSWORD = "test-password-not-real";

function stand() {
  const seen: { method: string; url: URL }[] = [];
  const shop = fixtureFetch();
  const catalog = catalogFixtureFetch();
  const net: FetchFn = async (input, init) => {
    const url = new URL(String(input));
    seen.push({ method: (init?.method ?? "GET").toUpperCase(), url });
    if (url.hostname !== "api.elevenlabs.io") return shop(input, init);
    if (url.pathname.startsWith("/v1/text-to-speech/")) return new Response(new Uint8Array([0x49, 0x44, 0x33, 1]), { headers: { "content-type": "audio/mpeg" } });
    return catalog(input, init);
  };
  // The live shape: a shop login and a voice key, so every path is the one a real stand takes.
  const config = readConfig({
    SHOP_API_URL: "https://shop.test",
    SHOP_LOGIN_EMAIL: "owner@shop.test",
    SHOP_LOGIN_PASSWORD: PASSWORD,
    ELEVENLABS_API_KEY: KEY,
    MODEL_PROVIDER: "rules",
  });
  const server = createServer(handler(createApp(config, { fetch: net }), null));
  return { seen, server };
}

async function listen(server: ReturnType<typeof createServer>): Promise<string> {
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** What may leave the stand that is not a GET: the shop login (writes nothing) and ElevenLabs speech (reads text, writes nothing). */
const allowed = (r: { method: string; url: URL }) =>
  r.url.pathname === "/auth/tenant/emailpass" || (r.url.hostname === "api.elevenlabs.io" && /^\/v1\/(text-to-speech\/|speech-to-text$)/.test(r.url.pathname));

test("both pages: every action of stage 2 and not one non-GET leaves, login and speech excepted", async (t) => {
  const { seen, server } = stand();
  const base = await listen(server);
  t.after(() => server.close());
  const get = async (path: string) => {
    const res = await fetch(base + path);
    return { status: res.status, body: await res.text() };
  };
  const post = async (path: string, body: unknown) => {
    const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  // Owner page.
  assert.equal((await get("/")).status, 200);
  const list = JSON.parse((await get("/api/commands")).body) as { commands: unknown[]; panelUrl: string };
  assert.equal(list.commands.length, 121);
  assert.equal(list.panelUrl, "https://panel.cherkashino.com");
  for (const phrase of ["список акций", "покажи возвраты", "открой заказ 1041", "сколько продали за неделю", "сними с публикации тройчатку", "создай акцию", "удали заказ 1041"]) {
    assert.equal((await post("/api/text", { question: phrase })).status, 200, phrase);
  }
  for (const c of COMMANDS) {
    const params = c.section === "promotions" ? { id: "promo_fixture_1" } : undefined;
    const ran = await post("/api/commands/run", { id: c.id, params, product: "тройчатка", order: "1041" });
    assert.equal(ran.status, 200, c.id);
  }
  const picked = JSON.parse((await get("/api/commands/pick?id=orders.get")).body) as { rows: { id: string }[] };
  assert.ok(picked.rows.length > 0);

  const proposed = await post("/api/commands/run", { id: "products.update", product: "тройчатка", body: { status: "draft" } });
  const card = (proposed.body.cards as { kind: string; proposalId: string; request: { method: string; url: string; body: unknown } }[])[0]!;
  assert.equal(card.kind, "proposal");
  const confirmed = await post("/api/commands/confirm", { proposalId: card.proposalId });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.sent, false);
  assert.deepEqual(confirmed.body.request, card.request, "the dry-run shows the exact request");
  assert.equal((await post("/api/commands/confirm", { proposalId: card.proposalId })).status, 410, "once only");

  // Voice settings.
  const voices = await get("/api/voices?language=ru");
  assert.equal(voices.status, 200);
  assert.ok(!voices.body.includes(KEY), "the browser never sees the key");
  assert.equal((await post("/api/voices/add", { voiceId: "fixLibFemaleRu001" })).status, 403);
  assert.equal((await post("/api/text", { question: "список акций", voiceId: "fixAcctMaleRu0001" })).status, 200);
  assert.equal((await post("/api/text", { question: "список акций", voiceId: "fixLibFemaleRu001" })).status, 409);
  assert.equal((await post("/api/text", { question: "список акций", voiceId: "unknownVoice0001" })).status, 400);

  // Buyer assistant.
  assert.equal((await get("/assistant")).status, 200);
  for (const q of ["Есть свечи от варикоза?", "Какие разделы есть?", "Как вернуть товар?", "Где мой заказ?"]) {
    assert.equal((await post("/api/assistant/text", { question: q })).status, 200, q);
  }

  const outside = seen.filter((r) => r.method !== "GET" && !allowed(r)).map((r) => `${r.method} ${r.url.href}`);
  assert.deepEqual(outside, []);
  assert.ok(!seen.some((r) => r.url.pathname.startsWith("/v1/voices/add")), "no voice was added to the account");
  assert.ok(seen.some((r) => r.url.pathname.startsWith("/tenants/")), "the owner side did read the panel API");
});

test("the assistant endpoints never reach /tenants/*", async (t) => {
  const { seen, server } = stand();
  const base = await listen(server);
  t.after(() => server.close());
  for (const q of ["Есть свечи от варикоза?", "Расскажи про тройчатку", "Покажи мёд", "Контакты", "Мой заказ 1041 где?"]) {
    await fetch(`${base}/api/assistant/text`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) });
  }
  const shop = seen.filter((r) => r.url.hostname === "shop.test");
  assert.ok(shop.length > 0);
  for (const r of shop) assert.match(r.url.pathname, /^\/store\/|^\/storefront\/by-host$/, r.url.pathname);
});

test("the pages hold no key and their scripts parse", () => {
  for (const page of ["page.html", "assistant.html"]) {
    const html = readFileSync(new URL(`./${page}`, import.meta.url), "utf8");
    assert.doesNotMatch(html, /xi-api-key|sk-ant-|sk_[a-z0-9]{20}/i, page);
    for (const [, js] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Script(js!), page);
  }
});
