import { OZON_WRITE_PATHS } from "./endpoints";
import { ozonRead, type OzonCredentials } from "./transport";

/**
 * What an Ozon API key says about itself (w11-ozon-readonly-client).
 *
 * Wildberries hands this out offline: its key is a JWT whose payload carries a
 * documented bit 30, "Read only token". Ozon has no such bit and no readable
 * payload — the key is an opaque string. What Ozon does have is a documented
 * method to ASK:
 *
 *   POST /v1/roles  ->  { expires_at, roles: [{ name, methods: [...] }] }
 *   "Метод для получения информации и ролях и методах, привязанных к API-ключу."
 *
 * So `readOnly` here is the answer to one question: does the key's own list of
 * methods cover anything in `OZON_WRITE_PATHS`?
 *
 *   true      no granted method covers a known mutation
 *   false     one does, and `writeMethods` names which
 *   "unknown" Ozon did not answer, or answered without a `roles` array
 *
 * Never `true` from memory and never `true` from silence (rule 17a): a key we
 * could not ask is `"unknown"`, which is a legitimate answer, and the caller
 * renders it as such.
 *
 * WHAT THIS IS NOT. It is not the thing that keeps us from writing. The
 * transport cannot express a write whatever this returns; `readOnly` exists so
 * the shop owner learns that the key they were issued is broader than it
 * should be and can reissue it.
 */

export const OZON_ROLES_DOC_URL =
  "https://docs.ozon.ru/api/seller/#operation/AccessAPI_RolesByToken";

export type OzonRole = {
  name: string;
  methods: string[];
};

export type OzonCredentialFacts = {
  /** Whether a key pair is stored at all. */
  set: boolean;
  /** The last four characters of the API key. Never the value. */
  last4: string | null;
  /** The `Client-Id`. Not a secret by itself, but not shown outside the owner's own route. */
  clientId: string | null;
  /** `expires_at` from Ozon. The docs say a key lives 3 months. */
  expiresAt: string | null;
  /** Whether that date has already passed. `null` when there is no date. */
  expired: boolean | null;
  roles: OzonRole[];
  /** `true` | `false` | `"unknown"`. See the head comment. */
  readOnly: true | false | "unknown";
  /**
   * How `readOnly` was decided, in one sentence, so nobody has to trust the
   * word: the doc URL plus what was compared against what.
   */
  readOnlySource: string;
  /** The granted methods that cover a known mutation. Empty unless `readOnly === false`. */
  writeMethods: string[];
  /** Set when the question could not be asked or answered; the caller shows it as is. */
  error: string | null;
};

/**
 * Whether a granted entry covers a mutation path.
 *
 * Ozon's own example answer grants `"methods": ["/v1/posting"]`, which is NOT
 * a method path: it is a PREFIX covering everything under it. So an exact
 * comparison would read that key as harmless while it can ship orders. A
 * granted entry covers a path when it equals it or is a path prefix of it on a
 * segment boundary.
 */
export const grantCoversPath = (granted: string, path: string): boolean => {
  if (!granted) {
    return false;
  }
  const normalised = granted.endsWith("/") ? granted.slice(0, -1) : granted;
  return path === normalised || path.startsWith(`${normalised}/`);
};

/** The mutations a role list grants, by their own path. */
export const writePathsGrantedBy = (roles: OzonRole[]): string[] => {
  const found = new Set<string>();
  for (const role of roles) {
    for (const granted of role.methods ?? []) {
      for (const path of Object.keys(OZON_WRITE_PATHS)) {
        if (grantCoversPath(granted, path)) {
          found.add(path);
        }
      }
    }
  }
  return [...found].sort();
};

const last4 = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  return value.length >= 4 ? value.slice(-4) : "•".repeat(value.length);
};

export type InspectOptions = {
  /** Passed through to `ozonRead`, so the question is journalled like any read. */
  tenantId?: string | null;
  journal?: Parameters<typeof ozonRead>[1]["journal"];
  logger?: Pick<Console, "info" | "warn">;
};

/**
 * Asks the key what it may do. Never throws: an unanswered question is a fact
 * to report, and `GET /tenants/ozon/status` has to render it.
 */
export const inspectCredentials = async (
  credentials: OzonCredentials | null | undefined,
  options: InspectOptions = {},
): Promise<OzonCredentialFacts> => {
  const base: OzonCredentialFacts = {
    set: Boolean(credentials?.apiKey),
    last4: last4(credentials?.apiKey),
    clientId: credentials?.clientId ?? null,
    expiresAt: null,
    expired: null,
    roles: [],
    readOnly: "unknown",
    readOnlySource: `Не спрошено: ${OZON_ROLES_DOC_URL}`,
    writeMethods: [],
    error: null,
  };

  if (!credentials?.apiKey || !credentials?.clientId) {
    return { ...base, error: "Для этого магазина не сохранена пара Client-Id + Api-Key." };
  }

  let answer: { expires_at?: string; roles?: OzonRole[] };
  try {
    const result = await ozonRead<{ expires_at?: string; roles?: OzonRole[] }>("access.roles", {
      credentials,
      body: {},
      tenantId: options.tenantId ?? null,
      journal: options.journal,
      logger: options.logger,
    });
    answer = result.data ?? {};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      error: `Ozon не ответил на POST /v1/roles: ${message}`,
      readOnlySource:
        `Не определено: ключ не ответил на ${OZON_ROLES_DOC_URL}. ` +
        "«unknown» — это честный ответ; выдумывать «только чтение» нельзя (правило 17a).",
    };
  }

  const roles = Array.isArray(answer.roles) ? answer.roles : [];
  const expiresAt = typeof answer.expires_at === "string" ? answer.expires_at : null;
  const expiryMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;

  if (!roles.length) {
    return {
      ...base,
      expiresAt,
      expired: Number.isFinite(expiryMs) ? expiryMs <= Date.now() : null,
      error: "Ozon ответил на /v1/roles без массива roles, область ключа неизвестна.",
      readOnlySource:
        `Не определено: ответ ${OZON_ROLES_DOC_URL} не содержит roles[]. ` +
        "Пустой список методов — это отсутствие данных, а не отсутствие прав (правило 20a).",
    };
  }

  const writeMethods = writePathsGrantedBy(roles);
  const grantedCount = roles.reduce((total, role) => total + (role.methods?.length ?? 0), 0);

  return {
    ...base,
    expiresAt,
    expired: Number.isFinite(expiryMs) ? expiryMs <= Date.now() : null,
    roles,
    readOnly: writeMethods.length === 0,
    writeMethods,
    readOnlySource:
      `POST /v1/roles (${OZON_ROLES_DOC_URL}): ${grantedCount} записей методов в ${roles.length} ` +
      `ролях сопоставлены с ${Object.keys(OZON_WRITE_PATHS).length} известными мутациями из ` +
      `OZON_WRITE_PATHS; совпадений ${writeMethods.length}.`,
    error: null,
  };
};

/**
 * The one WARNING line to log when a key is not read-only. A warning and not a
 * refusal: the transport cannot write whatever the key allows, so a
 * write-capable key is a thing to tell the owner about, not a reason to stop
 * reading.
 */
export const readOnlyWarning = (facts: OzonCredentialFacts): string | null => {
  if (facts.readOnly === true) {
    return null;
  }
  if (facts.readOnly === "unknown") {
    return (
      "[ozon] WARNING: не удалось выяснить область ключа Ozon " +
      `(${facts.error ?? "нет ответа"}). Клиент всё равно не может писать: ` +
      "src/modules/ozon/transport.ts отправляет только зарегистрированные чтения."
    );
  }
  return (
    "[ozon] WARNING: ключ Ozon даёт права на запись — " +
    `${facts.writeMethods.join(", ")}. Клиент всё равно не может ими воспользоваться ` +
    "(src/modules/ozon/endpoints.ts, default deny), но ключ стоит перевыпустить уже. " +
    `Источник вывода: ${OZON_ROLES_DOC_URL}`
  );
};
