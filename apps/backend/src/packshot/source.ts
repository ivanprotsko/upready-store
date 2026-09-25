import dns from "dns/promises";
import fs from "fs/promises";
import net from "net";
import path from "path";

/**
 * Reads the bytes of a product image the packshot starts from.
 *
 * The API only passes a URL that is one of the product's own images or its
 * thumbnail, but the owner writes those URLs herself (`POST /tenants/products/:id`
 * takes any string), so the URL alone must never decide what the server connects
 * to. Two shapes are read.
 *
 * - A file of the local provider (`LOCAL_FILE_BACKEND_URL`, the same default as
 *   `medusa-config.ts`) is read from `LOCAL_FILE_UPLOAD_DIR` on disk, never over
 *   HTTP, and only inside that directory.
 * - Anything else must be `https:` on a host whose every address is public, is
 *   fetched without following redirects, within a size cap and a deadline. The S3
 *   bucket of a production stand is such a host.
 * DNS is resolved once for the check and again by `fetch`, so a rebinding host
 * could still race it. The cap, the deadline and the image decoder after it keep
 * the damage of that race to one refused picture.
 */

export class SourceError extends Error {}

const MAX_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

const isS3Active = (): boolean => process.env.NODE_ENV === "production" && Boolean(process.env.S3_BUCKET);

const localBackendUrl = (): string =>
  (process.env.LOCAL_FILE_BACKEND_URL || "http://localhost:9000/static").replace(/\/+$/, "");

const localUploadDir = (): string => path.resolve(process.cwd(), process.env.LOCAL_FILE_UPLOAD_DIR || "static");

/** Loopback, private, link-local, CGNAT, multicast and reserved ranges, v4 and v6. */
export const isPrivateAddress = (address: string): boolean => {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number) as [number, number];

    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  const v6 = address.toLowerCase();

  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));

  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff");
};

async function readLocal(url: string): Promise<Buffer | null> {
  const base = localBackendUrl();

  if (isS3Active() || !url.startsWith(`${base}/`)) return null;

  const relative = decodeURIComponent(url.slice(base.length + 1).split(/[?#]/)[0]!);
  const root = localUploadDir();
  const file = path.resolve(root, relative);

  if (!file.startsWith(`${root}${path.sep}`)) {
    throw new SourceError("The image path points outside the file storage.");
  }

  try {
    const stat = await fs.stat(file);

    if (stat.size > MAX_BYTES) throw new SourceError("The image is larger than 25 MB.");
    return await fs.readFile(file);
  } catch (err) {
    if (err instanceof SourceError) throw err;
    throw new SourceError("The image file is missing from the file storage.");
  }
}

async function readRemote(url: string): Promise<Buffer> {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new SourceError("The image URL is not valid.");
  }

  if (parsed.protocol !== "https:") {
    throw new SourceError("Only images from the shop's file storage or an https address can be used.");
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);

  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new SourceError("The image host is not a public address.");
  }

  const response = await fetch(parsed, { redirect: "error", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }).catch(() => {
    throw new SourceError("The image could not be downloaded.");
  });

  if (!response.ok) throw new SourceError(`The image could not be downloaded (HTTP ${response.status}).`);
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) throw new SourceError("The image is larger than 25 MB.");

  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.length > MAX_BYTES) throw new SourceError("The image is larger than 25 MB.");
  return bytes;
}

export async function readSourceImage(url: string): Promise<Buffer> {
  return (await readLocal(url)) ?? (await readRemote(url));
}
