/**
 * ElevenLabs speech-to-text and text-to-speech, ported from chrxnasdmds
 * `apps/storefront/src/lib/agent/elevenlabs.ts` (branch
 * feature/voice-widget-revive). Raw HTTPS, no SDK; the key is passed in and
 * stays on the server, and nothing is stored: chat audio is ephemeral.
 */
import { audioFormat } from "./files/index.ts";
import type { FetchFn } from "./shop/api.ts";

const API_BASE = "https://api.elevenlabs.io/v1";

export interface ElevenLabsOptions {
  apiKey: string;
  voiceId: string;
  ttsModelId: string;
  sttModelId: string;
  /** ISO-639-1 hint for both directions, e.g. "ru". */
  languageCode: string;
}

export interface Audio {
  data: Uint8Array;
  contentType: string;
  /** The file name speech-to-text is sent; absent, it follows the type. */
  name?: string;
}

const fail = async (what: string, res: Response): Promise<never> => {
  const detail = await res.text().catch(() => "");
  throw new Error(`ElevenLabs ${what} failed (${res.status}): ${detail.slice(0, 200)}`);
};

/** Transcribe one recorded turn with the "scribe" model. */
export async function speechToText(opts: ElevenLabsOptions, audio: Audio, fetchFn: FetchFn = fetch): Promise<string> {
  // Multipart: do not set content-type by hand, fetch derives the boundary from the FormData.
  const form = new FormData();
  // mp3, m4a, ogg, opus, wav or webm: the name tells the service the container.
  const name = audio.name ?? `speech.${audioFormat("", audio.contentType)?.ext ?? "webm"}`;
  form.append("file", new Blob([audio.data], { type: audio.contentType }), name);
  form.append("model_id", opts.sttModelId);
  form.append("language_code", opts.languageCode);

  const res = await fetchFn(`${API_BASE}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": opts.apiKey },
    body: form,
  });
  if (!res.ok) return fail("STT", res);
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

/** Speak a reply, in the voice chosen in the settings panel when one is given. */
export async function textToSpeech(opts: ElevenLabsOptions, text: string, fetchFn: FetchFn = fetch, voiceId: string = opts.voiceId): Promise<Audio> {
  const res = await fetchFn(`${API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: "POST",
    headers: {
      "xi-api-key": opts.apiKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: opts.ttsModelId,
      language_code: opts.languageCode,
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
    }),
  });
  if (!res.ok) return fail("TTS", res);
  return { data: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "audio/mpeg" };
}
