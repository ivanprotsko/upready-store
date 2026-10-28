/**
 * Stage 3 around the write path: the day caps (model $5, pictures $3 and 30),
 * the RU flags, files (PDF with text, a scan, masking) and voice messages in
 * every format the page takes, all on stubs: no key, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApp } from "./app.ts";
import { DailyBudget } from "./budget.ts";
import { readConfig } from "./config.ts";
import type { Audio } from "./elevenlabs.ts";
import { audioFormat, FileError, MAX_FILE_BYTES } from "./files/index.ts";
import { extractPdfText } from "./files/pdf.ts";
import { ImageCapError, ImageService, StubImageProvider } from "./images/index.ts";
import type { ModelProvider, ModelRequest, ModelStep } from "./model/types.ts";
import { handler } from "./server.ts";
import type { FetchFn } from "./shop/api.ts";
import { placeholderWav, type Voice } from "./voice.ts";

const offline: FetchFn = async (url) => {
  throw new Error(`no network in this test: ${String(url)}`);
};
const dataDir = () => mkdtempSync(join(tmpdir(), "owner-voice-"));
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/files/${name}`, import.meta.url)));

/** A paid model that spends what it is told and keeps what it was asked. */
class SpendingModel implements ModelProvider {
  readonly name = "anthropic test";
  readonly asked: ModelRequest[] = [];
  readonly tokensIn: number;
  constructor(tokensIn: number) {
    this.tokensIn = tokensIn;
  }
  async next(request: ModelRequest): Promise<ModelStep> {
    this.asked.push(request);
    return { kind: "text", text: "Ответ модели.", usage: { inputTokens: this.tokensIn, outputTokens: 0 } };
  }
}

test("the model's $5 a day: past it the router answers and the page is told why", async (t) => {
  t.mock.method(console, "error", () => {});
  // 1M input tokens at $3 per million: two turns pass the $5 cap.
  const model = new SpendingModel(1_000_000);
  const app = createApp(readConfig({ SHOP_FIXTURES: "1", DATA_DIR: dataDir() }), { fetch: offline, provider: model });
  assert.equal((await app.text("привет", [])).reply, "Ответ модели.");
  assert.equal((await app.text("привет", [])).reply, "Ответ модели.");
  assert.equal(app.status().modelCap?.capped, true);
  assert.equal(app.status().modelCap?.usd, 6);

  const turn = await app.text("Сколько стоит тройчатка?", []);
  assert.equal(model.asked.length, 2, "no call past the cap");
  assert.match(turn.reply, /Тройчатка плюс — 15 \$/);
  assert.equal(turn.cards[0]?.kind, "notice");
  assert.match(turn.cards[0]?.rows[0] ?? "", /\$6\.00 из \$5\.00.*разбор по словам/);
  assert.ok(app.status().notes.some((n) => /Лимит модели \$5/.test(n)));
});

test("the day cap is kept on the server, per UTC day, across restarts", () => {
  const dir = dataDir();
  let day = new Date("2026-10-27T23:00:00Z");
  const one = new DailyBudget(dir, () => day);
  one.add("images", 2.5, 1);
  assert.deepEqual(new DailyBudget(dir, () => day).spent("images"), { usd: 2.5, count: 1 }, "a restart keeps the spend");
  day = new Date("2026-10-28T00:01:00Z");
  assert.deepEqual(one.spent("images"), { usd: 0, count: 0 }, "a new UTC day starts at zero");
});

test("pictures: $3 and 30 a day on the server", async () => {
  const opts = (cap: { usd: number; count: number }) => ({ dataDir: dataDir(), publicUrl: "http://stand", cap, ttlHours: 24 });
  const byCount = new ImageService(new StubImageProvider(0.04), new DailyBudget(dataDir()), opts({ usd: 3, count: 30 }));
  for (let i = 0; i < 30; i += 1) await byCount.generate(`баннер ${i}`);
  await assert.rejects(byCount.generate("ещё один"), (err: unknown) => err instanceof ImageCapError && /30/.test(err.message));

  const byUsd = new ImageService(new StubImageProvider(1), new DailyBudget(dataDir()), opts({ usd: 3, count: 30 }));
  for (let i = 0; i < 3; i += 1) await byUsd.generate(`баннер ${i}`);
  await assert.rejects(byUsd.generate("четвёртый"), (err: unknown) => err instanceof ImageCapError && /\$3/.test(err.message));
  assert.deepEqual(byUsd.usage(), { usd: 3, count: 3, capUsd: 3, capCount: 30, capped: true });
});

test("a picture by chat: the preview card offers the product and the banner; the cap says so", async () => {
  const app = createApp(readConfig({ SHOP_FIXTURES: "1", DATA_DIR: dataDir(), IMAGE_DAILY_COUNT: "1" }), { fetch: offline });
  const turn = await app.text("нарисуй баннер с алтайскими травами", []);
  const card = turn.cards.find((c) => c.kind === "image");
  assert.match(card?.image?.src ?? "", /^http:\/\/localhost:\d+\/api\/images\/img_[a-f0-9]{16}\.svg$/);
  assert.deepEqual(card?.actions?.map((a) => a.action), ["place-product", "place-banner", "redo", "cancel"]);
  const id = card!.image!.src.match(/(img_[a-f0-9]{16})/)![1]!;
  assert.match(new TextDecoder().decode(app.images.read(id)!.data), /^<svg/);

  const placed = await app.images.place(id, "banner");
  assert.equal(placed.card?.kind, "proposal");
  assert.equal(placed.card?.request?.method, "PUT");
  assert.match(placed.card?.request?.url ?? "", /\/tenants\/home$/);

  const again = await app.text("нарисуй ещё один баннер", []);
  assert.equal(again.cards[0]?.kind, "notice");
});

test("RU: Claude and pictures are off by flag, whatever keys are set", async () => {
  const config = readConfig({ SHOP_FIXTURES: "1", SHOP_REGION: "ru", MODEL_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key-not-real", DATA_DIR: dataDir() });
  assert.equal(config.model.provider, "rules");
  assert.equal(config.images.on, false);
  const app = createApp(config, { fetch: offline });
  const status = app.status();
  assert.equal(status.region, "ru");
  assert.match(status.model, /Claude off in RU/);
  assert.equal(status.images, "off (RU)");
  assert.equal(status.imageCap, null);
  assert.ok(status.notes.some((n) => /RU: Claude и картинки выключены/.test(n)));
  assert.doesNotMatch(JSON.stringify(status), /test-key-not-real/);
  const turn = await app.text("нарисуй баннер с травами", []);
  assert.match(turn.reply, /на RU картинки выключены/);
});

test("a PDF with text: read, masked, answered; the model never sees the contacts", async () => {
  const model = new SpendingModel(10);
  const app = createApp(readConfig({ SHOP_FIXTURES: "1", DATA_DIR: dataDir() }), { fetch: offline, provider: model });
  const file = app.files.save("price.pdf", "application/pdf", fixture("price.pdf"));
  assert.equal(file.kind, "pdf");
  assert.equal(file.scan, false);
  assert.match(file.text ?? "", /Тройчатка Евдокименко, 100 мл — 640 ₽/);
  assert.doesNotMatch(file.text ?? "", /olga\.travy|555-12-34/);

  const turn = await app.text("что в этом прайсе?", [], undefined, [file.id]);
  assert.equal(turn.cards[0]?.kind, "file");
  assert.ok(turn.cards[0]?.rows.some((r) => /Скрыто до модели: email, телефон/.test(r)), JSON.stringify(turn.cards[0]?.rows));
  const seen = JSON.stringify(model.asked);
  assert.match(seen, /Тройчатка Евдокименко/);
  assert.doesNotMatch(seen, /olga\.travy@example\.com|913 555/);
});

test("a PDF on the keyword router: the lines the question points at", async () => {
  const app = createApp(readConfig({ SHOP_FIXTURES: "1", DATA_DIR: dataDir() }), { fetch: offline });
  const file = app.files.save("price.pdf", "application/pdf", fixture("price.pdf"));
  const turn = await app.text("сколько стоит тройчатка по прайсу?", [], undefined, [file.id]);
  assert.match(turn.reply, /^В «price\.pdf»: .*Тройчатка Евдокименко, 100 мл — 640 ₽/);
  assert.doesNotMatch(turn.reply, /Мумиё|каштан/, "only the lines the question points at");
});

test("a scan: named a scan, no text made up", async () => {
  assert.equal(extractPdfText(fixture("scan.pdf")).scan, true);
  const app = createApp(readConfig({ SHOP_FIXTURES: "1", DATA_DIR: dataDir() }), { fetch: offline });
  const file = app.files.save("scan.pdf", "application/pdf", fixture("scan.pdf"));
  assert.equal(file.scan, true);
  assert.equal(file.text, undefined);
  const turn = await app.text("что тут?", [], undefined, [file.id]);
  assert.match(turn.reply, /это скан/);
  assert.ok(turn.cards[0]?.rows.some((r) => /Скан без текстового слоя/.test(r)));
});

test("files: text and CSV masked, 20 MB and the type checked", () => {
  const app = createApp(readConfig({ SHOP_FIXTURES: "1", DATA_DIR: dataDir() }), { fetch: offline });
  const csv = app.files.save("orders.csv", "text/csv", new TextEncoder().encode("товар;покупатель\nТройчатка;ivan.petrov@mail.ru +7 999 123-45-67"));
  assert.equal(csv.kind, "csv");
  assert.match(csv.text ?? "", /Тройчатка/);
  assert.doesNotMatch(csv.text ?? "", /ivan\.petrov|123-45-67/);
  assert.throws(() => app.files.save("big.pdf", "application/pdf", new Uint8Array(MAX_FILE_BYTES + 1)), (e: unknown) => e instanceof FileError && e.status === 413);
  assert.throws(() => app.files.save("x.exe", "application/octet-stream", new Uint8Array([1])), (e: unknown) => e instanceof FileError && e.status === 415);
});

test("voice messages: mp3, m4a, ogg, opus, wav, webm reach the STT stub; the transcript is kept, masked, then answered", async () => {
  const heard: Audio[] = [];
  let said = "Сколько стоит тройчатка?";
  const stt: Voice = {
    mode: "fixture",
    async transcribe(audio) {
      heard.push(audio);
      return said;
    },
    async speak(text) {
      return { data: placeholderWav(text), contentType: "audio/wav" };
    },
  };
  const app = createApp(readConfig({ SHOP_FIXTURES: "1", DATA_DIR: dataDir() }), { fetch: offline, voice: stt });
  const formats: [string, string, string][] = [
    ["voice-1.mp3", "audio/mpeg", "audio/mpeg"],
    ["note.m4a", "audio/x-m4a", "audio/mp4"],
    ["note.ogg", "audio/ogg", "audio/ogg"],
    ["note.opus", "audio/opus", "audio/ogg"],
    ["note.wav", "audio/wav", "audio/wav"],
    ["voice-2.webm", "audio/webm;codecs=opus", "audio/webm"],
  ];
  for (const [name, type, sent] of formats) {
    const file = app.files.save(name, type, new Uint8Array([1, 2, 3, 4]));
    assert.equal(file.kind, "audio", name);
    const turn = await app.voiceNote(file.id, []);
    const audio = heard.at(-1)!;
    assert.equal(audio.contentType, sent, name);
    assert.equal(audio.name, `speech.${audioFormat(name, type)!.ext}`, name);
    assert.equal(turn.cards[0]?.kind, "voice-note");
    assert.equal(turn.cards[0]?.download?.href, `/api/files/${file.id}/transcript.txt`);
    assert.equal(app.files.get(file.id)?.transcript, "Сколько стоит тройчатка?");
    assert.match(turn.reply, /Тройчатка плюс — 15 \$/);
  }
  // What speech-to-text heard is masked before it is kept, shown or answered.
  said = "Перезвони покупательнице, её телефон +7 913 555-12-34";
  const note = app.files.save("voice-3.webm", "audio/webm", new Uint8Array([1, 2, 3, 4]));
  const masked = await app.voiceNote(note.id, []);
  assert.match(masked.transcript, /\[телефон скрыт\]/);
  assert.doesNotMatch(JSON.stringify(masked), /555-12-34/);
  assert.doesNotMatch(app.files.get(note.id)?.transcript ?? "", /555-12-34/);
  assert.deepEqual(
    formats.map(([n, t]) => audioFormat(n, t)!.ext),
    ["mp3", "m4a", "ogg", "opus", "wav", "webm"],
  );
});

test("over HTTP: a file upload, a voice message with its .txt, a picture the site can fetch without the password", async (t) => {
  const app = createApp(readConfig({ SHOP_FIXTURES: "1", DATA_DIR: dataDir() }), { fetch: offline });
  const server = createServer(handler(app, "stand-pass"));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const auth = { authorization: `Basic ${Buffer.from("ivan:stand-pass").toString("base64")}` };
  const upload = async (name: string, type: string, data: Uint8Array) => {
    const res = await fetch(`${base}/api/files?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`, { method: "POST", headers: auth, body: data });
    return { status: res.status, body: (await res.json()) as { file?: { id: string; kind: string; text?: string }; error?: string } };
  };

  const pdf = await upload("price.pdf", "application/pdf", fixture("price.pdf"));
  assert.equal(pdf.status, 200);
  assert.equal(pdf.body.file?.kind, "pdf");
  assert.equal(pdf.body.file?.text, undefined, "the page gets the card, not the text");
  const asked = await fetch(`${base}/api/text`, { method: "POST", headers: auth, body: JSON.stringify({ question: "", files: [pdf.body.file!.id] }) });
  assert.equal(asked.status, 200);
  assert.equal(((await asked.json()) as { cards: { kind: string }[] }).cards[0]?.kind, "file");
  assert.equal((await upload("x.exe", "application/octet-stream", new Uint8Array([1]))).status, 415);

  const wav = new Uint8Array(readFileSync(new URL("../fixtures/voice/question-sales-week.wav", import.meta.url)));
  const note = await upload("voice-1.wav", "audio/wav", wav);
  const voiced = await fetch(`${base}/api/files/${note.body.file!.id}/voice`, { method: "POST", headers: auth, body: "{}" });
  const turn = (await voiced.json()) as { transcript: string; reply: string; cards: { kind: string; download?: { href: string } }[] };
  assert.equal(turn.transcript, "Сколько мы продали за неделю?");
  assert.equal(turn.cards[0]?.kind, "voice-note");
  assert.match(turn.reply, /Выручка: 1 284 \$/);
  const txt = await fetch(base + turn.cards[0]!.download!.href, { headers: auth });
  assert.equal(txt.status, 200);
  assert.match(txt.headers.get("content-disposition") ?? "", /attachment; filename="transcript-file_[a-f0-9]{16}\.txt"/);
  assert.equal(await txt.text(), "Сколько мы продали за неделю?\n");

  const picture = await app.text("нарисуй баннер с травами", []);
  const src = picture.cards.find((c) => c.kind === "image")!.image!.src;
  const path = new URL(src).pathname;
  assert.equal((await fetch(`${base}/`)).status, 401, "the page still asks for the password");
  const svg = await fetch(base + path);
  assert.equal(svg.status, 200);
  assert.equal(svg.headers.get("content-type"), "image/svg+xml");
  assert.equal((await fetch(`${base}/api/images/img_0000000000000000.svg`)).status, 404);
});
