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
    /** `ELEVENLABS_ALLOW_ADD_VOICE=1` lets the settings panel add a library voice to the account; off by default. */
    allowAddVoice: boolean;
  };
  model: {
    provider: "anthropic" | "rules";
    anthropicKey: string | null;
    anthropicModel: string;
    /** `MODEL_DAILY_USD`, default 5: past it the keyword router answers until the next UTC day. */
    dailyUsd: number;
    /** Price per million tokens, in and out, for the spend count (`MODEL_USD_PER_MTOK_IN/OUT`). */
    usdPerMTokIn: number;
    usdPerMTokOut: number;
  };
  /**
   * `SHOP_REGION=ru` turns Claude and images off: both wait for Ivan's decision
   * on sending RU data abroad (architecture §6). Default `intl`.
   */
  region: "ru" | "intl";
  changesets: {
    /** `CHANGESETS=1` lets a confirm become a changeset on stage. Off: the stage 2 dry-run. */
    on: boolean;
    /** The stage site's host, for the links on a card; `stage.<SHOP_HOST>` by default. */
    stageHost: string;
  };
  images: {
    /** `IMAGES=0` turns them off; on by default outside RU, always off in RU. */
    on: boolean;
    provider: "stub";
    dailyUsd: number;
    dailyCount: number;
    /** What one stub picture costs, so the cap can be shown on fixtures (`IMAGE_STUB_USD`). */
    stubUsd: number;
  };
  /** Where the stand keeps its counts and the owner's files (`DATA_DIR`). */
  dataDir: string;
  /** The stand's own origin, for image links a changeset op carries (`PUBLIC_URL`). */
  publicUrl: string;
  /** Uploaded files and image previews are deleted after this many hours (`FILES_TTL_HOURS`, default 24). */
  filesTtlHours: number;
}

/** Oksana's cloned voice "Chrxn 2.0", the default of chrxnasdmds; it plays only on the account that owns it. */
const DEFAULT_VOICE_ID = "hRkvvKIawos7EupPfna0";

const value = (env: NodeJS.ProcessEnv, name: string): string | null => {
  const raw = env[name]?.trim();
  return raw ? raw : null;
};

const num = (env: NodeJS.ProcessEnv, name: string, fallback: number): number => {
  const parsed = Number(value(env, name));
  return Number.isFinite(parsed) && value(env, name) !== null && parsed >= 0 ? parsed : fallback;
};

const trimSlash = (url: string): string => url.replace(/\/+$/, "");

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const email = value(env, "SHOP_LOGIN_EMAIL");
  const password = value(env, "SHOP_LOGIN_PASSWORD");
  const anthropicKey = value(env, "ANTHROPIC_API_KEY");
  const requested = value(env, "MODEL_PROVIDER");
  const region = value(env, "SHOP_REGION") === "ru" ? "ru" : "intl";
  const host = value(env, "SHOP_HOST") ?? "cherkashino.com";
  const port = Number(value(env, "PORT") ?? 5470);

  return {
    port,
    shop: {
      apiUrl: trimSlash(value(env, "SHOP_API_URL") ?? "https://shipshift.dev"),
      host,
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
      allowAddVoice: value(env, "ELEVENLABS_ALLOW_ADD_VOICE") === "1",
    },
    model: {
      // Without a key the rules provider answers, so the stand still works on fixtures.
      // In RU Claude stays off whatever the key: the flag wins.
      provider: requested === "rules" || !anthropicKey || region === "ru" ? "rules" : "anthropic",
      anthropicKey,
      anthropicModel: value(env, "ANTHROPIC_MODEL") ?? "claude-sonnet-5-5",
      dailyUsd: num(env, "MODEL_DAILY_USD", 5),
      usdPerMTokIn: num(env, "MODEL_USD_PER_MTOK_IN", 3),
      usdPerMTokOut: num(env, "MODEL_USD_PER_MTOK_OUT", 15),
    },
    region,
    changesets: {
      on: value(env, "CHANGESETS") === "1",
      stageHost: value(env, "STAGE_HOST") ?? `stage.${host}`,
    },
    images: {
      on: region !== "ru" && value(env, "IMAGES") !== "0",
      provider: "stub",
      dailyUsd: num(env, "IMAGE_DAILY_USD", 3),
      dailyCount: num(env, "IMAGE_DAILY_COUNT", 30),
      stubUsd: num(env, "IMAGE_STUB_USD", 0.04),
    },
    dataDir: value(env, "DATA_DIR") ?? ".data",
    publicUrl: trimSlash(value(env, "PUBLIC_URL") ?? `http://localhost:${port}`),
    filesTtlHours: num(env, "FILES_TTL_HOURS", 24),
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
        : config.region === "ru" && config.model.anthropicKey
          ? "rules (Claude off in RU)"
          : "rules (no model key, keyword router)",
    region: config.region,
    changesets: config.changesets.on ? "on" : "off (dry-run)",
    stageHost: config.changesets.stageHost,
    images: config.images.on ? config.images.provider : config.region === "ru" ? "off (RU)" : "off",
  };
}
