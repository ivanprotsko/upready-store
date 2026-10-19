/**
 * The stand: one Node process, no build. `node src/server.ts`.
 *
 *   GET  /            the chat page
 *   GET  /api/status  what runs live and what on fixtures (no keys in it)
 *   POST /api/text    { question, history } → answer + audio
 *   POST /api/voice   { audio (base64), contentType, history } → transcript + answer + audio
 *
 * The page shows the shop's sales, so once the owner data is live the stand
 * asks for `STAND_PASSWORD` (HTTP Basic, any user name) and refuses to start
 * without it.
 */
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import { type App, createApp } from "./app.ts";
import { describeConfig, readConfig } from "./config.ts";
import type { Audio } from "./elevenlabs.ts";
import type { ChatMessage } from "./model/types.ts";

const PAGE = fileURLToPath(new URL("./page.html", import.meta.url));
const MAX_BODY = 12 * 1024 * 1024;
const MAX_HISTORY = 8;

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

function send(res: ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8"): void {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

export function authorized(header: string | undefined, password: string | null): boolean {
  if (!password) return true;
  const [scheme, encoded] = (header ?? "").split(" ");
  if (scheme !== "Basic" || !encoded) return false;
  const given = Buffer.from(Buffer.from(encoded, "base64").toString("utf8").split(":").slice(1).join(":"));
  const wanted = Buffer.from(password);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export function handler(app: App, password: string | null) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (!authorized(req.headers.authorization, password)) {
        res.writeHead(401, { "www-authenticate": 'Basic realm="owner-voice"' });
        res.end();
        return;
      }
      const path = new URL(req.url ?? "/", "http://stand").pathname;
      if (req.method === "GET" && path === "/") return send(res, 200, readFileSync(PAGE, "utf8"), "text/html; charset=utf-8");
      if (req.method === "GET" && path === "/api/status") return send(res, 200, app.status());
      if (req.method === "POST" && path === "/api/text") {
        const body = await readJson(req);
        const question = typeof body.question === "string" ? body.question.trim() : "";
        if (!question) throw new HttpError(400, "Пустой вопрос.");
        const turn = await app.text(question.slice(0, 1000), parseHistory(body.history));
        return send(res, 200, { transcript: question, ...turn, ...encodeAudio(turn.audio) });
      }
      if (req.method === "POST" && path === "/api/voice") {
        const body = await readJson(req);
        const data = typeof body.audio === "string" ? Buffer.from(body.audio, "base64") : null;
        if (!data?.length) throw new HttpError(400, "Пустая аудиозапись.");
        const contentType = typeof body.contentType === "string" ? body.contentType : "audio/webm";
        const turn = await app.voice({ data: new Uint8Array(data), contentType }, parseHistory(body.history));
        return send(res, 200, { ...turn, ...encodeAudio(turn.audio) });
      }
      send(res, 404, { error: "Нет такого адреса." });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 502;
      const message = err instanceof Error ? err.message : "Ошибка";
      if (status >= 500) console.error("[owner-voice]", message);
      send(res, status, { error: message });
    }
  };
}

// Started as `node src/server.ts`, not imported by a test (`import.meta.main` is Node 24+ only).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = readConfig();
  const status = describeConfig(config);
  const password = process.env.STAND_PASSWORD?.trim() || null;
  if (status.ownerApi === "live" && !password) {
    console.error("[owner-voice] STAND_PASSWORD is required once the shop login is set: the page shows the shop's sales.");
    process.exit(1);
  }
  const app = createApp(config);
  createServer(handler(app, password)).listen(config.port, () => {
    console.log(`[owner-voice] http://localhost:${config.port}`, JSON.stringify(app.status()));
  });
}
