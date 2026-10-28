/**
 * The voice half: speech in, speech out. ElevenLabs when its key is set,
 * otherwise recorded fixtures, so the stand and the tests run without a key.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { type Audio, type ElevenLabsOptions, speechToText, textToSpeech } from "./elevenlabs.ts";
import type { FetchFn } from "./shop/api.ts";

export interface Voice {
  readonly mode: "live" | "fixture";
  transcribe(audio: Audio): Promise<string>;
  /** `voiceId` is already checked against the catalog; absent, the env default speaks. */
  speak(text: string, voiceId?: string): Promise<Audio>;
}

export class ElevenLabsVoice implements Voice {
  readonly mode = "live";
  readonly #opts: ElevenLabsOptions;
  readonly #fetch: FetchFn;

  constructor(opts: ElevenLabsOptions, fetchFn: FetchFn = fetch) {
    this.#opts = opts;
    this.#fetch = fetchFn;
  }

  transcribe(audio: Audio): Promise<string> {
    return speechToText(this.#opts, audio, this.#fetch);
  }

  speak(text: string, voiceId?: string): Promise<Audio> {
    return textToSpeech(this.#opts, text, this.#fetch, voiceId);
  }
}

const TRANSCRIPTS = fileURLToPath(new URL("../fixtures/voice/transcripts.json", import.meta.url));

export const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

/**
 * A short 16-bit mono WAV, one soft tone per sentence, so the page has
 * something to play. It is a placeholder for speech, not speech.
 */
export function placeholderWav(text: string): Uint8Array {
  const rate = 16_000;
  const sentences = Math.max(1, text.split(/[.!?]+/).filter((s) => s.trim()).length);
  const tone = 0.18;
  const gap = 0.12;
  const samples = Math.round(rate * sentences * (tone + gap));
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1) {
    const t = (i / rate) % (tone + gap);
    const value = t < tone ? Math.sin((2 * Math.PI * 660 * i) / rate) * 0.2 : 0;
    buf.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return new Uint8Array(buf);
}

/** The line the owner sees when speech runs on fixtures and a real recording comes in. */
export const VOICE_OFF = "Голос на этом стенде выключен, спросите текстом.";

/**
 * Speech is not available on this stand. The message is for the owner; the
 * technical cause is in `cause` and goes to the server log only.
 */
export class VoiceOffError extends Error {
  constructor(cause: string) {
    super(VOICE_OFF, { cause });
    this.name = "VoiceOffError";
  }
}

/** Answers from `fixtures/voice/transcripts.json`, keyed by the audio's sha256. */
export class FixtureVoice implements Voice {
  readonly mode = "fixture";

  async transcribe(audio: Audio): Promise<string> {
    const table = JSON.parse(readFileSync(TRANSCRIPTS, "utf8")) as Record<string, { text: string }>;
    const hit = table[sha256(audio.data)];
    if (!hit) {
      throw new VoiceOffError("no ELEVENLABS_API_KEY: speech runs on fixtures/voice and this recording is not among them");
    }
    return hit.text;
  }

  async speak(text: string): Promise<Audio> {
    return { data: placeholderWav(text), contentType: "audio/wav" };
  }
}
