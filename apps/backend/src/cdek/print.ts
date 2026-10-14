/**
 * CDEK v2 print forms (t-2026-10-14-58, part A): the parcel label
 * (`/print/barcodes`, «ШК места») and the order receipt (`/print/orders`,
 * «квитанция к заказу»).
 *
 * Both work the same way, per CDEK's v2 docs:
 *
 * - `POST /print/{kind}` with the orders' uuids answers
 *   `{ entity: { uuid }, requests: [{ state: "ACCEPTED" }] }`. The file is not
 *   there yet: CDEK builds it in the background.
 * - `GET /print/{kind}/{uuid}` answers `entity.statuses` (`ACCEPTED`,
 *   `PROCESSING`, then `READY`, or `INVALID`) and, once ready, `entity.url`.
 * - The `url` (`…/print/{kind}/{uuid}.pdf`) wants the same bearer token and
 *   answers the PDF. CDEK keeps the file for about an hour (`REMOVED` after).
 *
 * Framework-agnostic like `client.ts`, with `fetchImpl` as the seam a test
 * replaces. No live CDEK call is made from the tests.
 */

import {
  CdekError,
  assertOrderAccepted,
  authenticate,
  cdekRequest,
  forgetCdekToken,
  type CdekClientOptions,
  type CdekCredentials,
  type CdekOrderAck,
} from "./client";

export const CDEK_LABEL_FORMATS = ["A4", "A5", "A6"] as const;
export type CdekLabelFormat = (typeof CDEK_LABEL_FORMATS)[number];

/** A6 is the size of a thermal label, the one a parcel carries. */
export const CDEK_DEFAULT_LABEL_FORMAT: CdekLabelFormat = "A6";

/** One `/print/barcodes` call takes at most this many orders (the batch route's limit). */
export const CDEK_PRINT_MAX_ORDERS = 100;

export type CdekPrintKind = "barcodes" | "orders";

export type CdekPrintOptions = CdekClientOptions & {
  /** The pauses before each status read ({@link POLL_DELAYS_MS}); a test passes zeros. */
  pollDelaysMs?: number[];
  /** How long the reads may take in all, slow answers included ({@link POLL_LIMIT_MS}). */
  pollLimitMs?: number;
};

/**
 * A quick first look, then a read every two seconds: 19.5 s in all. The panel
 * waits on the answer, and a proxy in front of the backend gives up at a
 * minute, so the wait stays well inside that with the POST and the download.
 */
const POLL_DELAYS_MS = [500, 1000, 1500, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2500];

/** The pauses add up to 19.5 s, and slow status reads cannot stretch the wait past 20 s. */
const POLL_LIMIT_MS = 20_000;

/** A status read is short; a hung one must not eat the whole wait. */
const POLL_TIMEOUT_MS = 8000;

/** One more try for a 5xx on the download, the way `client.ts` retries its calls. */
const DOWNLOAD_RETRY_DELAYS_MS = [500];

export class CdekPrintTimeoutError extends Error {
  readonly uuid: string;

  constructor(kind: CdekPrintKind, uuid: string, waitedMs: number) {
    super(`CDEK /print/${kind}/${uuid} was not READY after ${Math.round(waitedMs / 1000)} s`);
    this.name = "CdekPrintTimeoutError";
    this.uuid = uuid;
  }
}

type CdekPrintInfo = {
  entity?: {
    uuid?: string;
    url?: string;
    statuses?: Array<{ code?: string; name?: string; date_time?: string }>;
  };
  requests?: Array<{ state?: string; errors?: Array<{ code: string; message: string }> }>;
};

export type CdekPrintState = "READY" | "INVALID" | "REMOVED" | "PENDING";

/**
 * Where a print form stands. The statuses are a history, so the worst one wins:
 * a form that went `READY` and then `REMOVED` has no file any more.
 */
export const printState = (info: CdekPrintInfo | undefined): CdekPrintState => {
  const codes = new Set((info?.entity?.statuses ?? []).map((status) => String(status.code ?? "").toUpperCase()));
  const invalidRequest = (info?.requests ?? []).some((entry) => entry.state === "INVALID");
  if (codes.has("INVALID") || invalidRequest) return "INVALID";
  if (codes.has("REMOVED")) return "REMOVED";
  if (codes.has("READY")) return "READY";
  return "PENDING";
};

/**
 * What the owner reads after «СДЭК не отдал файл:»: CDEK's own error codes,
 * else the HTTP status. Never CDEK's free text (it can quote what it was sent),
 * never a header and never the token.
 */
export const cdekPrintFailureReason = (error: CdekError): string => {
  const codes = [...new Set(error.cdekErrors.map((entry) => entry.code).filter(Boolean))];
  if (codes.length) return codes.join(", ");
  if (error.message.startsWith("CDEK auth")) {
    return error.status ? `auth_failed (HTTP ${error.status})` : "auth_failed";
  }
  return error.status ? `HTTP ${error.status}` : "no_answer";
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPrintForm = async (
  credentials: CdekCredentials,
  kind: CdekPrintKind,
  uuid: string,
  options: CdekPrintOptions,
): Promise<string | null> => {
  const delays = options.pollDelaysMs ?? POLL_DELAYS_MS;
  const limit = options.pollLimitMs ?? POLL_LIMIT_MS;
  const now = options.now ?? Date.now;
  const started = now();
  const path = `/print/${kind}/${uuid}`;

  for (const delay of delays) {
    await sleep(delay);
    const info = await cdekRequest<CdekPrintInfo>(
      credentials,
      path,
      {},
      { ...options, timeoutMs: options.timeoutMs ?? POLL_TIMEOUT_MS },
    );
    const state = printState(info);
    if (state === "READY") return info?.entity?.url ?? null;
    if (state !== "PENDING") {
      const errors = (info?.requests ?? []).flatMap((entry) => entry.errors ?? []);
      throw new CdekError(`CDEK ${path} is ${state}`, {
        errors: errors.length ? errors : [{ code: `print_${state.toLowerCase()}`, message: state }],
        path,
      });
    }
    if (now() - started >= limit) break;
  }
  throw new CdekPrintTimeoutError(kind, uuid, now() - started);
};

/**
 * The token goes only to CDEK's own API host. A `url` on any other origin is
 * not followed: the documented path on the API base is read instead.
 */
const downloadUrl = (credentials: CdekCredentials, kind: CdekPrintKind, uuid: string, url: string | null) => {
  const canonical = `${credentials.base}/print/${kind}/${uuid}.pdf`;
  if (!url) return canonical;
  try {
    return new URL(url).origin === new URL(credentials.base).origin ? url : canonical;
  } catch {
    return canonical;
  }
};

const isPdf = (bytes: Buffer) => bytes.subarray(0, 5).toString("latin1") === "%PDF-";

const downloadPrintForm = async (
  credentials: CdekCredentials,
  kind: CdekPrintKind,
  uuid: string,
  url: string | null,
  options: CdekPrintOptions,
): Promise<Buffer> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const target = downloadUrl(credentials, kind, uuid, url);
  const path = `/print/${kind}/${uuid}.pdf`;

  const attempt = async (token: string) => {
    const res = await fetchImpl(target, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 25000),
    });
    return { res, bytes: Buffer.from(await res.arrayBuffer()) };
  };

  let token = await authenticate(credentials, options);
  let { res, bytes } = await attempt(token);
  if (res.status === 401) {
    forgetCdekToken(credentials);
    token = await authenticate(credentials, options);
    ({ res, bytes } = await attempt(token));
  }
  for (const delay of options.retryDelaysMs ?? DOWNLOAD_RETRY_DELAYS_MS) {
    if (res.status < 500) break;
    await sleep(delay);
    ({ res, bytes } = await attempt(token));
  }

  if (!res.ok) {
    let errors: Array<{ code: string; message: string }> = [];
    try {
      errors = (JSON.parse(bytes.toString("utf8")) as { errors?: typeof errors }).errors ?? [];
    } catch {
      // A body that is not JSON carries no codes; the status is the reason.
    }
    throw new CdekError(`CDEK ${path} answered ${res.status}`, { status: res.status, errors, path });
  }
  if (!isPdf(bytes)) {
    throw new CdekError(`CDEK ${path} answered a body that is not a PDF`, {
      status: res.status,
      errors: [{ code: "print_not_pdf", message: "not a PDF" }],
      path,
    });
  }
  return bytes;
};

/** Orders a print form, waits for it, and returns the file. */
export const printCdekForm = async (
  credentials: CdekCredentials,
  kind: CdekPrintKind,
  body: Record<string, unknown>,
  options: CdekPrintOptions = {},
): Promise<{ uuid: string; pdf: Buffer }> => {
  const ack = await cdekRequest<CdekOrderAck>(
    credentials,
    `/print/${kind}`,
    { method: "POST", body },
    options,
  );
  assertOrderAccepted(ack, `print/${kind}`);
  const uuid = ack?.entity?.uuid;
  if (!uuid) {
    throw new CdekError(`CDEK /print/${kind} gave no uuid`, {
      errors: [{ code: "print_no_uuid", message: "no uuid" }],
      path: `/print/${kind}`,
    });
  }
  const url = await waitForPrintForm(credentials, kind, uuid, options);
  return { uuid, pdf: await downloadPrintForm(credentials, kind, uuid, url, options) };
};

/** The parcel labels of one or more orders, all in one PDF. */
export const printCdekLabels = (
  credentials: CdekCredentials,
  orderUuids: string[],
  format: CdekLabelFormat = CDEK_DEFAULT_LABEL_FORMAT,
  options: CdekPrintOptions = {},
) =>
  printCdekForm(
    credentials,
    "barcodes",
    { orders: orderUuids.map((order_uuid) => ({ order_uuid })), format, copy_count: 1 },
    options,
  );

/** The order receipt, two copies: one stays with the shop, one goes with the parcel. */
export const printCdekWaybill = (
  credentials: CdekCredentials,
  orderUuid: string,
  options: CdekPrintOptions = {},
) =>
  printCdekForm(credentials, "orders", { orders: [{ order_uuid: orderUuid }], copy_count: 2 }, options);
