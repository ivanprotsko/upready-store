/**
 * Wires the parts together from the config: shop API (live or fixtures),
 * model provider, voice. The server and the fixture run both start here.
 */
import { resolve } from "node:path";

import { runTurn, type TurnResult } from "./agent.ts";
import { AssistantRules, assistantTurn } from "./assistant/index.ts";
import type { StoreContext } from "./assistant/tools.ts";
import { COMMANDS, type Command, pickList } from "./commands/index.ts";
import { DailyBudget } from "./budget.ts";
import { ChangeFlow, type ChangeOutcome } from "./changes.ts";
import { type CommandInput, confirmProposal, type DryRun, runCommand } from "./commands/run.ts";
import { type Config, describeConfig } from "./config.ts";
import type { Audio } from "./elevenlabs.ts";
import { audioFormat, FileError, fileForModel, FileStore, type StoredFile } from "./files/index.ts";
import { ImageService, StubImageProvider } from "./images/index.ts";
import { runTool } from "./tools.ts";
import { AnthropicProvider } from "./model/anthropic.ts";
import { BudgetProvider } from "./model/budget.ts";
import { type FallbackNote, FallbackProvider } from "./model/fallback.ts";
import { productPhrase, RulesProvider } from "./model/rules.ts";
import type { ChatMessage, ModelProvider } from "./model/types.ts";
import { type FetchFn, HttpShopApi } from "./shop/api.ts";
import { ChangesetClient } from "./shop/changesets.ts";
import { FixtureChangesetBackend } from "./shop/changesets-fixture.ts";
import { fixtureFetch, fold } from "./shop/fixtures.ts";
import type { Card } from "./tools.ts";
import { ProposalStore } from "./commands/run.ts";
import type { ToolContext } from "./tools.ts";
import { ElevenLabsVoice, FixtureVoice, type Voice } from "./voice.ts";
import { VoiceCatalog } from "./voices.ts";

export interface VoiceTurn extends TurnResult {
  transcript: string;
  audio: Audio | null;
}

type Spoken = TurnResult & { audio: Audio | null };

export interface Status extends ReturnType<typeof describeConfig> {
  provider: string;
  modelFallback: FallbackNote | null;
  /** Today's model spend against its cap; null with no paid model. */
  modelCap: { usd: number; capUsd: number; capped: boolean } | null;
  /** Today's pictures against their caps; null when images are off. */
  imageCap: { usd: number; count: number; capUsd: number; capCount: number | null; capped: boolean } | null;
  /** Why a part is off, in the owner's words, for the page. */
  notes: string[];
}

export interface App {
  status(): Status;
  /**
   * `voiceId`: the voice chosen in the settings panel, checked against the
   * catalog; absent, the env default. `files`: ids of uploads attached to the
   * question.
   */
  text(question: string, history: ChatMessage[], voiceId?: unknown, files?: string[]): Promise<Spoken>;
  voice(audio: Audio, history: ChatMessage[], voiceId?: unknown): Promise<VoiceTurn>;
  /** A voice message or an uploaded audio file: transcribed, kept as .txt, then answered. */
  voiceNote(fileId: string, history: ChatMessage[], voiceId?: unknown): Promise<VoiceTurn>;
  commands: {
    list(): Command[];
    /** The tenant panel's origin, for the palette's «go to» links. */
    panelUrl: string;
    run(id: string, input: CommandInput): ReturnType<typeof runCommand>;
    /** Rows of the list a command's `{id}` is picked from, e.g. products for «карточка товара». */
    pick(id: string): Promise<{ id: string; label: string }[]>;
    /** Stage 2: the dry-run. With `CHANGESETS=1`: the changeset on stage. Null when expired. */
    confirm(proposalId: string): Promise<DryRun | ChangeOutcome | null>;
  };
  /** Null unless `CHANGESETS=1`. */
  changes: ChangeFlow | null;
  images: {
    read(id: string): { data: Uint8Array; contentType: string } | null;
    /** The buttons of an image card: the same tool the chat calls. */
    place(id: string, target: "product" | "banner", product?: string): Promise<{ text: string; card?: Card }>;
  };
  files: FileStore;
  /** Delete files and previews past their TTL (§7); the server runs it hourly. */
  sweep(): { files: number; images: number };
  voices: VoiceCatalog;
  assistant: {
    text(question: string, history: ChatMessage[]): Promise<Spoken>;
    voice(audio: Audio, history: ChatMessage[]): Promise<VoiceTurn>;
  };
}

export interface Overrides {
  fetch?: FetchFn;
  provider?: ModelProvider;
  voice?: Voice;
  /** The changeset backend; on fixtures an in-memory one by default. */
  changesetFetch?: FetchFn;
}

/** The lines a question's words point at in a file, for the keyword router, which reads no file whole. */
function linesAbout(question: string, text: string): string[] {
  const words = (productPhrase(question) ?? "").split(" ").filter((w) => w.length > 3).map((w) => w.slice(0, 5));
  if (!words.length) return [];
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && words.some((w) => fold(l).includes(w)))
    .slice(0, 4);
}

const MASKED = /\[(email|телефон|имя|адрес|индекс) скры(т|то)\]/g;

function fileCard(file: StoredFile): Card {
  const kb = file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} КБ` : `${(file.size / 1024 / 1024).toFixed(1)} МБ`;
  const rows: string[] = [];
  if (file.kind === "pdf") rows.push(`PDF, ${file.pages ?? 0} стр., ${kb}.`);
  else rows.push(`${{ image: "Картинка", text: "Текст", csv: "Таблица CSV", audio: "Аудио", pdf: "PDF" }[file.kind]}, ${kb}.`);
  if (file.encrypted) rows.push("PDF защищён паролем: текст не прочитан.");
  else if (file.scan) rows.push("Скан без текстового слоя: текста в нём нет, прочитать его я не могу.");
  else if (file.text) {
    rows.push(...file.text.split("\n").filter((l) => l.trim()).slice(0, 3).map((l) => (l.length > 90 ? `${l.slice(0, 89)}…` : l)));
    const hidden = [...new Set([...file.text.matchAll(MASKED)].map((m) => m[1]))];
    if (hidden.length) rows.push(`Скрыто до модели: ${hidden.join(", ")}.`);
  }
  return { kind: "file", title: file.name, rows };
}

/** The shop's display name in the system prompt; the by-host fixture says «Черкашино». */
const SHOP_NAMES: Record<string, string> = { "cherkashino.com": "Черкашино" };

export function createApp(config: Config, overrides: Overrides = {}): App {
  const net = overrides.fetch ?? fetch;
  const fixtures = fixtureFetch();
  const described = describeConfig(config);
  // On fixtures the login goes to the fixture fetch too, which hands back a dummy token.
  const login = described.ownerApi === "live" ? config.shop.login : { email: "fixture", password: "fixture" };
  const shop = new HttpShopApi({ ...config.shop, login }, {
    store: described.storeApi === "live" ? net : fixtures,
    owner: described.ownerApi === "live" ? net : fixtures,
  });
  const dataDir = resolve(config.dataDir);
  const budget = new DailyBudget(dataDir);
  const rules = new RulesProvider();
  const vendor =
    overrides.provider ??
    (config.model.provider === "anthropic" && config.model.anthropicKey
      ? new AnthropicProvider(config.model.anthropicKey, config.model.anthropicModel, net)
      : null);
  // Every model call is counted against the day's cap; past it the router answers.
  const model = vendor
    ? new BudgetProvider(vendor, budget, config.model.dailyUsd, { inPerM: config.model.usdPerMTokIn, outPerM: config.model.usdPerMTokOut })
    : null;
  // Any model sits behind the router: when it fails, the router answers the same turn.
  const provider = model ? new FallbackProvider(model, rules, [config.model.anthropicKey]) : rules;
  const voice =
    overrides.voice ??
    (config.elevenlabs.apiKey
      ? new ElevenLabsVoice({ ...config.elevenlabs, apiKey: config.elevenlabs.apiKey, languageCode: config.shop.locale }, net)
      : new FixtureVoice());
  // Stage 3: the one write path. Off unless CHANGESETS=1; on fixtures its backend is in memory.
  const changes = config.changesets.on
    ? new ChangeFlow(
        new ChangesetClient({
          apiUrl: config.shop.apiUrl,
          // The live login's token; the in-memory backend only checks that one is sent.
          bearer: described.ownerApi === "live" ? (fresh) => shop.bearer(fresh) : async () => "fixture-token",
          fetch:
            overrides.changesetFetch ??
            (described.ownerApi === "live"
              ? net
              : new FixtureChangesetBackend({ stageUrl: `https://${config.changesets.stageHost}`, mainUrl: config.shop.storefrontUrl }).fetch()),
        }),
        config.changesets.stageHost,
      )
    : null;
  const images = config.images.on
    ? new ImageService(new StubImageProvider(config.images.stubUsd), budget, {
        dataDir,
        publicUrl: config.publicUrl,
        cap: { usd: config.images.dailyUsd, count: config.images.dailyCount },
        ttlHours: config.filesTtlHours,
      })
    : null;
  const imagesOff =
    config.region === "ru" ? "на RU картинки выключены флагом до решения Ивана о передаче данных" : "картинки выключены флагом IMAGES=0";
  const files = new FileStore(dataDir, config.filesTtlHours);
  const ctx: ToolContext = {
    shop,
    panelUrl: config.shop.panelUrl,
    storefrontUrl: config.shop.storefrontUrl,
    locale: config.shop.locale,
    apiUrl: config.shop.apiUrl,
    proposals: new ProposalStore(),
    ...(changes ? { changes } : {}),
    ...(images ? { images } : { imagesOff }),
  };
  const shopName = SHOP_NAMES[config.shop.host] ?? config.shop.host;
  const voices = new VoiceCatalog(
    { apiKey: config.elevenlabs.apiKey, defaultVoiceId: config.elevenlabs.voiceId, allowAdd: config.elevenlabs.allowAddVoice },
    net,
  );

  // The buyer assistant sees the public catalog only: a store reader, no `/tenants/*` at all.
  const storeCtx: StoreContext = {
    store: (path, query) => shop.store(path, query),
    regionId: () => shop.regionId(),
    storefrontUrl: config.shop.storefrontUrl,
    locale: config.shop.locale,
  };
  const assistantRules = new AssistantRules(storeCtx);
  const assistantProvider = model ? new FallbackProvider(model, assistantRules, [config.model.anthropicKey]) : assistantRules;

  const speak = async (text: string, voiceId?: string): Promise<Audio | null> => {
    try {
      return await voice.speak(text, voiceId);
    } catch (err) {
      // The answer still reaches the screen when the voice fails.
      console.error("[owner-voice] TTS failed:", err instanceof Error ? err.message : err);
      return null;
    }
  };

  /** Said once per turn while the model's cap holds: why the router answers. */
  const capNotice = (): Card[] =>
    model?.capped()
      ? [
          {
            kind: "notice",
            title: "Лимит модели на сегодня исчерпан",
            rows: [`Потрачено $${model.usage().usd.toFixed(2)} из $${config.model.dailyUsd.toFixed(2)}. До конца дня по UTC отвечает разбор по словам: он проще и не читает файлы целиком.`],
          },
        ]
      : [];

  /** A turn with files when no model reads them: the file's own facts and the lines the question points at. */
  const filesByRules = (question: string, attached: StoredFile[]): TurnResult => {
    const parts = attached.map((f) => {
      if (f.encrypted) return `«${f.name}» защищён паролем, текст я не прочитал.`;
      if (f.scan) return `В «${f.name}» нет текста: это скан. Прочитать его я не могу; пришлите PDF с текстом или сам текст.`;
      if (f.kind === "image") return `Картинку «${f.name}» получил, но что на ней, не вижу.`;
      if (!f.text) return `В «${f.name}» нет текста.`;
      const hits = linesAbout(question, f.text);
      return hits.length ? `В «${f.name}»: ${hits.join("; ")}.` : `Прочитал «${f.name}»${f.pages ? `, ${f.pages} стр.` : ""}. Спросите, что в нём найти.`;
    });
    return { reply: parts.join(" "), cards: [], calls: [] };
  };

  const answer = async (question: string, history: ChatMessage[], voiceId?: unknown, fileIds: string[] = []): Promise<Spoken> => {
    // An unknown voice is refused before any work, so the owner sees why at once.
    const speaker = await voices.resolve(voiceId);
    const attached = fileIds.map((id) => files.get(id)).filter((f): f is StoredFile => f !== null);
    if (fileIds.length && !attached.length) throw new FileError(410, "Файл уже удалён или не загрузился. Приложите его заново.");
    const notice = capNotice();
    let turn: TurnResult;
    if (attached.length && (!model || model.capped())) turn = filesByRules(question, attached);
    else {
      const asked = attached.length ? `${question}\n\n${attached.map(fileForModel).join("\n\n")}` : question;
      turn = await runTurn(provider, ctx, shopName, history, asked);
    }
    const cards = [...attached.map(fileCard), ...notice, ...turn.cards];
    return { ...turn, cards, audio: await speak(turn.reply, speaker) };
  };

  const assistantAnswer = async (question: string, history: ChatMessage[]): Promise<Spoken> => {
    const turn = await assistantTurn({ provider: assistantProvider, ctx: storeCtx, shopName }, history, question);
    return { ...turn, audio: await speak(turn.reply) };
  };

  const heard = async (audio: Audio, history: ChatMessage[], reply: (t: string, h: ChatMessage[]) => Promise<Spoken>): Promise<VoiceTurn> => {
    const transcript = await voice.transcribe(audio);
    if (!transcript) return { transcript, reply: "Не расслышал, повторите, пожалуйста.", cards: [], calls: [], audio: null };
    return { transcript, ...(await reply(transcript, history)) };
  };

  const notes: string[] = [];
  if (config.region === "ru") notes.push("RU: Claude и картинки выключены флагом SHOP_REGION=ru до решения Ивана.");
  if (!changes) notes.push("Изменения через stage выключены: подтверждение показывает запрос и ничего не отправляет (CHANGESETS=1 включает).");

  return {
    status: () => ({
      ...described,
      voice: voice.mode,
      provider: provider.name,
      modelFallback: provider instanceof FallbackProvider ? provider.last : null,
      modelCap: model ? model.usage() : null,
      imageCap: images ? images.usage() : null,
      notes: [...notes, ...(model?.capped() ? [`Лимит модели $${config.model.dailyUsd} на сегодня исчерпан: отвечает разбор по словам.`] : [])],
    }),
    text: answer,
    async voiceNote(fileId, history, voiceId) {
      const speaker = await voices.resolve(voiceId);
      const file = files.get(fileId);
      const data = file ? files.bytes(fileId) : null;
      if (!file || !data) throw new FileError(410, "Запись уже удалена или не загрузилась. Запишите заново.");
      const format = file.kind === "audio" ? audioFormat(file.name, file.type) : null;
      if (!format) throw new FileError(415, "Это не аудио. Подойдут mp3, m4a, ogg, opus, wav или webm.");
      const transcript = await voice.transcribe({ data, contentType: format.contentType, name: `speech.${format.ext}` });
      if (!transcript) return { transcript, reply: "Не расслышал, повторите, пожалуйста.", cards: [], calls: [], audio: null };
      const kept = files.setTranscript(fileId, transcript)!;
      const card: Card = {
        kind: "voice-note",
        title: file.name.startsWith("voice-") ? "Голосовое сообщение" : `Аудио «${file.name}»`,
        rows: [kept.transcript ?? transcript],
        download: { label: "Скачать расшифровку .txt", href: `/api/files/${fileId}/transcript.txt` },
      };
      const turn = await answer(kept.transcript ?? transcript, history, speaker);
      return { transcript: kept.transcript ?? transcript, ...turn, cards: [card, ...turn.cards] };
    },
    async voice(audio, history, voiceId) {
      const speaker = await voices.resolve(voiceId);
      return heard(audio, history, (t, h) => answer(t, h, speaker));
    },
    commands: {
      list: () => COMMANDS,
      panelUrl: config.shop.panelUrl,
      run: (id, input) => runCommand(id, input, ctx),
      async pick(id) {
        const command = COMMANDS.find((c) => c.id === id);
        const list = command ? pickList(command) : null;
        if (!list) return [];
        const body = (await shop.owner(list, { limit: 20 })) as Record<string, unknown>;
        const rows = (Object.values(body).find(Array.isArray) ?? []) as Record<string, unknown>[];
        return rows.map((r) => ({
          id: String(r.id),
          label: r.display_id !== undefined ? `№${r.display_id}` : String(r.title ?? r.code ?? r.name ?? r.id),
        }));
      },
      async confirm(proposalId) {
        if (!ctx.proposals) return null;
        if (!changes) return confirmProposal(ctx.proposals, proposalId);
        const proposal = ctx.proposals.take(proposalId);
        return proposal ? changes.stage(proposal) : null;
      },
    },
    changes,
    images: {
      read: (id) => images?.read(id) ?? null,
      place: (id, target, product) => runTool("place_image", { target, image: id, ...(product ? { product } : {}) }, ctx),
    },
    files,
    sweep: () => ({ files: files.sweep(), images: images?.sweep() ?? 0 }),
    voices,
    assistant: {
      text: assistantAnswer,
      voice: (audio, history) => heard(audio, history, assistantAnswer),
    },
  };
}
