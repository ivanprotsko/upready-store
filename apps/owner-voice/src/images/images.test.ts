/**
 * Owner chat photos: both drivers, the SSRF guard, the page reader, the approval
 * flow, the day caps for edits, the cost journal and the key staying out of every
 * output. No network and no key: every request is answered by a fake fetch.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApp } from "../app.ts";
import { DailyBudget } from "../budget.ts";
import { readConfig } from "../config.ts";
import type { Card } from "../tools.ts";
import type { FetchFn } from "../shop/api.ts";
import { FixtureChangesetBackend } from "../shop/changesets-fixture.ts";
import { FIXTURE_PAGE } from "../shop/fixture-web.ts";
import { FixtureUploadBackend } from "../shop/uploads.ts";
import { ImageCapError, ImageService } from "./index.ts";
import { assertPublic, guardedGet, isPrivateAddress, NetError } from "./net.ts";
import { findPagePictures } from "./page.ts";
import { FalProvider, PRICE_TABLE, ProviderError, ReplicateProvider, StubImageProvider } from "./providers.ts";

const offline: FetchFn = async (url) => {
  throw new Error(`no network in this test: ${String(url)}`);
};
const dataDir = () => mkdtempSync(join(tmpdir(), "owner-voice-"));
const photo = () => new Uint8Array(readFileSync(new URL("../../fixtures/files/photo-jar.png", import.meta.url)));
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const KEY = "sk-test-secret-key-0123456789";
const publicLookup = async () => ["93.184.216.34"];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const image = (type = "image/png") => new Response(PNG, { headers: { "content-type": type } });

// ---- the two drivers

test("fal: one POST to the model, key in the header, result downloaded into bytes", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetch: FetchFn = (async (url: string, init: RequestInit) => {
    seen.push({ url: String(url), init });
    return String(url).startsWith("https://fal.run/") ? json({ images: [{ url: "https://v3.fal.media/files/out.png" }] }) : image();
  }) as FetchFn;
  const fal = new FalProvider({ key: KEY, fetch, lookup: publicLookup });
  const out = await fal.edit({ data: PNG, contentType: "image/png" }, "remove-bg");
  assert.equal(seen[0]!.url, `https://fal.run/${PRICE_TABLE.fal["remove-bg"].model}`);
  assert.equal((seen[0]!.init.headers as Record<string, string>).authorization, `Key ${KEY}`);
  assert.match(JSON.parse(String(seen[0]!.init.body)).image_url, /^data:image\/png;base64,/);
  assert.deepEqual([...out.data], [...PNG], "the result is bytes, not an address");
  assert.equal(out.costUsd, PRICE_TABLE.fal["remove-bg"].usd);
  assert.equal(out.provider, "fal");
  assert.doesNotMatch(JSON.stringify({ ...out, data: 0 }), /fal\.media/, "the provider address is not kept");
  const gen = await fal.generate("баннер");
  assert.equal(gen.model, PRICE_TABLE.fal.generate.model);
});

test("replicate: prediction with Prefer: wait, a poll while it runs, price from the provider when given", async () => {
  const calls: string[] = [];
  const fetch: FetchFn = (async (url: string, init: RequestInit) => {
    calls.push(`${init?.method} ${url}`);
    if (String(url).includes("/predictions") && init.method === "POST") {
      assert.equal((init.headers as Record<string, string>).authorization, `Bearer ${KEY}`);
      assert.match((init.headers as Record<string, string>).prefer, /wait/);
      return json({ status: "processing", urls: { get: "https://api.replicate.com/v1/predictions/p1" } });
    }
    if (String(url).endsWith("/predictions/p1")) return json({ status: "succeeded", output: ["https://replicate.delivery/out.png"], metrics: { cost_usd: 0.0123 } });
    return image();
  }) as FetchFn;
  const rep = new ReplicateProvider({ key: KEY, fetch, lookup: publicLookup, pollMs: 1 });
  const out = await rep.edit({ data: PNG, contentType: "image/png" }, "even-light");
  assert.equal(out.costUsd, 0.0123, "the provider's price wins over the table");
  assert.equal(calls.length, 3);
  assert.equal(out.model, PRICE_TABLE.replicate["even-light"].model);
});

test("drivers: an error, a timeout and an oversized result are refused in plain words, with no key in them", async () => {
  const echo: FetchFn = (async () => json({ detail: `bad Authorization: Key ${KEY} at https://secret.provider/x` }, 401)) as FetchFn;
  await assert.rejects(new FalProvider({ key: KEY, fetch: echo, lookup: publicLookup }).generate("x"), (err: unknown) => {
    assert.ok(err instanceof ProviderError);
    assert.doesNotMatch(err.message, new RegExp(KEY));
    assert.doesNotMatch(err.message, /secret\.provider/);
    return /401/.test(err.message);
  });

  const hang: FetchFn = ((_: string, init: RequestInit) => new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as FetchFn;
  await assert.rejects(new ReplicateProvider({ key: KEY, fetch: hang, lookup: publicLookup, timeoutMs: 20 }).generate("x"), (err: unknown) => err instanceof ProviderError && err.kind === "timeout");

  const big: FetchFn = (async (url: string) =>
    String(url).startsWith("https://fal.run/") ? json({ image: { url: "https://cdn.example/big.png" } }) : new Response(new Uint8Array(2000), { headers: { "content-type": "image/png" } })) as FetchFn;
  await assert.rejects(new FalProvider({ key: KEY, fetch: big, lookup: publicLookup, maxResultBytes: 1000 }).generate("x"), (err: unknown) => err instanceof ProviderError && err.kind === "too_big");
});

// ---- SSRF

test("SSRF: every private class is refused, public ones pass", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "224.0.0.1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["93.184.216.34", "8.8.8.8", "2606:2800:220:1:248:1893:25c8:1946"]) assert.equal(isPrivateAddress(ip), false, ip);
  const refuse = (url: string, lookup = publicLookup) => assert.rejects(assertPublic(url, lookup), (err: unknown) => err instanceof NetError && err.code === "refused");
  await refuse("http://example.com/a");
  await refuse("https://user:pw@example.com/a");
  await refuse("https://127.0.0.1/a");
  await refuse("https://[::1]/a");
  await refuse("https://metadata.google.internal/a", async () => ["169.254.169.254"]);
  await refuse("https://rebind.example/a", async () => ["93.184.216.34", "10.0.0.5"]);
  await refuse("https://nowhere.example/a", async () => []);
  await refuse("not a url");
});

test("SSRF: a public page that redirects into a private address stops at the hop; more than 3 redirects stop too", async () => {
  const hosts: string[] = [];
  const lookup = async (host: string) => (host === "inside.example" ? ["169.254.169.254"] : ["93.184.216.34"]);
  const bounce: FetchFn = (async (url: string) => {
    hosts.push(new URL(String(url)).hostname);
    return new Response(null, { status: 302, headers: { location: "https://inside.example/latest/meta-data" } });
  }) as FetchFn;
  await assert.rejects(guardedGet("https://public.example/p", { fetch: bounce, lookup, timeoutMs: 1000, maxBytes: 1000 }), (err: unknown) => err instanceof NetError && err.code === "refused");
  assert.deepEqual(hosts, ["public.example"], "the private hop was never requested");

  const loop: FetchFn = (async (url: string) => new Response(null, { status: 302, headers: { location: `${String(url)}x` } })) as FetchFn;
  await assert.rejects(guardedGet("https://public.example/p", { fetch: loop, lookup, timeoutMs: 1000, maxBytes: 1000 }), (err: unknown) => err instanceof NetError && err.code === "redirects");
});

test("the guard caps the size and the type, and times out", async () => {
  const lookup = publicLookup;
  const html: FetchFn = (async () => new Response("<html>" + "x".repeat(500), { headers: { "content-type": "text/html" } })) as FetchFn;
  await assert.rejects(guardedGet("https://a.example/", { fetch: html, lookup, timeoutMs: 1000, maxBytes: 100 }), (err: unknown) => err instanceof NetError && err.code === "too_big");
  await assert.rejects(guardedGet("https://a.example/", { fetch: html, lookup, timeoutMs: 1000, maxBytes: 9999, type: /^image\// }), (err: unknown) => err instanceof NetError && err.code === "bad_type");
  const hang: FetchFn = ((_: string, init: RequestInit) => new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as FetchFn;
  await assert.rejects(guardedGet("https://a.example/", { fetch: hang, lookup, timeoutMs: 20, maxBytes: 100 }), (err: unknown) => err instanceof NetError && err.code === "timeout");
});

// ---- the page reader

test("page: og:image first, then JSON-LD Product.image, then the largest <img>; six at most, https only", () => {
  const html = `<head><meta property="og:image" content="/og.jpg">
    <script type="application/ld+json">{"@graph":[{"@type":"Product","image":["https://cdn.example/a.jpg",{"url":"http://insecure.example/b.jpg"}]}]}</script></head>
    <header><img src="/logo.png" width="500" height="500"></header>
    <main><img src="/small.png" width="40" height="40"><img src="/mid.jpg" width="300" height="300"><img src="/big.jpg" width="900" height="900"><img data-src="/lazy.jpg"></main>`;
  assert.deepEqual(findPagePictures(html, "https://shop.example/p/1"), [
    "https://shop.example/og.jpg",
    "https://cdn.example/a.jpg",
    "https://shop.example/big.jpg",
    "https://shop.example/mid.jpg",
    "https://shop.example/lazy.jpg",
  ]);
  const many = Array.from({ length: 12 }, (_, i) => `<meta property="og:image" content="https://x.example/${i}.jpg">`).join("");
  assert.equal(findPagePictures(many, "https://x.example/").length, 6);
  assert.deepEqual(findPagePictures("<p>нет картинок</p>", "https://x.example/"), []);
});

// ---- the service: caps and the journal

const service = (cap = { usd: 3, count: 30 }, usd = 0.04) => {
  const dir = dataDir();
  return { dir, images: new ImageService(new StubImageProvider(usd), new DailyBudget(dir), { dataDir: dir, publicUrl: "http://stand", cap, ttlHours: 24, shop: "cherkashino.com" }) };
};
const journal = (dir: string) =>
  readFileSync(join(dir, "images", "costs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);

test("edits and generations share the one day cap; past it nothing is called and the refusal is journaled", async () => {
  const { dir, images } = service({ usd: 3, count: 2 });
  const src = { data: PNG, contentType: "image/png" };
  await images.edit(src, "remove-bg", "фото");
  await images.generate("баннер");
  await assert.rejects(images.edit(src, "even-light", "фото"), (err: unknown) => err instanceof ImageCapError);
  const lines = journal(dir);
  assert.deepEqual(lines.map((l) => l.status), ["ok", "ok", "refused by cap"]);
  assert.deepEqual(lines.map((l) => l.operation), ["remove-bg", "generate", "even-light"]);
  assert.equal(lines[2]!.cost_usd, 0);
  assert.equal(lines[0]!.shop, "cherkashino.com");
  assert.equal(lines[0]!.provider, "stub");
  assert.match(String(lines[0]!.picture), /^img_[a-f0-9]{16}$/);
  assert.match(String(lines[0]!.time), /^\d{4}-\d\d-\d\dT/);
  // No customer data, key or provider address in the journal.
  assert.doesNotMatch(JSON.stringify(lines), /http|key|token|баннер/i);
});

test("a failed provider call is journaled as failed and costs nothing", async () => {
  const dir = dataDir();
  const broken = new FalProvider({ key: KEY, fetch: (async () => json({ detail: "boom" }, 500)) as FetchFn, lookup: publicLookup });
  const images = new ImageService(broken, new DailyBudget(dir), { dataDir: dir, publicUrl: "http://stand", cap: { usd: 3, count: 30 }, ttlHours: 24 });
  await assert.rejects(images.generate("x"), ProviderError);
  assert.equal(journal(dir)[0]!.status, "failed");
  assert.deepEqual(images.usage(), { usd: 0, count: 0, capUsd: 3, capCount: 30, capped: false });
  assert.doesNotMatch(readFileSync(join(dir, "images", "costs.jsonl"), "utf8"), new RegExp(KEY));
});

// ---- the chat flow: a photo, the words, the approval, the upload, the changeset

function liveApp(env: Record<string, string> = {}) {
  const backend = new FixtureChangesetBackend({ stageUrl: "https://stage.cherkashino.com", mainUrl: "https://cherkashino.com" });
  const uploads = new FixtureUploadBackend("https://static.cherkashino.com");
  const app = createApp(readConfig({ SHOP_FIXTURES: "1", CHANGESETS: "1", DATA_DIR: dataDir(), ...env }), {
    fetch: offline,
    changesetFetch: backend.fetch(),
    uploadFetch: uploads.fetch(),
  });
  return { app, backend, uploads };
}
const cardOf = (cards: Card[], kind: string) => cards.find((c) => c.kind === kind);

test("a photo with «убери фон»: before and after, provider, price and the day count; nothing leaves yet", async () => {
  const { app, uploads } = liveApp();
  const file = app.files.save("jar.png", "image/png", photo());
  const turn = await app.text("убери фон", [], undefined, [file.id]);
  const card = cardOf(turn.cards, "image");
  assert.deepEqual(card?.images?.map((i) => i.label), ["До", "После"]);
  assert.deepEqual(card?.actions?.map((a) => a.action), ["place-product", "redo", "cancel"]);
  const rows = card!.rows.join("\n");
  assert.match(rows, /убрать фон/i);
  assert.match(rows, /заглушка/);
  assert.match(rows, /Сегодня: 1 из 30/);
  assert.equal(uploads.calls.length, 0);
});

test("a photo with no words: the owner is asked what to do, and no provider call is made", async () => {
  const { app } = liveApp();
  const file = app.files.save("jar.png", "image/png", photo());
  const turn = await app.text("", [], undefined, [file.id]);
  assert.match(turn.reply, /убрать фон или выровнять свет/);
  assert.deepEqual(cardOf(turn.cards, "notice")?.actions?.map((a) => a.action), ["edit-bg", "edit-light"]);
  assert.equal(app.images.act === undefined, false);
  const done = await app.images.act(file.id, "edit-light");
  assert.equal(cardOf(done.card ? [done.card] : [], "image")?.images?.length, 2);
});

test("approval: «на товар» proposes, only the «да» uploads and stages, and then the preview bytes go", async () => {
  const { app, uploads, backend } = liveApp();
  const file = app.files.save("jar.png", "image/png", photo());
  const edited = await app.text("убери фон", [], undefined, [file.id]);
  const id = cardOf(edited.cards, "image")!.actions![0]!.id!;
  const proposed = await app.images.place(id, "product", "тройчатка");
  const proposal = cardOf(proposed.card ? [proposed.card] : [], "proposal");
  assert.ok(proposal?.proposalId, "a proposal card");
  assert.equal(uploads.calls.length, 0, "before the «да» nothing is uploaded");
  assert.equal(backend.changesets?.length ?? 0, 0, "and nothing is staged");

  const out = await app.commands.confirm(proposal.proposalId!);
  assert.equal(uploads.calls.length, 1);
  assert.equal(uploads.calls[0]!.type, "image/svg+xml");
  const staged = JSON.stringify(out);
  assert.match(staged, /static\.cherkashino\.com/, "the op carries the shop's own address");
  assert.doesNotMatch(staged, /localhost|\/api\/images\//, "and not the local preview address");
  assert.equal(app.images.read(id), null, "the preview bytes are deleted after the placement");
});

test("a «нет», a cancel or a day of silence delete the preview and send nothing", async () => {
  const { app, uploads } = liveApp();
  const file = app.files.save("jar.png", "image/png", photo());
  const edited = await app.text("выровняй свет", [], undefined, [file.id]);
  const id = cardOf(edited.cards, "image")!.actions![0]!.id!;
  assert.ok(app.images.read(id));
  const gone = await app.images.act(id, "cancel");
  assert.match(gone.text, /удалены/);
  assert.equal(app.images.read(id), null);
  assert.equal(uploads.calls.length, 0);

  // A day of silence: past the TTL the sweep deletes the preview; before it, it stays.
  const { images } = service();
  const made = await images.generate("тест");
  assert.equal(images.sweep(Date.now() + 23 * 3_600_000), 0);
  assert.ok(images.read(made.id));
  assert.equal(images.sweep(Date.now() + 25 * 3_600_000), 1);
  assert.equal(images.read(made.id), null);
});

test("«сделать ещё раз» edits the same original again and drops the first result", async () => {
  const { app } = liveApp();
  const file = app.files.save("jar.png", "image/png", photo());
  const first = await app.text("убери фон", [], undefined, [file.id]);
  const id = cardOf(first.cards, "image")!.actions![0]!.id!;
  const redo = await app.images.act(id, "redo");
  const next = redo.card?.actions?.[0]?.id;
  assert.ok(next && next !== id);
  assert.equal(app.images.read(id), null, "the first result is gone");
  assert.equal(redo.card?.images?.length, 2);
});

test("a link to a product page: up to 6 numbered pictures, the pick edits it", async () => {
  const { app } = liveApp();
  const turn = await app.text(`возьми фото отсюда ${FIXTURE_PAGE}`, []);
  const card = cardOf(turn.cards, "image");
  assert.equal(card?.images?.length, 3);
  assert.deepEqual(card?.images?.map((i) => i.label), ["1", "2", "3"]);
  const pick = await app.text("убери фон на втором", []);
  assert.deepEqual(cardOf(pick.cards, "image")?.images?.map((i) => i.label), ["До", "После"]);
});

test("a link that opens nothing public is refused in words and asks for the photo", async () => {
  const { app } = liveApp();
  const turn = await app.text("убери фон на фото https://127.0.0.1/admin", []);
  assert.match(turn.reply, /Пришлите само фото|закрытый/);
  assert.equal(cardOf(turn.cards, "image"), undefined);
});

test("CHANGESETS off: the «да» shows the request and uploads nothing", async () => {
  const uploads = new FixtureUploadBackend("https://static.cherkashino.com");
  const app = createApp(readConfig({ SHOP_FIXTURES: "1", DATA_DIR: dataDir() }), { fetch: offline, uploadFetch: uploads.fetch() });
  const file = app.files.save("jar.png", "image/png", photo());
  const edited = await app.text("убери фон", [], undefined, [file.id]);
  const id = cardOf(edited.cards, "image")!.actions![0]!.id!;
  const proposed = await app.images.place(id, "product", "тройчатка");
  const out = await app.commands.confirm(proposed.card!.proposalId!);
  assert.ok(out && "sent" in out && out.sent === false);
  assert.equal(uploads.calls.length, 0);
});

// ---- no key in any output

test("a key set in the environment is in no status, card, config line or journal", async () => {
  const dir = dataDir();
  const fetch: FetchFn = (async (url: string) => {
    if (String(url).startsWith("https://fal.run/")) return json({ images: [{ url: "https://v3.fal.media/o.png" }] });
    return image();
  }) as FetchFn;
  const config = readConfig({ SHOP_FIXTURES: "1", DATA_DIR: dir, IMAGE_PROVIDER: "fal", FAL_KEY: KEY });
  const app = createApp(config, { fetch: offline, imageNet: { fetch, lookup: publicLookup } });
  const file = app.files.save("jar.png", "image/png", photo());
  const turn = await app.text("убери фон", [], undefined, [file.id]);
  const everything = JSON.stringify([app.status(), turn]) + readFileSync(join(dir, "images", "costs.jsonl"), "utf8");
  assert.doesNotMatch(everything, new RegExp(KEY));
  assert.match(JSON.stringify(app.status()), /fal/);
  assert.doesNotMatch(everything, /fal\.media/);
});

test("no key for the chosen provider: stub, and the status says «заглушка»", () => {
  const app = createApp(readConfig({ SHOP_FIXTURES: "1", DATA_DIR: dataDir(), IMAGE_PROVIDER: "replicate" }), { fetch: offline });
  assert.match(String(app.status().images), /заглушка/);
  assert.equal(readConfig({ SHOP_FIXTURES: "1" }).images.provider, "stub");
});
