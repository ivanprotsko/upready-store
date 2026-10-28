/**
 * Wires the parts together from the config: shop API (live or fixtures),
 * model provider, voice. The server and the fixture run both start here.
 */
import { runTurn, type TurnResult } from "./agent.ts";
import { AssistantRules, assistantTurn } from "./assistant/index.ts";
import type { StoreContext } from "./assistant/tools.ts";
import { COMMANDS, type Command, pickList } from "./commands/index.ts";
import { type CommandInput, confirmProposal, type DryRun, runCommand } from "./commands/run.ts";
import { type Config, describeConfig } from "./config.ts";
import type { Audio } from "./elevenlabs.ts";
import { AnthropicProvider } from "./model/anthropic.ts";
import { type FallbackNote, FallbackProvider } from "./model/fallback.ts";
import { RulesProvider } from "./model/rules.ts";
import type { ChatMessage, ModelProvider } from "./model/types.ts";
import { type FetchFn, HttpShopApi } from "./shop/api.ts";
import { fixtureFetch } from "./shop/fixtures.ts";
import { ProposalStore } from "./commands/run.ts";
import type { ToolContext } from "./tools.ts";
import { ElevenLabsVoice, FixtureVoice, type Voice } from "./voice.ts";
import { VoiceCatalog } from "./voices.ts";

export interface VoiceTurn extends TurnResult {
  transcript: string;
  audio: Audio | null;
}

type Spoken = TurnResult & { audio: Audio | null };

export interface App {
  status(): ReturnType<typeof describeConfig> & { provider: string; modelFallback: FallbackNote | null };
  /** `voiceId`: the voice chosen in the settings panel, checked against the catalog; absent, the env default. */
  text(question: string, history: ChatMessage[], voiceId?: unknown): Promise<Spoken>;
  voice(audio: Audio, history: ChatMessage[], voiceId?: unknown): Promise<VoiceTurn>;
  commands: {
    list(): Command[];
    /** The tenant panel's origin, for the palette's «go to» links. */
    panelUrl: string;
    run(id: string, input: CommandInput): ReturnType<typeof runCommand>;
    /** Rows of the list a command's `{id}` is picked from, e.g. products for «карточка товара». */
    pick(id: string): Promise<{ id: string; label: string }[]>;
    confirm(proposalId: string): DryRun | null;
  };
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
  const rules = new RulesProvider();
  const model =
    overrides.provider ??
    (config.model.provider === "anthropic" && config.model.anthropicKey
      ? new AnthropicProvider(config.model.anthropicKey, config.model.anthropicModel, net)
      : null);
  // Any model sits behind the router: when it fails, the router answers the same turn.
  const provider = model ? new FallbackProvider(model, rules, [config.model.anthropicKey]) : rules;
  const voice =
    overrides.voice ??
    (config.elevenlabs.apiKey
      ? new ElevenLabsVoice({ ...config.elevenlabs, apiKey: config.elevenlabs.apiKey, languageCode: config.shop.locale }, net)
      : new FixtureVoice());
  const ctx: ToolContext = {
    shop,
    panelUrl: config.shop.panelUrl,
    storefrontUrl: config.shop.storefrontUrl,
    locale: config.shop.locale,
    apiUrl: config.shop.apiUrl,
    proposals: new ProposalStore(),
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

  const answer = async (question: string, history: ChatMessage[], voiceId?: unknown): Promise<Spoken> => {
    // An unknown voice is refused before any work, so the owner sees why at once.
    const speaker = await voices.resolve(voiceId);
    const turn = await runTurn(provider, ctx, shopName, history, question);
    return { ...turn, audio: await speak(turn.reply, speaker) };
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

  return {
    status: () => ({
      ...described,
      voice: voice.mode,
      provider: provider.name,
      modelFallback: provider instanceof FallbackProvider ? provider.last : null,
    }),
    text: answer,
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
      confirm: (proposalId) => (ctx.proposals ? confirmProposal(ctx.proposals, proposalId) : null),
    },
    voices,
    assistant: {
      text: assistantAnswer,
      voice: (audio, history) => heard(audio, history, assistantAnswer),
    },
  };
}
