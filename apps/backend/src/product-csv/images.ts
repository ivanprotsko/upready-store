/**
 * Downloading a product photo from a URL a shop owner typed into a spreadsheet
 * (t14-product-import, step 4).
 *
 * The backend is the one fetching, so the URL is an instruction to make a
 * request from inside the platform's network. Everything here exists because
 * of that: a URL is only fetched after its host resolves to a PUBLIC address,
 * redirects are followed by hand with a hop limit, the body is capped while it
 * is being read rather than after, and only image content types are accepted.
 *
 * Known limit, stated rather than hidden: the address check and the request are
 * two separate resolutions of the same name, so a DNS entry that changes
 * between them is not caught (classic rebinding). Closing that needs a fetch
 * pinned to a resolved address, which breaks TLS name verification for HTTPS.
 * The exposure is bounded by the allowlisted content types and the size cap,
 * and the failure mode is a stored image, not a readable response: nothing here
 * ever returns the fetched body to the caller.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Redirect hops followed before giving up. */
export const MAX_REDIRECTS = 3;

/** One image, at most. Bigger and the row is reported, not silently trimmed. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Whole request budget per image, so a slow host cannot hold the import open. */
export const IMAGE_TIMEOUT_MS = 15_000;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export type ImageFetchResult =
  | {
      ok: true;
      url: string;
      filename: string;
      mime_type: string;
      bytes: number;
      content: Buffer;
    }
  | { ok: false; url: string; error: string };

/**
 * Is this address one the platform must not be talked into reaching? Loopback,
 * the RFC 1918 ranges, link-local (the cloud metadata service lives at
 * 169.254.169.254), carrier-grade NAT, IPv6 loopback, unique-local and
 * link-local, and the unspecified address.
 */
export const isPrivateAddress = (address: string): boolean => {
  const version = isIP(address);

  if (version === 4) {
    const parts = address.split(".").map((part) => Number(part));
    const [a, b] = parts;

    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return true;
    }

    if (a === 0 || a === 10 || a === 127) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a === 100 && b >= 64 && b <= 127) {
      return true;
    }
    if (a >= 224) {
      return true;
    }

    return false;
  }

  if (version === 6) {
    const normalized = address.toLowerCase().split("%")[0];

    if (normalized === "::" || normalized === "::1") {
      return true;
    }
    // IPv4-mapped (::ffff:10.0.0.1) is an IPv4 address wearing a hat.
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) {
      return isPrivateAddress(mapped[1]);
    }
    if (/^f[cd][0-9a-f]{2}:/.test(normalized)) {
      return true;
    }
    if (/^fe[89ab][0-9a-f]:/.test(normalized)) {
      return true;
    }
    if (normalized.startsWith("ff")) {
      return true;
    }

    return false;
  }

  return true;
};

/**
 * The URL, checked as far as it can be checked without making a request:
 * scheme, no credentials in it, a host that is not obviously internal, and
 * every address the name resolves to being public.
 */
export const assertPublicUrl = async (raw: string): Promise<{ ok: true } | { ok: false; error: string }> => {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "адрес не разобрать" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: `схема ${url.protocol} не поддерживается, нужен http или https` };
  }

  if (url.username || url.password) {
    return { ok: false, error: "адрес с логином и паролем не принимается" };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return { ok: false, error: "адрес указывает внутрь платформы" };
  }

  if (isIP(hostname)) {
    return isPrivateAddress(hostname)
      ? { ok: false, error: "адрес указывает внутрь платформы" }
      : { ok: true };
  }

  let addresses: { address: string }[];

  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    return { ok: false, error: "домен не разрешается в адрес" };
  }

  if (addresses.length === 0) {
    return { ok: false, error: "домен не разрешается в адрес" };
  }

  const priv = addresses.find((entry) => isPrivateAddress(entry.address));

  if (priv) {
    return { ok: false, error: "адрес указывает внутрь платформы" };
  }

  return { ok: true };
};

const filenameFor = (url: URL, mimeType: string, index: number): string => {
  const fromPath = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const stem = fromPath
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  const extension = EXTENSION_BY_TYPE[mimeType] ?? "jpg";

  return `${stem || `image-${index + 1}`}.${extension}`;
};

/**
 * One image. Redirects are followed by hand (`redirect: "manual"`) so that each
 * hop is re-checked against `assertPublicUrl`: a public URL that 302s to
 * `127.0.0.1` is exactly the attack the check exists for, and `redirect:
 * "follow"` would do it silently.
 */
export const fetchImage = async (raw: string, index = 0): Promise<ImageFetchResult> => {
  let current = raw;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const allowed = await assertPublicUrl(current);

    if (!allowed.ok) {
      return { ok: false, url: raw, error: allowed.error };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

    let response: Response;

    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: ALLOWED_IMAGE_TYPES.join(", ") },
      });
    } catch (error) {
      clearTimeout(timer);
      const reason = error instanceof Error ? error.message : String(error);
      return { ok: false, url: raw, error: `не удалось скачать: ${reason}` };
    }

    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");

      if (!location) {
        return { ok: false, url: raw, error: `ответ ${response.status} без адреса перехода` };
      }

      if (hop === MAX_REDIRECTS) {
        return { ok: false, url: raw, error: `слишком много переадресаций (больше ${MAX_REDIRECTS})` };
      }

      try {
        current = new URL(location, current).toString();
      } catch {
        return { ok: false, url: raw, error: "переадресация на неразбираемый адрес" };
      }

      continue;
    }

    if (!response.ok) {
      return { ok: false, url: raw, error: `сервер ответил ${response.status}` };
    }

    const mimeType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();

    if (!ALLOWED_IMAGE_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return {
        ok: false,
        url: raw,
        error: `это не картинка (тип «${mimeType || "не указан"}»)`,
      };
    }

    const declared = Number(response.headers.get("content-length"));

    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        url: raw,
        error: `картинка больше ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} МБ`,
      };
    }

    const buffer = await readCapped(response, MAX_IMAGE_BYTES);

    if (!buffer) {
      return {
        ok: false,
        url: raw,
        error: `картинка больше ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} МБ`,
      };
    }

    return {
      ok: true,
      url: raw,
      filename: filenameFor(new URL(current), mimeType, index),
      mime_type: mimeType,
      bytes: buffer.byteLength,
      content: buffer,
    };
  }

  return { ok: false, url: raw, error: `слишком много переадресаций (больше ${MAX_REDIRECTS})` };
};

/**
 * The body, up to `limit` bytes, and `null` the moment it goes over. Read as a
 * stream rather than `arrayBuffer()` on purpose: a `content-length` a server
 * lies about, or omits, would otherwise be believed until the whole file was
 * already in memory.
 */
const readCapped = async (response: Response, limit: number): Promise<Buffer | null> => {
  const stream = response.body;

  if (!stream) {
    return Buffer.alloc(0);
  }

  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    total += value.byteLength;

    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
};
