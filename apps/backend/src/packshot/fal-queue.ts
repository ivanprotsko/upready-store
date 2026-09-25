/**
 * Minimal fal.ai queue client, ported from `scripts/store-media/fal.mjs`
 * (`runFalRequest`). No SDK and no new dependency.
 *
 * Two rules from that file hold here too.
 *   1. The key comes from `process.env.FAL_KEY` of the backend process (see
 *      `falKey()` in `config.ts`). It never passes through a shell, a log, an
 *      error message or an HTTP response.
 *   2. A provider URL is never a deliverable. `runFalRequest` returns BYTES and
 *      the caller stores them. An output URL survives only as provenance.
 *
 * Contract, as in fal.mjs (https://fal.ai/docs/model-endpoints/queue):
 *   POST https://queue.fal.run/{model}           -> { request_id, status_url, response_url }
 *   GET  status_url                              -> { status: IN_QUEUE | IN_PROGRESS | COMPLETED }
 *   GET  response_url                            -> the model's own output payload
 *   header Authorization: Key <FAL_KEY>
 * A model id with a sub-path (`fal-ai/bria/background/remove`) polls under the
 * app id, so the client follows `status_url` and `response_url` from the submit
 * answer instead of building them.
 *
 * Input images go as a base64 `data:` URI. The model pages say so for every file
 * input (fal.ai/models/fal-ai/bria/background/remove/api, 2026-09-25: «You can
 * pass a Base64 data URI as a file input. The API will handle the file decoding
 * for you.»), and it is what works here: the backend is not reachable from the
 * internet and needs no upload to fal storage first.
 */

const QUEUE = "https://queue.fal.run";

export class FalError extends Error {}

export type FalImage = { url: string; buffer: Buffer; contentType: string; width: number | null; height: number | null };

export type FalRun = {
  requestId: string;
  model: string;
  outputs: FalImage[];
  wallMs: number;
};

type Fetch = typeof fetch;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** First 300 characters of a provider payload, for an error a human reads. */
const excerpt = (payload: unknown): string => {
  try {
    return JSON.stringify(payload).slice(0, 300);
  } catch {
    return String(payload).slice(0, 300);
  }
};

export const toDataUri = (buffer: Buffer, contentType: string): string =>
  `data:${contentType};base64,${buffer.toString("base64")}`;

/**
 * Submits one request, polls it to COMPLETED and downloads every image to
 * memory. `image` (Bria) and `images` (nano-banana) are both read.
 */
export async function runFalRequest({
  key,
  model,
  input,
  timeoutMs,
  pollMs,
  fetchImpl = fetch,
}: {
  key: string;
  model: string;
  input: Record<string, unknown>;
  timeoutMs: number;
  pollMs: number;
  fetchImpl?: Fetch;
}): Promise<FalRun> {
  const auth = { Authorization: `Key ${key}` };
  const t0 = Date.now();

  const submit = await fetchImpl(`${QUEUE}/${model}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const submitted = (await submit.json().catch(() => ({}))) as Record<string, unknown>;

  if (!submit.ok) {
    throw new FalError(`fal.ai refused the request (HTTP ${submit.status}): ${excerpt(submitted)}`);
  }

  const requestId = submitted.request_id as string | undefined;

  if (!requestId) {
    throw new FalError(`fal.ai returned no request_id: ${excerpt(submitted)}`);
  }

  const statusUrl = (submitted.status_url as string | undefined) ?? `${QUEUE}/${model}/requests/${requestId}/status`;
  const responseUrl = (submitted.response_url as string | undefined) ?? `${QUEUE}/${model}/requests/${requestId}`;

  let status = (submitted.status as string | undefined) ?? "IN_QUEUE";

  while (status !== "COMPLETED") {
    if (Date.now() - t0 > timeoutMs) {
      throw new FalError(`fal.ai request ${requestId} is still ${status} after ${Math.round(timeoutMs / 1000)} s`);
    }

    await sleep(pollMs);

    const polled = await fetchImpl(statusUrl, { headers: auth });
    const body = (await polled.json().catch(() => ({}))) as Record<string, unknown>;

    if (!polled.ok) {
      throw new FalError(`fal.ai status HTTP ${polled.status} for ${requestId}: ${excerpt(body)}`);
    }

    status = body.status as string;

    // The queue reports a failure by an error payload, not by a status word of
    // its own, so anything that is neither queued nor running is terminal.
    if (!["IN_QUEUE", "IN_PROGRESS", "COMPLETED"].includes(status)) {
      throw new FalError(`fal.ai request ${requestId} ended as ${status}: ${excerpt(body)}`);
    }
  }

  const answer = await fetchImpl(responseUrl, { headers: auth });
  const result = (await answer.json().catch(() => ({}))) as Record<string, unknown>;

  if (!answer.ok) {
    throw new FalError(`fal.ai result HTTP ${answer.status} for ${requestId}: ${excerpt(result)}`);
  }

  const described = [
    ...(Array.isArray(result.images) ? result.images : []),
    ...(result.image && typeof result.image === "object" ? [result.image] : []),
  ] as { url?: string; content_type?: string; width?: number; height?: number }[];

  if (described.length === 0) {
    throw new FalError(`fal.ai request ${requestId} completed with no image: ${excerpt(result)}`);
  }

  const outputs: FalImage[] = [];

  for (const image of described) {
    if (!image.url) {
      throw new FalError(`fal.ai request ${requestId} returned an image without a url`);
    }

    // The output URL is public (fal.media) and needs no key; bytes go to memory at once.
    const download = image.url.startsWith("data:")
      ? null
      : await fetchImpl(image.url);

    if (download && !download.ok) {
      throw new FalError(`Could not download the fal.ai result of ${requestId} (HTTP ${download.status})`);
    }

    const buffer = download
      ? Buffer.from(await download.arrayBuffer())
      : Buffer.from(image.url.slice(image.url.indexOf(",") + 1), "base64");

    outputs.push({
      url: image.url.startsWith("data:") ? "data:" : image.url,
      buffer,
      contentType: download?.headers.get("content-type") ?? image.content_type ?? "",
      width: image.width ?? null,
      height: image.height ?? null,
    });
  }

  return { requestId, model, outputs, wallMs: Date.now() - t0 };
}
