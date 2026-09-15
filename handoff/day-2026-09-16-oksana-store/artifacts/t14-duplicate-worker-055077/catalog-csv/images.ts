/**
 * Downloading an image the FILE names. This is the one place in the import where
 * the shop owner gets to make the backend issue a request, so it is written as a
 * hostile input path, not as a convenience:
 *
 * - only `http` and `https`;
 * - the hostname is checked, and then the addresses it RESOLVES to are checked,
 *   because a public name can point at `127.0.0.1` and a name that resolved
 *   publicly a minute ago can point anywhere now;
 * - redirects are followed by hand with a hop limit, each hop checked again;
 * - the response has to be an image by `Content-Type`, and it has to fit;
 * - a failure is a message, never a throw that takes the import down: the task
 *   asks for the dead URL to be reported with the product still created.
 */

import dns from "node:dns/promises";
import { isPrivateHostname } from "./values";
import { IMAGE_TIMEOUT_MS, MAX_IMAGE_BYTES, MAX_IMAGE_REDIRECTS } from "./limits";

export type FetchedImage = {
  url: string;
  filename: string;
  mime_type: string;
  content: Buffer;
};

export type ImageFetchOutcome =
  | { ok: true; image: FetchedImage }
  | { ok: false; reason: string };

/** Private, loopback, link-local and carrier-NAT ranges, for an address DNS returned. */
export const isPrivateAddress = (address: string): boolean => {
  const value = address.replace(/^::ffff:/i, "");

  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) {
    const octets = value.split(".").map((part) => Number(part));

    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return true;
    }

    const [a, b] = octets;

    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }

  const lower = value.toLowerCase();

  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80:")
  );
};

/** Every address a hostname resolves to is public, or the reason it is not. */
const resolvesPublicly = async (hostname: string): Promise<string | null> => {
  if (isPrivateHostname(hostname)) {
    return "адрес во внутренней сети";
  }

  let addresses: { address: string }[];

  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    return "имя хоста не разрешается в адрес";
  }

  if (addresses.length === 0) {
    return "имя хоста не разрешается в адрес";
  }

  const priv = addresses.find((entry) => isPrivateAddress(entry.address));

  return priv ? `имя хоста указывает на внутренний адрес ${priv.address}` : null;
};

/** The name the file is stored under: the URL's last path segment, kept readable. */
export const filenameFromUrl = (url: string, mimeType: string): string => {
  let base = "";

  try {
    base = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "");
  } catch {
    base = "";
  }

  base = base.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");

  if (base === "") {
    base = "image";
  }

  if (/\.[a-z0-9]{2,5}$/i.test(base)) {
    return base;
  }

  const extension = (mimeType.split("/")[1] ?? "jpg").split("+")[0].replace(/[^a-z0-9]/gi, "");

  return `${base}.${extension || "jpg"}`;
};

/**
 * Downloads one image. Redirects are followed manually so every hop can be
 * checked against the private-address rules the first one was.
 */
export const fetchImage = async (
  rawUrl: string,
  options: { fetchImpl?: typeof fetch; resolve?: (hostname: string) => Promise<string | null> } = {},
): Promise<ImageFetchOutcome> => {
  const doFetch = options.fetchImpl ?? fetch;
  const check = options.resolve ?? resolvesPublicly;

  let current = rawUrl;

  for (let hop = 0; hop <= MAX_IMAGE_REDIRECTS; hop += 1) {
    let url: URL;

    try {
      url = new URL(current);
    } catch {
      return { ok: false, reason: "не похоже на адрес" };
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, reason: "поддерживаются только http и https" };
    }

    const privateReason = await check(url.hostname);

    if (privateReason) {
      return { ok: false, reason: privateReason };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

    let response: Response;

    try {
      response = await doFetch(url.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "image/*" },
      });
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error && error.name === "AbortError" ? "таймаут" : "не отвечает",
      };
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");

      if (!location) {
        return { ok: false, reason: `редирект ${response.status} без адреса` };
      }

      if (hop === MAX_IMAGE_REDIRECTS) {
        return { ok: false, reason: `больше ${MAX_IMAGE_REDIRECTS} редиректов` };
      }

      current = new URL(location, url).toString();
      continue;
    }

    if (!response.ok) {
      return { ok: false, reason: `ответ ${response.status}` };
    }

    const mimeType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();

    if (!mimeType.startsWith("image/")) {
      return { ok: false, reason: `это не картинка (${mimeType || "без типа"})` };
    }

    const declared = Number(response.headers.get("content-length") ?? "0");

    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
      return { ok: false, reason: `больше ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} МБ` };
    }

    const content = Buffer.from(await response.arrayBuffer());

    if (content.byteLength === 0) {
      return { ok: false, reason: "пустой файл" };
    }

    if (content.byteLength > MAX_IMAGE_BYTES) {
      return { ok: false, reason: `больше ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} МБ` };
    }

    return {
      ok: true,
      image: {
        url: rawUrl,
        filename: filenameFromUrl(rawUrl, mimeType),
        mime_type: mimeType,
        content,
      },
    };
  }

  return { ok: false, reason: `больше ${MAX_IMAGE_REDIRECTS} редиректов` };
};
