/**
 * The stand: one Node process, no build. `node src/server.ts`.
 *
 *   GET  /            the chat page
 *   GET  /api/status  what runs live and what on fixtures (no keys in it)
 *   POST /api/text    { question, history } → answer + audio
 *   POST /api/voice   { audio (base64), contentType, history } → transcript + answer + audio
 *                     both take `voiceId`, the voice chosen in the settings panel
 *
 *   GET  /api/commands            the command map, for the palette
 *   POST /api/commands/run        { id, params, product, order, body } → result, link or proposal
 *   GET  /api/commands/pick?id=   the rows a command's `{id}` is picked from
 *   POST /api/commands/confirm    { proposalId } → the dry-run: the exact request, never sent
 *
 *   GET  /api/voices?language=&q=&gender=&accent=&source=   the ElevenLabs catalog (reads only)
 *   POST /api/voices/add          { voiceId } → refused unless ELEVENLABS_ALLOW_ADD_VOICE=1
 *   GET  /api/voices/sample.wav   the fixture catalog's placeholder preview
 *
 *   GET  /assistant               the buyer assistant page
 *   POST /api/assistant/text      { question, history } → answer (public catalog only)
 *   POST /api/assistant/voice     { audio, contentType, history } → transcript + answer
 *
 * Once anything real is behind the page, the stand asks for `STAND_PASSWORD`
 * (HTTP Basic, any user name) and refuses to start without it: the shop login
 * shows the shop's sales, and an ElevenLabs or Anthropic key spends paid
 * credits on every visitor's question.
 */
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import { type App, createApp } from "./app.ts";
import { type Config, readConfig } from "./config.ts";
import type { Audio } from "./elevenlabs.ts";
import type { ChatMessage } from "./model/types.ts";
import { placeholderWav, VoiceOffError } from "./voice.ts";
import { VoiceError, type VoiceFilter } from "./voices.ts";

const PAGE = fileURLToPath(new URL("./page.html", import.meta.url));
const ASSISTANT_PAGE = fileURLToPath(new URL("./assistant.html", import.meta.url));
const MAX_BODY = 12 * 1024 * 1024;
const MAX_HISTORY = 8;
/** What the owner sees when something behind the page failed. */
export const SORRY = "Сейчас не получилось ответить. Попробуйте ещё раз чуть позже.";

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "Слишком длинная запись.");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Ожидается JSON.");
  }
}

/** Only plain user and assistant lines come back from the page, the last few. */
export function parseHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is { role: "user" | "assistant"; text: string } =>
        typeof m === "object" && m !== null && (m.role === "user" || m.role === "assistant") && typeof m.text === "string",
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, text: m.text.slice(0, 1000) }));
}

const encodeAudio = (audio: Audio | null) =>
  audio ? { audio: Buffer.from(audio.data).toString("base64"), audioType: audio.contentType } : { audio: null, audioType: null };

const audioIn = (body: Record<string, unknown>): Audio => {
  const data = typeof body.audio === "string" ? Buffer.from(body.audio, "base64") : null;
  if (!data?.length) throw new HttpError(400, "Пустая аудиозапись.");
  return { data: new Uint8Array(data), contentType: typeof body.contentType === "string" ? body.contentType : "audio/webm" };
};

const questionIn = (body: Record<string, unknown>): string => {
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) throw new HttpError(400, "Пустой вопрос.");
  return question.slice(0, 1000);
};

const objectIn = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const voiceFilter = (params: URLSearchParams): VoiceFilter => {
  const pick = (name: string, max = 60) => params.get(name)?.trim().slice(0, max) || undefined;
  const source = pick("source");
  return {
    language: pick("language", 5),
    q: pick("q"),
    gender: pick("gender", 10),
    accent: pick("accent", 30),
    source: source === "account" || source === "library" ? source : "all",
  };
};

function send(res: ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8"): void {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body));
}

export function authorized(header: string | undefined, password: string | null): boolean {
  if (!password) return true;
  const [scheme, encoded] = (header ?? "").split(" ");
  if (scheme !== "Basic" || !encoded) return false;
  const given = Buffer.from(Buffer.from(encoded, "base64").toString("utf8").split(":").slice(1).join(":"));
  const wanted = Buffer.from(password);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** What makes the stand need a password; empty when it runs on fixtures only. */
export function passwordReasons(config: Config): string[] {
  const reasons: string[] = [];
  if (config.shop.login) reasons.push("SHOP_LOGIN_EMAIL/SHOP_LOGIN_PASSWORD (the shop's sales)");
  if (config.elevenlabs.apiKey) reasons.push("ELEVENLABS_API_KEY (paid speech)");
  if (config.model.anthropicKey) reasons.push("ANTHROPIC_API_KEY (paid model calls)");
  return reasons;
}

export function handler(app: App, password: string | null) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (!authorized(req.headers.authorization, password)) {
        res.writeHead(401, { "www-authenticate": 'Basic realm="owner-voice"' });
        res.end();
        return;
      }
      const url = new URL(req.url ?? "/", "http://stand");
      const path = url.pathname;
      if (req.method === "GET" && path === "/") return send(res, 200, readFileSync(PAGE, "utf8"), "text/html; charset=utf-8");
      if (req.method === "GET" && path === "/assistant") return send(res, 200, readFileSync(ASSISTANT_PAGE, "utf8"), "text/html; charset=utf-8");
      if (req.method === "GET" && path === "/api/status") return send(res, 200, app.status());
      if (req.method === "POST" && path === "/api/text") {
        const body = await readJson(req);
        const question = questionIn(body);
        const turn = await app.text(question, parseHistory(body.history), body.voiceId);
        return send(res, 200, { transcript: question, ...turn, ...encodeAudio(turn.audio) });
      }
      if (req.method === "POST" && path === "/api/voice") {
        const body = await readJson(req);
        const turn = await app.voice(audioIn(body), parseHistory(body.history), body.voiceId);
        return send(res, 200, { ...turn, ...encodeAudio(turn.audio) });
      }

      if (req.method === "GET" && path === "/api/commands") return send(res, 200, { commands: app.commands.list(), panelUrl: app.commands.panelUrl });
      if (req.method === "GET" && path === "/api/commands/pick") return send(res, 200, { rows: await app.commands.pick(url.searchParams.get("id") ?? "") });
      if (req.method === "POST" && path === "/api/commands/run") {
        const body = await readJson(req);
        if (typeof body.id !== "string" || !body.id) throw new HttpError(400, "Нет id команды.");
        const { text, card } = await app.commands.run(body.id, {
          params: objectIn(body.params),
          body: objectIn(body.body),
          product: typeof body.product === "string" ? body.product : undefined,
          order: typeof body.order === "string" || typeof body.order === "number" ? body.order : undefined,
        });
        return send(res, 200, { reply: text, cards: card ? [card] : [] });
      }
      if (req.method === "POST" && path === "/api/commands/confirm") {
        const body = await readJson(req);
        const done = app.commands.confirm(typeof body.proposalId === "string" ? body.proposalId : "");
        if (!done) throw new HttpError(410, "Предложение устарело или уже подтверждено. Попросите заново.");
        return send(res, 200, done);
      }

      if (req.method === "GET" && path === "/api/voices") return send(res, 200, await app.voices.list(voiceFilter(url.searchParams)));
      if (req.method === "GET" && path === "/api/voices/sample.wav") return send(res, 200, Buffer.from(placeholderWav("Образец.")), "audio/wav");
      if (req.method === "POST" && path === "/api/voices/add") {
        const body = await readJson(req);
        await app.voices.add(typeof body.voiceId === "string" ? body.voiceId : "");
        return send(res, 200, { added: true });
      }

      if (req.method === "POST" && path === "/api/assistant/text") {
        const body = await readJson(req);
        const question = questionIn(body);
        const turn = await app.assistant.text(question, parseHistory(body.history));
        return send(res, 200, { transcript: question, ...turn, ...encodeAudio(turn.audio) });
      }
      if (req.method === "POST" && path === "/api/assistant/voice") {
        const body = await readJson(req);
        const turn = await app.assistant.voice(audioIn(body), parseHistory(body.history));
        return send(res, 200, { ...turn, ...encodeAudio(turn.audio) });
      }
      send(res, 404, { error: "Нет такого адреса." });
    } catch (err) {
      // The owner sees a plain sentence; the cause (keys, codes, paths) stays in the log.
      if (err instanceof HttpError || err instanceof VoiceError) return send(res, err.status, { error: err.message });
      if (err instanceof VoiceOffError) {
        console.error("[owner-voice] voice off:", err.cause);
        return send(res, 409, { error: err.message });
      }
      console.error("[owner-voice]", err instanceof Error ? err.message : err);
      send(res, 502, { error: SORRY });
    }
  };
}

// Started as `node src/server.ts`, not imported by a test (`import.meta.main` is Node 24+ only).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = readConfig();
  const password = process.env.STAND_PASSWORD?.trim() || null;
  const reasons = passwordReasons(config);
  if (reasons.length && !password) {
    console.error(`[owner-voice] STAND_PASSWORD is required when any of these is set: ${reasons.join(", ")}.`);
    process.exit(1);
  }
  const app = createApp(config);
  createServer(handler(app, password)).listen(config.port, () => {
    console.log(`[owner-voice] http://localhost:${config.port}`, JSON.stringify(app.status()));
  });
}
