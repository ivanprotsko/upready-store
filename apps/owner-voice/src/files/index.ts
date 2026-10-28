/**
 * The owner's files: the paperclip and drag-and-drop of the chat, and voice
 * messages. PDF, pictures, text and CSV up to 20 MB; audio as mp3, m4a, ogg,
 * opus, wav or webm.
 *
 * What the model may read is the file's text with buyers' contacts, names and
 * addresses masked first (`pii.ts`), cut to a length a turn can carry. A PDF
 * with no text layer is named a scan and nothing is made up for it.
 *
 * Storage (architecture §7): the file and its text sit in `DATA_DIR/files`
 * for `FILES_TTL_HOURS` (24 by default) and are then deleted by the sweep the
 * server runs at start and every hour. Nothing leaves the stand except the
 * audio sent to speech-to-text.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { maskBuyerText } from "../pii.ts";
import { extractPdfText } from "./pdf.ts";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** The text of one file the model reads in a turn, after masking. */
export const MAX_FILE_TEXT = 8000;

export type FileKind = "pdf" | "image" | "text" | "csv" | "audio";

const KINDS: { kind: FileKind; ext: string[]; types: RegExp }[] = [
  { kind: "pdf", ext: ["pdf"], types: /^application\/pdf$/ },
  { kind: "image", ext: ["png", "jpg", "jpeg", "webp", "gif"], types: /^image\/(png|jpeg|webp|gif)$/ },
  { kind: "csv", ext: ["csv"], types: /^(text\/csv|application\/csv|application\/vnd\.ms-excel)$/ },
  { kind: "text", ext: ["txt", "md"], types: /^text\/(plain|markdown)$/ },
  { kind: "audio", ext: ["mp3", "m4a", "ogg", "oga", "opus", "wav", "webm"], types: /^(audio|video)\/(mpeg|mp3|mp4|x-m4a|m4a|aac|ogg|opus|wav|x-wav|wave|webm)$/ },
];

/** The kind of an upload by its name, then its type; null for anything else. */
export function kindOf(name: string, type: string): FileKind | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  const base = type.split(";")[0]!.trim().toLowerCase();
  return KINDS.find((k) => (ext && k.ext.includes(ext)) || k.types.test(base))?.kind ?? null;
}

/** The audio container speech-to-text is told, from the name or the type. */
export function audioFormat(name: string, type: string): { ext: string; contentType: string } | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  const base = type.split(";")[0]!.trim().toLowerCase();
  const by: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", webm: "audio/webm" };
  if (ext && by[ext]) return { ext: ext === "oga" ? "ogg" : ext, contentType: by[ext]! };
  if (/mpeg|mp3/.test(base)) return { ext: "mp3", contentType: "audio/mpeg" };
  if (/mp4|m4a|aac/.test(base)) return { ext: "m4a", contentType: "audio/mp4" };
  if (/opus/.test(base)) return { ext: "opus", contentType: "audio/ogg" };
  if (/ogg/.test(base)) return { ext: "ogg", contentType: "audio/ogg" };
  if (/wav|wave/.test(base)) return { ext: "wav", contentType: "audio/wav" };
  if (/webm/.test(base)) return { ext: "webm", contentType: "audio/webm" };
  return null;
}

export interface StoredFile {
  id: string;
  name: string;
  type: string;
  kind: FileKind;
  size: number;
  createdAt: string;
  /** PDF only. */
  pages?: number;
  scan?: boolean;
  encrypted?: boolean;
  /** The text as the model may read it: masked and cut. Absent for pictures and audio. */
  text?: string;
  /** How long the text was before the cut. */
  textLength?: number;
  /** Audio only: what speech-to-text heard, masked the same way. */
  transcript?: string;
}

export class FileError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const safeName = (name: string): string => name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 120) || "file";

export class FileStore {
  readonly #dir: string;
  readonly #ttlHours: number;

  constructor(dataDir: string, ttlHours: number) {
    this.#dir = join(dataDir, "files");
    this.#ttlHours = ttlHours;
  }

  /** Keep an upload and read its text; refuses other types and anything past 20 MB. */
  save(rawName: string, type: string, data: Uint8Array): StoredFile {
    const name = safeName(rawName);
    if (!data.length) throw new FileError(400, "Пустой файл.");
    if (data.length > MAX_FILE_BYTES) throw new FileError(413, "Файл больше 20 МБ.");
    const kind = kindOf(name, type);
    if (!kind) throw new FileError(415, "Такой файл я не читаю. Подойдут PDF, картинка, текст, CSV или аудио.");
    const meta: StoredFile = { id: `file_${randomUUID().replace(/-/g, "").slice(0, 16)}`, name, type: type || "application/octet-stream", kind, size: data.length, createdAt: new Date().toISOString() };
    if (kind === "pdf") {
      try {
        const pdf = extractPdfText(data);
        Object.assign(meta, { pages: pdf.pages, scan: pdf.scan, encrypted: pdf.encrypted });
        if (pdf.text) this.#withText(meta, pdf.text);
      } catch {
        throw new FileError(415, "Это не похоже на PDF: файл не открылся.");
      }
    } else if (kind === "text" || kind === "csv") {
      this.#withText(meta, new TextDecoder("utf-8").decode(data));
    }
    mkdirSync(this.#dir, { recursive: true });
    writeFileSync(join(this.#dir, `${meta.id}.bin`), data);
    this.#write(meta);
    return meta;
  }

  #withText(meta: StoredFile, text: string): void {
    const masked = maskBuyerText(text.replace(/\r\n/g, "\n"));
    meta.textLength = masked.length;
    meta.text = masked.slice(0, MAX_FILE_TEXT);
  }

  #write(meta: StoredFile): void {
    writeFileSync(join(this.#dir, `${meta.id}.json`), JSON.stringify(meta));
  }

  get(id: string): StoredFile | null {
    if (!/^file_[a-f0-9]{16}$/.test(id)) return null;
    const file = join(this.#dir, `${id}.json`);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as StoredFile) : null;
  }

  bytes(id: string): Uint8Array | null {
    const meta = this.get(id);
    const file = meta ? join(this.#dir, `${id}.bin`) : null;
    return file && existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
  }

  /** Keep what speech-to-text heard, masked; the page offers it as .txt. */
  setTranscript(id: string, transcript: string): StoredFile | null {
    const meta = this.get(id);
    if (!meta) return null;
    meta.transcript = maskBuyerText(transcript);
    this.#write(meta);
    return meta;
  }

  /** Delete every file older than the TTL, its text and transcript with it. */
  sweep(now = Date.now()): number {
    if (!existsSync(this.#dir)) return 0;
    let removed = 0;
    for (const name of readdirSync(this.#dir)) {
      const path = join(this.#dir, name);
      if (now - statSync(path).mtimeMs < this.#ttlHours * 3_600_000) continue;
      unlinkSync(path);
      if (name.endsWith(".json")) removed += 1;
    }
    return removed;
  }
}

/** What the model reads of a file, in one block after the owner's question. */
export function fileForModel(meta: StoredFile): string {
  const head = `Файл «${meta.name}»`;
  if (meta.kind === "pdf" && meta.encrypted) return `${head}: PDF защищён паролем, текст не прочитан.`;
  if (meta.kind === "pdf" && meta.scan) return `${head}: скан без текстового слоя, ${meta.pages} стр.; текст из него не прочитан.`;
  if (meta.text) return `${head}${meta.pages ? `, ${meta.pages} стр.` : ""}${(meta.textLength ?? 0) > meta.text.length ? `, показано ${meta.text.length} из ${meta.textLength} знаков` : ""}:\n${meta.text}`;
  if (meta.kind === "image") return `${head}: картинка (id ${meta.id}), ${Math.round(meta.size / 1024)} КБ. Её содержимое я не вижу; обработать её можно инструментом edit_photo.`;
  if (meta.transcript) return `${head}: голосовое сообщение. Расшифровка:\n${meta.transcript}`;
  return `${head}: текста нет.`;
}
