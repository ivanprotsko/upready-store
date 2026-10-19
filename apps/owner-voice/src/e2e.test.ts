/**
 * End to end on fixtures: no ElevenLabs key, no model key, no shop login and
 * no network. The shop answers from fixtures/shop (Store API recorded from
 * cherkashino.com; the tenants-* files are shaped, not recorded), speech from
 * fixtures/voice, and the model is the keyword router.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { authorized, handler, passwordReasons } from "./server.ts";

const offline: typeof fetch = async (url) => {
  throw new Error(`no network in this test: ${String(url)}`);
};
const app = () => createApp(readConfig({ SHOP_FIXTURES: "1" }), { fetch: offline });
const wav = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/voice/${name}`, import.meta.url)));

test("fixture mode is what the status says, with no key anywhere", () => {
  assert.deepEqual(app().status(), {
    shop: "cherkashino.com",
    storeApi: "fixture",
    ownerApi: "fixture",
    voice: "fixture",
    model: "rules (no model key, keyword router)",
    provider: "rules (keyword router, no model)",
  });
});

test("an audio file in, the answer text and audio out (fixtures)", async () => {
  const turn = await app().voice({ data: wav("question-sales-week.wav"), contentType: "audio/wav" }, []);

  assert.equal(turn.transcript, "Сколько мы продали за неделю?");
  assert.deepEqual(turn.calls, [{ name: "sales_summary", input: { period: "7d" } }]);
  assert.match(turn.reply, /^Продажи за 7 дней:\nВыручка: 1 284 \$ \(\+16% к прошлому периоду\)/);
  assert.equal(turn.audio?.contentType, "audio/wav");
  assert.equal(Buffer.from(turn.audio!.data.subarray(0, 4)).toString(), "RIFF");
  assert.ok(turn.audio!.data.length > 1000);
});

test("stock by voice reads the fixture inventory (fixtures)", async () => {
  const turn = await app().voice({ data: wav("question-stock.wav"), contentType: "audio/wav" }, []);
  assert.equal(turn.transcript, "Сколько осталось каштана на складе?");
  assert.match(turn.reply, /Мазь Каштан от варикоза, 100 мл: на складе 22, в резерве 4, можно продать 18/);
});

test("a price question reads the recorded cherkashino.com catalog (fixtures)", async () => {
  const turn = await app().text("Сколько стоит тройчатка?", []);
  assert.match(turn.reply, /Тройчатка плюс — 15 \$/);
  assert.equal(turn.cards[0]?.link?.href, "https://panel.cherkashino.com/products/prod_01M2GRC9BG5GJG7CV5X0WKMNNC");
});

test("an unknown recording on fixtures is a clear error, not a guess", async () => {
  await assert.rejects(app().voice({ data: new Uint8Array([1, 2, 3]), contentType: "audio/webm" }, []), /ELEVENLABS_API_KEY/);
});

test("the HTTP stand: password, page, status and a voice turn", async () => {
  const server = createServer(handler(app(), "stand-pass"));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const auth = { authorization: `Basic ${Buffer.from("ivan:stand-pass").toString("base64")}` };
  try {
    assert.equal((await fetch(`${base}/`)).status, 401);
    const page = await fetch(`${base}/`, { headers: auth });
    assert.match(await page.text(), /Голосовой чат владельца/);
    assert.equal(((await (await fetch(`${base}/api/status`, { headers: auth })).json()) as { voice: string }).voice, "fixture");

    const res = await fetch(`${base}/api/voice`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        audio: Buffer.from(wav("question-sales-week.wav")).toString("base64"),
        contentType: "audio/wav",
        history: [{ role: "user", text: "привет" }, { role: "system", text: "ignored" }],
      }),
    });
    const body = (await res.json()) as { transcript: string; reply: string; audio: string; audioType: string };
    assert.equal(res.status, 200);
    assert.equal(body.transcript, "Сколько мы продали за неделю?");
    assert.match(body.reply, /Выручка: 1 284 \$/);
    assert.equal(body.audioType, "audio/wav");
    assert.ok(Buffer.from(body.audio, "base64").length > 1000);

    const empty = await fetch(`${base}/api/text`, { method: "POST", headers: auth, body: "{}" });
    assert.equal(empty.status, 400);
  } finally {
    server.close();
  }
});

test("Basic auth compares the password only", () => {
  const header = (s: string) => `Basic ${Buffer.from(s).toString("base64")}`;
  assert.equal(authorized(undefined, null), true);
  assert.equal(authorized(header("any:pw:with:colons"), "pw:with:colons"), true);
  assert.equal(authorized(header("any:wrong"), "pw"), false);
  assert.equal(authorized("Bearer x", "pw"), false);
});

test("the stand needs STAND_PASSWORD once the shop login or any paid key is set", () => {
  assert.deepEqual(passwordReasons(readConfig({})), [], "fixtures only: no password needed");
  assert.deepEqual(passwordReasons(readConfig({ SHOP_LOGIN_EMAIL: "o@shop.test", SHOP_LOGIN_PASSWORD: "pw" })), [
    "SHOP_LOGIN_EMAIL/SHOP_LOGIN_PASSWORD (the shop's sales)",
  ]);
  assert.deepEqual(passwordReasons(readConfig({ ELEVENLABS_API_KEY: "k" })), ["ELEVENLABS_API_KEY (paid speech)"]);
  assert.deepEqual(passwordReasons(readConfig({ ANTHROPIC_API_KEY: "k" })), ["ANTHROPIC_API_KEY (paid model calls)"]);
  assert.equal(passwordReasons(readConfig({ SHOP_LOGIN_EMAIL: "o@shop.test" })).length, 0, "half a login is no login");
});

test("the server refuses to start with a paid key and no STAND_PASSWORD", () => {
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, [fileURLToPath(new URL("./server.ts", import.meta.url))], {
      env: { PATH: process.env.PATH ?? "", PORT: "0", ...env },
      encoding: "utf8",
      timeout: 10_000,
    });
  const refused = run({ ELEVENLABS_API_KEY: "test-key-not-real" });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /STAND_PASSWORD is required when any of these is set: ELEVENLABS_API_KEY/);
  const refusedModel = run({ ANTHROPIC_API_KEY: "test-key-not-real" });
  assert.equal(refusedModel.status, 1);
  assert.match(refusedModel.stderr, /ANTHROPIC_API_KEY/);
});
