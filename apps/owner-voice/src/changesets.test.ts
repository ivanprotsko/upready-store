/**
 * Stage 3, the one write path: a confirmed proposal becomes a changeset on
 * stage, «публикуй» puts it on the main site, «откати» takes it back. The
 * backend is the in-memory one of `changesets-fixture.ts`, shaped on line A's
 * API; the tests read its live state to say what the site would show.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { handler } from "./server.ts";
import type { FetchFn } from "./shop/api.ts";
import { CHANGESET_PATH, ChangesetClient } from "./shop/changesets.ts";
import { FixtureChangesetBackend } from "./shop/changesets-fixture.ts";
import { fixtureFetch } from "./shop/fixtures.ts";
import type { Card } from "./tools.ts";

const TROY = "/tenants/products/prod_01M2GRC9BG5GJG7CV5X0WKMNNC";
const offline: FetchFn = async (url) => {
  throw new Error(`no network in this test: ${String(url)}`);
};
const dataDir = () => mkdtempSync(join(tmpdir(), "owner-voice-"));

function fixtureApp(env: Record<string, string> = {}) {
  const backend = new FixtureChangesetBackend({ stageUrl: "https://stage.cherkashino.com", mainUrl: "https://cherkashino.com" });
  const app = createApp(readConfig({ SHOP_FIXTURES: "1", CHANGESETS: "1", DATA_DIR: dataDir(), ...env }), {
    fetch: offline,
    changesetFetch: backend.fetch(),
  });
  return { app, backend };
}

const proposalOf = (cards: Card[]) => {
  const card = cards.find((c) => c.kind === "proposal");
  assert.ok(card?.proposalId, "a proposal card");
  return card.proposalId;
};

test("the client sends nothing but /tenants/agent-changesets*, and a bad id never leaves", async () => {
  const seen: { method: string; path: string }[] = [];
  const backend = new FixtureChangesetBackend({ stageUrl: "https://stage.shop.test", mainUrl: "https://shop.test" });
  const inner = backend.fetch();
  const client = new ChangesetClient({
    apiUrl: "https://api.shop.test",
    bearer: async () => "token",
    fetch: async (input, init) => {
      seen.push({ method: (init?.method ?? "GET").toUpperCase(), path: new URL(String(input)).pathname });
      return inner(input, init);
    },
  });
  const { agent_changeset: cs } = await client.create([{ method: "POST", path: TROY, body: { title: "Тройчатка" } }], "title");
  await client.list({ status: "staged" });
  await client.show(cs.id);
  await client.stage(cs.id);
  await client.publish(cs.id);
  await client.rollback(cs.id);
  await assert.rejects(client.discard("../../products/x"));
  await assert.rejects(client.show("x/stage/../../../orders"));

  assert.ok(seen.length >= 6);
  for (const r of seen) assert.match(r.path, CHANGESET_PATH, `${r.method} ${r.path}`);
  assert.deepEqual([...new Set(seen.filter((r) => r.method !== "GET").map((r) => r.method))], ["POST"]);
});

test("propose → confirm → stage → publish → rollback, the live site following each step", async () => {
  const { app, backend } = fixtureApp();
  const before = backend.live(TROY)?.title;

  // As speech-to-text writes it: a capital letter first.
  const asked = await app.text("Переименуй тройчатку в Тройчатка Евдокименко.", []);
  const staged = await app.commands.confirm(proposalOf(asked.cards));
  assert.ok(staged && !("sent" in staged));
  assert.equal(staged.card?.kind, "changeset");
  assert.equal(staged.changeset?.status, "staged");
  assert.match(staged.card?.link?.href ?? "", /^https:\/\/stage\.cherkashino\.com\/products\//);
  assert.ok(staged.card?.rows.some((r) => r.includes("Тройчатка Евдокименко")), "the card names the change");
  assert.equal(backend.live(TROY)?.title, before, "stage does not touch the live site");

  // «публикуй» asks first: a confirm card, nothing published yet.
  const ask = await app.text("публикуй", []);
  const confirm = ask.cards.find((c) => c.kind === "confirm");
  assert.ok(confirm, "a confirm card");
  assert.deepEqual(confirm.actions?.map((a) => a.action), ["publish"]);
  assert.equal(backend.live(TROY)?.title, before);

  const published = await app.changes!.run("publish", confirm.actions![0]!.id);
  assert.equal(published.changeset?.status, "published");
  assert.equal(backend.live(TROY)?.title, "Тройчатка Евдокименко");
  assert.match(published.card?.link?.href ?? "", /^https:\/\/cherkashino\.com\/products\//);

  const what = await app.text("что изменено", []);
  assert.ok(what.cards[0]?.rows.some((r) => /Тройчатка плюс.*на сайте$/.test(r)), JSON.stringify(what.cards[0]?.rows));

  const back = await app.text("откати", []);
  const undo = back.cards.find((c) => c.kind === "confirm");
  assert.deepEqual(undo?.actions?.map((a) => a.action), ["rollback"]);
  assert.equal(backend.live(TROY)?.title, "Тройчатка Евдокименко", "asking is not doing");
  const rolled = await app.changes!.run("rollback", undo!.actions![0]!.id);
  assert.equal(rolled.changeset?.status, "rolled_back");
  assert.equal(backend.live(TROY)?.title, before);
});

test("drift: the live site changed after publish, rollback shows the diff and changes nothing", async () => {
  const { app, backend } = fixtureApp();
  const asked = await app.text("переименуй тройчатку в Тройчатка плюс новая", []);
  const staged = await app.commands.confirm(proposalOf(asked.cards));
  const id = staged && !("sent" in staged) ? staged.changeset!.id : "";
  await app.changes!.run("publish", id);
  backend.touch(TROY, { title: "Поправлено в панели" });

  const out = await app.changes!.run("rollback", id);
  assert.equal(out.card?.kind, "drift");
  assert.ok(out.card?.diff?.length, "a diff row");
  assert.ok(JSON.stringify(out.card?.diff).includes("Поправлено в панели"));
  assert.ok(out.card?.rows.some((r) => /ничего не (изменено|тронул)/i.test(r)), JSON.stringify(out.card?.rows));
  assert.equal(backend.live(TROY)?.title, "Поправлено в панели");
});

test("a refusal: the backend's reason in Russian, the backend's own words, nothing changed", async () => {
  const { app, backend } = fixtureApp();
  const before = JSON.stringify(backend.live(TROY));
  const run = await app.commands.run("products.update", { product: "тройчатка", body: { status: "draft" } });
  const out = await app.commands.confirm(run.card!.proposalId!);
  assert.ok(out && !("sent" in out));
  assert.equal(out.card?.kind, "denied");
  const rows = out.card?.rows ?? [];
  assert.ok(rows.some((r) => r.startsWith("Причина:") && /status/.test(r)), JSON.stringify(rows));
  assert.ok(rows.some((r) => r.startsWith("Ответ магазина:") && /not open to the agent/.test(r)), JSON.stringify(rows));
  assert.ok(rows.includes("Ничего не изменено."));
  assert.equal(JSON.stringify(backend.live(TROY)), before);
});

test("CHANGESETS off: confirm is the stage 2 dry-run and the changeset tools say so", async () => {
  const app = createApp(readConfig({ SHOP_FIXTURES: "1", DATA_DIR: dataDir() }), { fetch: offline });
  assert.equal(app.changes, null);
  const asked = await app.text("переименуй тройчатку в Тройчатка", []);
  const done = await app.commands.confirm(proposalOf(asked.cards));
  assert.ok(done && "sent" in done && done.sent === false);
  const publish = await app.text("публикуй", []);
  assert.match(publish.reply, /выключен/);
});

/** The live shape over HTTP: what leaves the process, with the flag off and on. */
async function stand(changesets: boolean) {
  const seen: { method: string; url: URL }[] = [];
  const shop = fixtureFetch();
  const backend = new FixtureChangesetBackend({ stageUrl: "https://stage.shop.test", mainUrl: "https://shop.test" });
  const writes = backend.fetch();
  const net: FetchFn = async (input, init) => {
    const url = new URL(String(input));
    seen.push({ method: (init?.method ?? "GET").toUpperCase(), url });
    return url.pathname.startsWith("/tenants/agent-changesets") ? writes(input, init) : shop(input, init);
  };
  const config = readConfig({
    SHOP_API_URL: "https://shop.test",
    SHOP_LOGIN_EMAIL: "owner@shop.test",
    SHOP_LOGIN_PASSWORD: "test-password-not-real",
    MODEL_PROVIDER: "rules",
    DATA_DIR: dataDir(),
    ...(changesets ? { CHANGESETS: "1" } : {}),
  });
  const server = createServer(handler(createApp(config, { fetch: net }), null));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (path: string, body: unknown) => {
    const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  return { seen, server, post, base, backend };
}

/** Not a GET and not the shop login: a write. */
const writesOf = (seen: { method: string; url: URL }[]) => seen.filter((r) => r.method !== "GET" && r.url.pathname !== "/auth/tenant/emailpass");

test("over HTTP: CHANGESETS off sends no write at all; on, writes go to /tenants/agent-changesets* only", async (t) => {
  for (const on of [false, true]) {
    const { seen, server, post } = await stand(on);
    t.after(() => server.close());
    const asked = await post("/api/text", { question: "переименуй тройчатку в Тройчатка Евдокименко" });
    const proposalId = proposalOf(asked.body.cards as Card[]);
    const confirmed = await post("/api/commands/confirm", { proposalId });
    assert.equal(confirmed.status, 200);
    if (!on) {
      assert.equal(confirmed.body.sent, false);
      assert.equal((await post("/api/changesets/intent", { action: "publish" })).status, 409);
      assert.deepEqual(writesOf(seen), [], "flag off: nothing but GETs and the login");
      continue;
    }
    const cs = confirmed.body.changeset as { id: string; status: string };
    assert.equal(cs.status, "staged");
    const intent = await post("/api/changesets/intent", { action: "publish" });
    assert.equal((intent.body.cards as Card[])[0]?.kind, "confirm");
    assert.equal((await post(`/api/changesets/${cs.id}/publish`, {})).status, 200);
    assert.equal((await post(`/api/changesets/${cs.id}/rollback`, {})).status, 200);
    const writes = writesOf(seen);
    assert.ok(writes.length >= 4, "create, stage, publish, rollback");
    for (const w of writes) assert.match(w.url.pathname, CHANGESET_PATH, `${w.method} ${w.url.pathname}`);
  }
});
