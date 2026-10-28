/**
 * The ElevenLabs voice catalog for the voice settings panel (Do 9, Ivan 27.10:
 * «сделай настройки выбора голоса из каталога с фильтрацией по языкам»).
 *
 *   - the account's voices: `GET /v2/voices`;
 *   - the public voice library: `GET /v1/shared-voices`, which filters by
 *     language, gender, accent and a search word on the server.
 *
 * Both are reads. A library voice speaks only after it is added to the
 * account, `POST /v1/voices/add/{public_user_id}/{voice_id}`, and that is a
 * write to the owner's outside account: it stays off unless
 * `ELEVENLABS_ALLOW_ADD_VOICE=1`, and until then such a voice shows as
 * «нужно добавить в аккаунт» and is refused for speech.
 *
 * The key lives here and in `elevenlabs.ts` only; nothing this module returns
 * carries it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { FetchFn } from "./shop/api.ts";

const API = "https://api.elevenlabs.io";

/** The languages ElevenLabs' multilingual models speak, by ISO-639-1 code, named in Russian. */
export const LANGUAGES_RU: Record<string, string> = {
  ru: "Русский",
  en: "Английский",
  uk: "Украинский",
  kk: "Казахский",
  de: "Немецкий",
  fr: "Французский",
  es: "Испанский",
  it: "Итальянский",
  pt: "Португальский",
  pl: "Польский",
  cs: "Чешский",
  sk: "Словацкий",
  bg: "Болгарский",
  hr: "Хорватский",
  ro: "Румынский",
  hu: "Венгерский",
  el: "Греческий",
  nl: "Нидерландский",
  sv: "Шведский",
  da: "Датский",
  no: "Норвежский",
  fi: "Финский",
  tr: "Турецкий",
  ar: "Арабский",
  hi: "Хинди",
  ta: "Тамильский",
  id: "Индонезийский",
  ms: "Малайский",
  fil: "Филиппинский",
  vi: "Вьетнамский",
  zh: "Китайский",
  ja: "Японский",
  ko: "Корейский",
};

/** Some voices name a language in English instead of a code. */
const LANGUAGE_CODES: Record<string, string> = Object.fromEntries(
  Object.entries({
    russian: "ru", english: "en", ukrainian: "uk", kazakh: "kk", german: "de", french: "fr", spanish: "es", italian: "it",
    portuguese: "pt", polish: "pl", czech: "cs", slovak: "sk", bulgarian: "bg", croatian: "hr", romanian: "ro", hungarian: "hu",
    greek: "el", dutch: "nl", swedish: "sv", danish: "da", norwegian: "no", finnish: "fi", turkish: "tr", arabic: "ar",
    hindi: "hi", tamil: "ta", indonesian: "id", malay: "ms", filipino: "fil", vietnamese: "vi", chinese: "zh", japanese: "ja", korean: "ko",
  }),
);

export const GENDERS_RU: Record<string, string> = { female: "женский", male: "мужской", neutral: "нейтральный" };

export function languageCode(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const value = raw.trim().toLowerCase();
  const short = value.split(/[-_]/)[0]!;
  if (short in LANGUAGES_RU) return short;
  return LANGUAGE_CODES[value] ?? null;
}

export interface VoiceEntry {
  id: string;
  name: string;
  source: "account" | "library";
  /** Language codes the voice is verified or labeled for; empty when the voice says nothing. */
  languages: string[];
  gender: string | null;
  accent: string | null;
  age: string | null;
  description: string | null;
  /** A short sample; a public URL on ElevenLabs' storage, needs no key. */
  previewUrl: string | null;
  /** A library voice that speaks only after it is added to the account. */
  needsAdd: boolean;
  /** For a library voice: whose it is, which the add request names. */
  publicOwnerId?: string;
}

export interface VoiceFilter {
  language?: string | undefined;
  q?: string | undefined;
  gender?: string | undefined;
  accent?: string | undefined;
  source?: "account" | "library" | "all" | undefined;
}

type Row = Record<string, unknown>;
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

function languagesOf(row: Row, labels: Row): string[] {
  const found = new Set<string>();
  for (const v of (row.verified_languages as Row[] | undefined) ?? []) {
    const code = languageCode(v.language) ?? languageCode(v.locale);
    if (code) found.add(code);
  }
  for (const raw of [row.language, labels.language, row.locale]) {
    const code = languageCode(raw);
    if (code) found.add(code);
  }
  return [...found];
}

/** One `GET /v2/voices` row. */
export function fromAccount(row: Row): VoiceEntry {
  const labels = (row.labels ?? {}) as Row;
  return {
    id: String(row.voice_id),
    name: text(row.name) ?? String(row.voice_id),
    source: "account",
    languages: languagesOf(row, labels),
    gender: text(labels.gender),
    accent: text(labels.accent),
    age: text(labels.age),
    description: text(row.description) ?? text(labels.description),
    previewUrl: text(row.preview_url),
    needsAdd: false,
  };
}

/** One `GET /v1/shared-voices` row. */
export function fromLibrary(row: Row, accountIds: Set<string>): VoiceEntry {
  const id = String(row.voice_id);
  const added = row.is_added_by_user === true || accountIds.has(id);
  return {
    id,
    name: text(row.name) ?? id,
    source: "library",
    languages: languagesOf(row, {}),
    gender: text(row.gender),
    accent: text(row.accent),
    age: text(row.age),
    description: text(row.description),
    previewUrl: text(row.preview_url),
    needsAdd: !added,
    ...(text(row.public_owner_id) ? { publicOwnerId: text(row.public_owner_id)! } : {}),
  };
}

const fold = (value: string): string => value.toLowerCase().replace(/ё/g, "е");

/** The filters on a list already read: what the library does on the server, done here for the account's voices. */
export function filterVoices(voices: VoiceEntry[], filter: VoiceFilter): VoiceEntry[] {
  const q = filter.q ? fold(filter.q) : null;
  return voices.filter(
    (v) =>
      // A voice that names no language (an owner's clone, often) stays under every language.
      (!filter.language || !v.languages.length || v.languages.includes(filter.language)) &&
      (!q || fold(`${v.name} ${v.description ?? ""}`).includes(q)) &&
      (!filter.gender || v.gender === filter.gender) &&
      (!filter.accent || fold(v.accent ?? "") === fold(filter.accent)),
  );
}

export class VoiceError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface CatalogOptions {
  /** Null: the catalog comes from `fixtures/voice/catalog.json`, through the same mapping. */
  apiKey: string | null;
  defaultVoiceId: string;
  /** `ELEVENLABS_ALLOW_ADD_VOICE=1`; off by default. */
  allowAdd: boolean;
}

const CACHE_MS = 10 * 60_000;
const FIXTURE = fileURLToPath(new URL("../fixtures/voice/catalog.json", import.meta.url));

/** Answers the two catalog reads from the recorded shapes, for a stand and tests with no key. */
export function catalogFixtureFetch(): FetchFn {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if ((init?.method ?? "GET").toUpperCase() !== "GET") return new Response("{}", { status: 405 });
    const data = JSON.parse(readFileSync(FIXTURE, "utf8")) as { account: Row; library: Row };
    if (url.pathname === "/v2/voices") return Response.json(data.account);
    if (url.pathname === "/v1/shared-voices") {
      // The library filters on the server; the fixture does the same three filters.
      const p = url.searchParams;
      const rows = ((data.library.voices as Row[] | undefined) ?? []).filter(
        (v) =>
          (!p.get("language") || v.language === p.get("language") || ((v.verified_languages as Row[] | undefined) ?? []).some((l) => l.language === p.get("language"))) &&
          (!p.get("gender") || v.gender === p.get("gender")) &&
          (!p.get("accent") || v.accent === p.get("accent")) &&
          (!p.get("search") || fold(String(v.name)).includes(fold(p.get("search")!))),
      );
      return Response.json({ voices: rows, has_more: false, total_count: rows.length });
    }
    return new Response("{}", { status: 404 });
  };
}

export class VoiceCatalog {
  readonly #opts: CatalogOptions;
  readonly #fetch: FetchFn;
  readonly #now: () => number;
  #account: { at: number; voices: VoiceEntry[] } | null = null;
  readonly #library = new Map<string, { at: number; voices: VoiceEntry[] }>();

  constructor(opts: CatalogOptions, fetchFn: FetchFn = fetch, now: () => number = Date.now) {
    this.#opts = opts;
    this.#fetch = opts.apiKey ? fetchFn : catalogFixtureFetch();
    this.#now = now;
  }

  get mode(): "live" | "fixture" {
    return this.#opts.apiKey ? "live" : "fixture";
  }

  get defaultVoiceId(): string {
    return this.#opts.defaultVoiceId;
  }

  get allowAdd(): boolean {
    return this.#opts.allowAdd;
  }

  async #get(path: string, params: Record<string, string | number | undefined>): Promise<Row> {
    const url = new URL(path, API);
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    const res = await this.#fetch(url, { method: "GET", headers: this.#opts.apiKey ? { "xi-api-key": this.#opts.apiKey } : {} });
    if (!res.ok) throw new Error(`ElevenLabs GET ${url.pathname} failed (${res.status})`);
    return (await res.json()) as Row;
  }

  /** The account's voices, up to three pages of a hundred, kept ten minutes. */
  async account(): Promise<VoiceEntry[]> {
    if (this.#account && this.#now() - this.#account.at < CACHE_MS) return this.#account.voices;
    const voices: VoiceEntry[] = [];
    let token: string | undefined;
    for (let page = 0; page < 3; page += 1) {
      const body = await this.#get("/v2/voices", { page_size: 100, next_page_token: token });
      voices.push(...((body.voices as Row[] | undefined) ?? []).map(fromAccount));
      token = text(body.next_page_token) ?? undefined;
      if (body.has_more !== true || !token) break;
    }
    this.#account = { at: this.#now(), voices };
    return voices;
  }

  /** One page of the public library for these filters. */
  async library(filter: VoiceFilter): Promise<VoiceEntry[]> {
    const key = JSON.stringify([filter.language, filter.q, filter.gender, filter.accent]);
    const hit = this.#library.get(key);
    if (hit && this.#now() - hit.at < CACHE_MS) return hit.voices;
    const ids = new Set((await this.account()).map((v) => v.id));
    const body = await this.#get("/v1/shared-voices", {
      page_size: 30,
      language: filter.language,
      search: filter.q,
      gender: filter.gender,
      accent: filter.accent,
    });
    const voices = ((body.voices as Row[] | undefined) ?? []).map((row) => fromLibrary(row, ids));
    this.#library.set(key, { at: this.#now(), voices });
    return voices;
  }

  /** What the settings panel lists: the account first, then the library. */
  async list(filter: VoiceFilter) {
    const source = filter.source ?? "all";
    const account = source === "library" ? [] : filterVoices(await this.account(), filter);
    const shown = new Set(account.map((v) => v.id));
    const library = source === "account" ? [] : (await this.library(filter)).filter((v) => !shown.has(v.id));
    const voices = [...account, ...library];
    return {
      mode: this.mode,
      defaultVoiceId: this.defaultVoiceId,
      allowAdd: this.allowAdd,
      languages: LANGUAGES_RU,
      genders: GENDERS_RU,
      accents: [...new Set(voices.map((v) => v.accent).filter((a): a is string => !!a))].sort(),
      voices,
    };
  }

  /**
   * The voice an answer is spoken with. No choice: the env default. A voice of
   * the account: that voice. A library voice not added yet: refused (409),
   * anything else: refused (400).
   */
  async resolve(voiceId: unknown): Promise<string> {
    if (voiceId === undefined || voiceId === null || voiceId === "") return this.defaultVoiceId;
    if (typeof voiceId !== "string" || !/^[A-Za-z0-9]{8,40}$/.test(voiceId)) throw new VoiceError(400, "Такого голоса нет в каталоге.");
    if (voiceId === this.defaultVoiceId) return voiceId;
    if ((await this.account()).some((v) => v.id === voiceId)) return voiceId;
    for (const page of this.#library.values()) {
      if (page.voices.some((v) => v.id === voiceId && v.needsAdd)) throw new VoiceError(409, "Этот голос нужно добавить в аккаунт ElevenLabs.");
    }
    throw new VoiceError(400, "Такого голоса нет в каталоге.");
  }

  /** Adds a library voice to the account: the one write here, off unless the env allows it. */
  async add(voiceId: string, fetchFn: FetchFn = this.#fetch): Promise<void> {
    if (!this.#opts.allowAdd || !this.#opts.apiKey) throw new VoiceError(403, "Добавление голосов в аккаунт выключено (ELEVENLABS_ALLOW_ADD_VOICE=0).");
    let found: VoiceEntry | undefined;
    for (const page of this.#library.values()) found ??= page.voices.find((v) => v.id === voiceId);
    if (!found?.publicOwnerId) throw new VoiceError(400, "Такого голоса нет в библиотеке.");
    const res = await fetchFn(`${API}/v1/voices/add/${encodeURIComponent(found.publicOwnerId)}/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: { "xi-api-key": this.#opts.apiKey, "content-type": "application/json" },
      body: JSON.stringify({ new_name: found.name }),
    });
    if (!res.ok) throw new Error(`ElevenLabs add voice failed (${res.status})`);
    this.#account = null;
  }
}
