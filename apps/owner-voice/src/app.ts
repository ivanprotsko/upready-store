/**
 * Wires the parts together from the config: shop API (live or fixtures),
 * model provider, voice. The server and the fixture run both start here.
 */
import { runTurn, type TurnResult } from "./agent.ts";
import { type Config, describeConfig } from "./config.ts";
import type { Audio } from "./elevenlabs.ts";
import { AnthropicProvider } from "./model/anthropic.ts";
import { RulesProvider } from "./model/rules.ts";
import type { ChatMessage, ModelProvider } from "./model/types.ts";
import { type FetchFn, HttpShopApi } from "./shop/api.ts";
import { fixtureFetch } from "./shop/fixtures.ts";
import type { ToolContext } from "./tools.ts";
import { ElevenLabsVoice, FixtureVoice, type Voice } from "./voice.ts";

export interface VoiceTurn extends TurnResult {
  transcript: string;
  audio: Audio | null;
}

export interface App {
  status(): ReturnType<typeof describeConfig> & { provider: string };
  text(question: string, history: ChatMessage[]): Promise<TurnResult & { audio: Audio | null }>;
  voice(audio: Audio, history: ChatMessage[]): Promise<VoiceTurn>;
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
  const provider =
    overrides.provider ??
    (config.model.provider === "anthropic" && config.model.anthropicKey
      ? new AnthropicProvider(config.model.anthropicKey, config.model.anthropicModel, net)
      : new RulesProvider());
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
  };
  const shopName = SHOP_NAMES[config.shop.host] ?? config.shop.host;

  const speak = async (text: string): Promise<Audio | null> => {
    try {
      return await voice.speak(text);
    } catch (err) {
      // The answer still reaches the screen when the voice fails.
      console.error("[owner-voice] TTS failed:", err instanceof Error ? err.message : err);
      return null;
    }
  };

  const answer = async (question: string, history: ChatMessage[]) => {
    const turn = await runTurn(provider, ctx, shopName, history, question);
    return { ...turn, audio: await speak(turn.reply) };
  };

  return {
    status: () => ({ ...described, voice: voice.mode, provider: provider.name }),
    text: answer,
    async voice(audio, history) {
      const transcript = await voice.transcribe(audio);
      if (!transcript) {
        return { transcript, reply: "Не расслышал, повторите, пожалуйста.", cards: [], calls: [], audio: null };
      }
      return { transcript, ...(await answer(transcript, history)) };
    },
  };
}
