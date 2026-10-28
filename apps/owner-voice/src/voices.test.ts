/**
 * Voice settings (Do 9) on a stubbed ElevenLabs: the catalog mapping, the
 * language filter, a refused voice, the chosen voice speaking, and no write
 * to the account while ELEVENLABS_ALLOW_ADD_VOICE is off.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import type { FetchFn } from "./shop/api.ts";
import { fixtureFetch } from "./shop/fixtures.ts";
import { catalogFixtureFetch, filterVoices, fromAccount, fromLibrary, LANGUAGES_RU, VoiceCatalog, VoiceError } from "./voices.ts";

const KEY = "test-key-not-real";
const DEFAULT = "hRkvvKIawos7EupPfna0";

/** ElevenLabs behind a stub: the catalog from the shaped fixture, speech as a few bytes; every request kept. */
function elevenlabs() {
  const seen: { method: string; url: string; key: string | null }[] = [];
  const catalog = catalogFixtureFetch();
  const shop = fixtureFetch();
  const fn: FetchFn = async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = (init?.headers ?? {}) as Record<string, string>;
    seen.push({ method, url: url.href, key: headers["xi-api-key"] ?? null });
    if (url.hostname !== "api.elevenlabs.io") return shop(input, init);
    if (url.pathname.startsWith("/v1/text-to-speech/")) return new Response(new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]), { headers: { "content-type": "audio/mpeg" } });
    return catalog(input, init);
  };
  return { fn, seen };
}

const catalog = (fn: FetchFn, allowAdd = false) => new VoiceCatalog({ apiKey: KEY, defaultVoiceId: DEFAULT, allowAdd }, fn);

test("an account voice maps its labels and verified languages", () => {
  const v = fromAccount({
    voice_id: "abc12345",
    name: "Борис",
    labels: { gender: "male", accent: "russian", age: "middle_aged" },
    preview_url: "https://storage.example/preview.mp3",
    verified_languages: [{ language: "ru", locale: "ru-RU" }, { language: "en" }],
  });
  assert.deepEqual(v, {
    id: "abc12345",
    name: "Борис",
    source: "account",
    languages: ["ru", "en"],
    gender: "male",
    accent: "russian",
    age: "middle_aged",
    description: null,
    previewUrl: "https://storage.example/preview.mp3",
    needsAdd: false,
  });
});

test("a library voice needs adding unless the account has it", () => {
  const row = { voice_id: "lib12345", name: "Алёна", public_owner_id: "own1", language: "ru", gender: "female", is_added_by_user: false };
  assert.equal(fromLibrary(row, new Set()).needsAdd, true);
  assert.equal(fromLibrary(row, new Set(["lib12345"])).needsAdd, false);
  assert.equal(fromLibrary({ ...row, is_added_by_user: true }, new Set()).needsAdd, false);
  assert.equal(fromLibrary(row, new Set()).publicOwnerId, "own1");
});

test("languages are named in Russian; ru is in the list", () => {
  assert.equal(LANGUAGES_RU.ru, "Русский");
  assert.equal(LANGUAGES_RU.en, "Английский");
});

test("the language filter: ru by default in the panel, the account filtered here, the library on the server", async () => {
  const { fn, seen } = elevenlabs();
  const list = await catalog(fn).list({ language: "ru" });
  const ids = list.voices.map((v) => v.id);
  assert.deepEqual(ids, [DEFAULT, "fixAcctMaleRu0001", "fixLibFemaleRu001", "fixLibMaleRu00002"]);
  assert.ok(!ids.includes("fixAcctFemaleEn01"), "an English account voice is not under ru");
  const library = seen.find((r) => r.url.includes("/v1/shared-voices"))!;
  assert.equal(new URL(library.url).searchParams.get("language"), "ru");
  assert.equal(library.key, KEY, "the key goes to ElevenLabs, server side");

  const en = await catalog(fn).list({ language: "en", gender: "male" });
  assert.deepEqual(en.voices.map((v) => v.id), ["fixLibMaleEnGb001"]);
  const byName = await catalog(fn).list({ language: "ru", q: "борис" });
  assert.deepEqual(byName.voices.map((v) => v.id), ["fixAcctMaleRu0001"]);
  assert.ok(list.accents.includes("russian"));
});

test("a voice with no language stays under every language", () => {
  const bare = fromAccount({ voice_id: "clone1234", name: "Мой клон", labels: {} });
  assert.deepEqual(filterVoices([bare], { language: "de" }).map((v) => v.id), ["clone1234"]);
});

test("the catalog reads with GET only", async () => {
  const { fn, seen } = elevenlabs();
  const c = catalog(fn);
  await c.list({ language: "ru" });
  await c.list({ language: "uk", source: "library" });
  assert.ok(seen.length >= 2);
  assert.deepEqual(seen.filter((r) => r.method !== "GET"), []);
});

test("an unknown voice_id is refused; a library voice not added yet asks to be added", async () => {
  const { fn } = elevenlabs();
  const c = catalog(fn);
  await assert.rejects(c.resolve("unknownVoice0001"), (e: unknown) => e instanceof VoiceError && e.status === 400);
  await assert.rejects(c.resolve("bad id; drop"), (e: unknown) => e instanceof VoiceError && e.status === 400);
  await c.list({ language: "ru" });
  await assert.rejects(c.resolve("fixLibFemaleRu001"), (e: unknown) => e instanceof VoiceError && e.status === 409 && /добавить в аккаунт/.test(e.message));
  assert.equal(await c.resolve("fixAcctMaleRu0001"), "fixAcctMaleRu0001");
  assert.equal(await c.resolve(undefined), DEFAULT, "no choice: the env default");
});

test("adding a library voice is refused while ELEVENLABS_ALLOW_ADD_VOICE is off, and nothing is sent", async () => {
  const { fn, seen } = elevenlabs();
  const c = catalog(fn);
  await c.list({ language: "ru" });
  await assert.rejects(c.add("fixLibFemaleRu001"), (e: unknown) => e instanceof VoiceError && e.status === 403);
  assert.deepEqual(seen.filter((r) => r.method !== "GET"), []);
  assert.equal(readConfig({}).elevenlabs.allowAddVoice, false, "off by default");
  assert.equal(readConfig({ ELEVENLABS_ALLOW_ADD_VOICE: "0" }).elevenlabs.allowAddVoice, false);
});

test("TTS speaks with the chosen voice; no choice speaks with the env default", async () => {
  const { fn, seen } = elevenlabs();
  const app = createApp(readConfig({ SHOP_FIXTURES: "1", ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE_ID: DEFAULT }), { fetch: fn });
  const tts = () => seen.filter((r) => r.url.includes("/v1/text-to-speech/")).map((r) => new URL(r.url).pathname);

  const chosen = await app.text("Сколько стоит тройчатка?", [], "fixAcctMaleRu0001");
  assert.ok(chosen.audio);
  assert.deepEqual(tts(), ["/v1/text-to-speech/fixAcctMaleRu0001"]);

  await app.text("Сколько стоит тройчатка?", []);
  assert.deepEqual(tts().at(-1), `/v1/text-to-speech/${DEFAULT}`);

  const before = tts().length;
  await assert.rejects(app.text("Сколько стоит тройчатка?", [], "unknownVoice0001"), (e: unknown) => e instanceof VoiceError && e.status === 400);
  assert.equal(tts().length, before, "a refused voice speaks nothing");
});
