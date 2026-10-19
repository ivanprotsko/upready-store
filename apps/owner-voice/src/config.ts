/**
 * Every setting of the owner voice chat, read once from the environment.
 *
 * Keys come from the environment and nowhere else. This module never logs a
 * key and `describeConfig` reports only whether one is present. Where a key is
 * missing, that part runs on recorded fixtures and the status says so.
 */

export type Mode = "live" | "fixture";

export interface Config {
  port: number;
  shop: {
    /** The engine the shop runs on: Store API, `/storefront/by-host` and `/tenants/*`. */
    apiUrl: string;
    /** The shop's own domain, which `/storefront/by-host` resolves to a shop. */
    host: string;
    panelUrl: string;
    storefrontUrl: string;
    locale: string;
    /** Prices are shown for the region that holds this country. */
    country: string;
    login: { email: string; password: string } | null;
    /** `SHOP_FIXTURES=1` puts the Store API on fixtures as well, for a run with no network. */
    forceFixtures: boolean;
  };
  elevenlabs: {
    apiKey: string | null;
    voiceId: string;
    ttsModelId: string;
    sttModelId: string;
  };
  model: {
    provider: "anthropic" | "rules";
    anthropicKey: string | null;
    anthropicModel: string;
  };
}

/** Oksana's cloned voice "Chrxn 2.0", the default of chrxnasdmds; it plays only on the account that owns it. */
const DEFAULT_VOICE_ID = "hRkvvKIawos7EupPfna0";

const value = (env: NodeJS.ProcessEnv, name: string): string | null => {
  const raw = env[name]?.trim();
  return raw ? raw : null;
};

const trimSlash = (url: string): string => url.replace(/\/+$/, "");

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const email = value(env, "SHOP_LOGIN_EMAIL");
  const password = value(env, "SHOP_LOGIN_PASSWORD");
  const anthropicKey = value(env, "ANTHROPIC_API_KEY");
  const requested = value(env, "MODEL_PROVIDER");

  return {
    port: Number(value(env, "PORT") ?? 5470),
    shop: {
      apiUrl: trimSlash(value(env, "SHOP_API_URL") ?? "https://shipshift.dev"),
      host: value(env, "SHOP_HOST") ?? "cherkashino.com",
      panelUrl: trimSlash(value(env, "SHOP_PANEL_URL") ?? "https://panel.cherkashino.com"),
      storefrontUrl: trimSlash(value(env, "SHOP_STOREFRONT_URL") ?? "https://cherkashino.com"),
      locale: value(env, "SHOP_LOCALE") ?? "ru",
      country: (value(env, "SHOP_COUNTRY") ?? "ru").toLowerCase(),
      login: email && password ? { email, password } : null,
      forceFixtures: value(env, "SHOP_FIXTURES") === "1",
    },
    elevenlabs: {
      apiKey: value(env, "ELEVENLABS_API_KEY"),
      voiceId: value(env, "ELEVENLABS_VOICE_ID") ?? DEFAULT_VOICE_ID,
      ttsModelId: value(env, "ELEVENLABS_TTS_MODEL_ID") ?? "eleven_flash_v2_5",
      sttModelId: value(env, "ELEVENLABS_STT_MODEL_ID") ?? "scribe_v1",
    },
    model: {
      // Without a key the rules provider answers, so the stand still works on fixtures.
      provider: requested === "rules" || !anthropicKey ? "rules" : "anthropic",
      anthropicKey,
      anthropicModel: value(env, "ANTHROPIC_MODEL") ?? "claude-sonnet-5-5",
    },
  };
}

/** What runs live and what on fixtures. Safe to print: it holds no key. */
export function describeConfig(config: Config) {
  return {
    shop: config.shop.host,
    storeApi: (config.shop.forceFixtures ? "fixture" : "live") as Mode,
    ownerApi: (config.shop.login && !config.shop.forceFixtures ? "live" : "fixture") as Mode,
    voice: (config.elevenlabs.apiKey ? "live" : "fixture") as Mode,
    model:
      config.model.provider === "anthropic"
        ? `anthropic ${config.model.anthropicModel}`
        : "rules (no model key, keyword router)",
  };
}
