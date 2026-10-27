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
 *   POST /api/commands/confirm    { proposalId } → the dry-run: the exact request, never sent;
 *                                 with CHANGESETS=1 the changeset on stage and its card
 *
 *   GET  /api/changesets                    the last changesets, as a card ("что изменено")
 *   POST /api/changesets/intent             { action: publish|rollback, id? } → the confirm card
 *   POST /api/changesets/:id/publish|rollback|discard   the confirmed action; drift → the diff
 *
 *   GET  /api/images/:id.<ext>    a generated or edited picture (svg|png|jpg|webp|gif); no password, the site links to it
 *   POST /api/images/:id/act      { action: edit-bg|edit-light|redo|cancel|pick-photo } → a card
 *   POST /api/images/:id/place    { target: product|banner, product } → a proposal
 *
 *   POST /api/files?name=&type=   the raw file, up to 20 MB → its card and id
 *   POST /api/files/:id/voice     { history, voiceId } → transcript card + answer
 *   GET  /api/files/:id/transcript.txt
 *   GET  /fixtures/files/*, /fixtures/voice/*   the test files, for the evidence scenes; on fixtures only
 *                     /api/text also takes `files`: ids attached to the question
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
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import { type App, createApp } from "./app.ts";
import { type Config, readConfig } from "./config.ts";
import type { Audio } from "./elevenlabs.ts";
import { FileError, MAX_FILE_BYTES } from "./files/index.ts";
import type { ChatMessage } from "./model/types.ts";
import { placeholderWav, VoiceOffError } from "./voice.ts";
import { VoiceError, type VoiceFilter } from "./voices.ts";

const PAGE = fileURLToPath(new URL("./page.html", import.meta.url));
const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));
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

async function readRaw(req: IncomingMessage, max: number, tooBig: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > max) throw new HttpError(413, tooBig);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
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

/** Ids of uploads attached to a question; a file alone asks what is in it. */
const filesIn = (body: Record<string, unknown>): string[] =>
  Array.isArray(body.files) ? body.files.filter((f): f is string => typeof f === "string").slice(0, 5) : [];

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
      const early = new URL(req.url ?? "/", "http://stand");
      // A generated picture is fetched by the site once placed: no password, the id is random.
      const image = req.method === "GET" ? /^\/api\/images\/(img_[a-f0-9]{16})\.(?:svg|png|jpg|webp|gif)$/.exec(early.pathname) : null;
      if (image) {
        const found = app.images.read(image[1]!);
        if (!found) return send(res, 404, { error: "Картинки уже нет." });
        res.writeHead(200, { "content-type": found.contentType, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" });
        res.end(found.data);
        return;
      }
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
      // The scenes of the evidence screens attach the repo's test files; a stand with a real shop does not serve them.
      const fixture = req.method === "GET" ? /^\/fixtures\/(files|voice)\/([a-z0-9-]+\.(pdf|wav|png))$/.exec(path) : null;
      if (fixture) {
        const status = app.status();
        if (status.storeApi !== "fixture" || status.ownerApi !== "fixture") throw new HttpError(404, "Нет такого адреса.");
        const file = `${FIXTURES}${fixture[1]}/${fixture[2]}`;
        if (!existsSync(file)) throw new HttpError(404, "Нет такого файла.");
        return send(res, 200, readFileSync(file), fixture[3] === "pdf" ? "application/pdf" : fixture[3] === "png" ? "image/png" : "audio/wav");
      }
      if (req.method === "POST" && path === "/api/text") {
        const body = await readJson(req);
        const files = filesIn(body);
        const question = files.length && !(typeof body.question === "string" && body.question.trim()) ? "Что в этом файле?" : questionIn(body);
        const turn = await app.text(question, parseHistory(body.history), body.voiceId, files);
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
        const done = await app.commands.confirm(typeof body.proposalId === "string" ? body.proposalId : "");
        if (!done) throw new HttpError(410, "Предложение устарело или уже подтверждено. Попросите заново.");
        // Stage 2's dry-run as it was; with changesets, the card of what is now on stage.
        if ("sent" in done) return send(res, 200, done);
        return send(res, 200, { reply: done.text, cards: done.card ? [done.card] : [], changeset: done.changeset ?? null });
      }

      if (path === "/api/changesets" || path.startsWith("/api/changesets/")) {
        const changes = app.changes;
        if (!changes) throw new HttpError(409, "Изменения через stage выключены на этом стенде (CHANGESETS=1 включает).");
        let out;
        const act = /^\/api\/changesets\/([A-Za-z0-9_-]{1,80})\/(publish|rollback|discard)$/.exec(path);
        if (req.method === "GET" && path === "/api/changesets") out = await changes.list(Number(url.searchParams.get("limit")) || 5);
        else if (req.method === "POST" && path === "/api/changesets/intent") {
          const body = await readJson(req);
          if (body.action !== "publish" && body.action !== "rollback") throw new HttpError(400, "Нужно действие: publish или rollback.");
          out = await changes.prepare(body.action, typeof body.id === "string" && body.id ? body.id : undefined);
        } else if (req.method === "POST" && act) out = await changes.run(act[2] as "publish" | "rollback" | "discard", act[1]!);
        else throw new HttpError(404, "Нет такого адреса.");
        return send(res, 200, { reply: out.text, cards: out.card ? [out.card] : [], changeset: out.changeset ?? null });
      }

      const place = req.method === "POST" ? /^\/api\/images\/(img_[a-f0-9]{16})\/place$/.exec(path) : null;
      if (place) {
        const body = await readJson(req);
        if (body.target !== "product" && body.target !== "banner") throw new HttpError(400, "Куда поставить: на товар или на баннер.");
        const out = await app.images.place(place[1]!, body.target, typeof body.product === "string" ? body.product : undefined);
        return send(res, 200, { reply: out.text, cards: out.card ? [out.card] : [] });
      }

      const act = req.method === "POST" ? /^\/api\/images\/(img_[a-f0-9]{16}|file_[a-f0-9]{16})\/act$/.exec(path) : null;
      if (act) {
        const body = await readJson(req);
        const actions = ["edit-bg", "edit-light", "redo", "cancel", "pick-photo"];
        if (typeof body.action !== "string" || !actions.includes(body.action)) throw new HttpError(400, "Такого действия нет.");
        const out = await app.images.act(act[1]!, body.action);
        return send(res, 200, { reply: out.text, cards: out.card ? [out.card] : [] });
      }

      if (req.method === "POST" && path === "/api/files") {
        const data = await readRaw(req, MAX_FILE_BYTES, "Файл больше 20 МБ.");
        const name = (url.searchParams.get("name") ?? "file").slice(0, 200);
        const file = app.files.save(name, url.searchParams.get("type") ?? req.headers["content-type"] ?? "", new Uint8Array(data));
        const { text: _text, transcript: _transcript, ...meta } = file;
        return send(res, 200, { file: meta });
      }
      const voiceNote = req.method === "POST" ? /^\/api\/files\/(file_[a-f0-9]{16})\/voice$/.exec(path) : null;
      if (voiceNote) {
        const body = await readJson(req);
        const turn = await app.voiceNote(voiceNote[1]!, parseHistory(body.history), body.voiceId);
        return send(res, 200, { ...turn, ...encodeAudio(turn.audio) });
      }
      const transcript = req.method === "GET" ? /^\/api\/files\/(file_[a-f0-9]{16})\/transcript\.txt$/.exec(path) : null;
      if (transcript) {
        const file = app.files.get(transcript[1]!);
        if (!file?.transcript) throw new HttpError(404, "Расшифровки нет: запись удалена или ещё не распознана.");
        res.writeHead(200, {
          "content-type": "text/plain; charset=utf-8",
          "content-disposition": `attachment; filename="transcript-${file.id}.txt"`,
          "cache-control": "no-store",
        });
        res.end(`${file.transcript}\n`);
        return;
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
      if (err instanceof HttpError || err instanceof VoiceError || err instanceof FileError) return send(res, err.status, { error: err.message });
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
  // Files and previews past their TTL go at start and every hour (architecture §7).
  const sweep = () => {
    const gone = app.sweep();
    if (gone.files || gone.images) console.log(`[owner-voice] swept ${gone.files} files, ${gone.images} images`);
  };
  sweep();
  setInterval(sweep, 3_600_000).unref();
  createServer(handler(app, password)).listen(config.port, () => {
    console.log(`[owner-voice] http://localhost:${config.port}`, JSON.stringify(app.status()));
  });
}
