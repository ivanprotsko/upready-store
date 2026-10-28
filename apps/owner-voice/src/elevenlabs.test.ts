import { test } from "node:test";
import assert from "node:assert/strict";

import { type ElevenLabsOptions, speechToText, textToSpeech } from "./elevenlabs.ts";
import type { FetchFn } from "./shop/api.ts";

const OPTS: ElevenLabsOptions = {
  apiKey: "test-key-not-real",
  voiceId: "voice 1",
  ttsModelId: "eleven_flash_v2_5",
  sttModelId: "scribe_v1",
  languageCode: "ru",
};

function capture(response: Response) {
  const seen: { url: string; init: RequestInit | undefined }[] = [];
  const fn: FetchFn = async (input, init) => {
    seen.push({ url: String(input), init });
    return response;
  };
  return { fn, seen };
}

test("STT posts the audio as multipart with the model and the language", async () => {
  const net = capture(new Response(JSON.stringify({ text: "  Сколько мы продали?  ", language_code: "rus" })));
  const text = await speechToText(OPTS, { data: new Uint8Array([1, 2, 3]), contentType: "audio/webm" }, net.fn);

  assert.equal(text, "Сколько мы продали?");
  const { url, init } = net.seen[0]!;
  assert.equal(url, "https://api.elevenlabs.io/v1/speech-to-text");
  assert.equal(init?.method, "POST");
  assert.deepEqual(init?.headers, { "xi-api-key": "test-key-not-real" }, "no hand-set content-type: fetch sets the boundary");
  const form = init?.body as FormData;
  assert.equal(form.get("model_id"), "scribe_v1");
  assert.equal(form.get("language_code"), "ru");
  const file = form.get("file") as File;
  assert.equal(file.name, "speech.webm");
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array([1, 2, 3]));
});

test("STT names a wav upload .wav", async () => {
  const net = capture(new Response(JSON.stringify({ text: "да" })));
  await speechToText(OPTS, { data: new Uint8Array([0]), contentType: "audio/wav" }, net.fn);
  assert.equal(((net.seen[0]!.init?.body as FormData).get("file") as File).name, "speech.wav");
});

test("TTS posts the text to the voice and returns the audio bytes", async () => {
  const net = capture(new Response(new Uint8Array([9, 8, 7]), { headers: { "content-type": "audio/mpeg" } }));
  const audio = await textToSpeech(OPTS, "Выручка за неделю 1284 доллара.", net.fn);

  assert.deepEqual(audio, { data: new Uint8Array([9, 8, 7]), contentType: "audio/mpeg" });
  const { url, init } = net.seen[0]!;
  assert.equal(url, "https://api.elevenlabs.io/v1/text-to-speech/voice%201");
  assert.equal((init?.headers as Record<string, string>)["xi-api-key"], "test-key-not-real");
  assert.deepEqual(JSON.parse(String(init?.body)), {
    text: "Выручка за неделю 1284 доллара.",
    model_id: "eleven_flash_v2_5",
    language_code: "ru",
    voice_settings: { stability: 0.5, similarity_boost: 0.8 },
  });
});

test("a refused call throws with the status and a short detail", async () => {
  const net = capture(new Response("quota exceeded", { status: 401 }));
  await assert.rejects(textToSpeech(OPTS, "x", net.fn), /ElevenLabs TTS failed \(401\): quota exceeded/);
  const net2 = capture(new Response("bad audio", { status: 422 }));
  await assert.rejects(
    speechToText(OPTS, { data: new Uint8Array([0]), contentType: "audio/webm" }, net2.fn),
    /ElevenLabs STT failed \(422\)/,
  );
});
