// Minimal fal.ai HTTP client — no SDK, no new dependency in the lockfile.
//
// It sits next to replicate.mjs and keeps the same two rules:
//   1. The API key is read from ~/upready/.env.keys inside the process, never
//      passed through a shell, never printed, never written to disk.
//   2. A provider URL is never a deliverable. `runFalRequest` returns BYTES;
//      an output URL survives only as provenance (memory/patterns/ai-provider-url-rot.md).
//
// Contract fetched from https://fal.ai/docs/model-endpoints/queue on 2026-09-08 03:5x WITA,
// not written from memory:
//   POST   https://queue.fal.run/{model}                       -> {request_id, status_url, response_url, cancel_url, queue_position}
//   GET    https://queue.fal.run/{model}/requests/{id}/status  -> {status: IN_QUEUE|IN_PROGRESS|COMPLETED, ...}
//   GET    https://queue.fal.run/{model}/requests/{id}         -> the model's own output payload
//   header Authorization: Key <FAL_KEY>
// Model input schemas (same source, /models/<id>/api):
//   fal-ai/nano-banana      prompt, num_images, seed, aspect_ratio, output_format, safety_tolerance, sync_mode
//   fal-ai/nano-banana-pro  the same PLUS resolution (1K|2K|4K, default 1K) and system_prompt
// Output for both: { images: [{url, content_type, file_name, file_size, width, height}], description }

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const QUEUE = 'https://queue.fal.run';

export function loadFalKey() {
  const file = path.join(os.homedir(), 'upready', '.env.keys');
  const prefix = 'FAL_KEY=';
  const line = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(prefix));
  if (!line) throw new Error(`${prefix.slice(0, -1)} not found in ${file}`);
  const key = line.slice(prefix.length).trim().replace(/^["']|["']$/g, '');
  if (!key) throw new Error(`${prefix.slice(0, -1)} is empty in ${file}`);
  return key;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Submit one request to the fal queue, poll it to COMPLETED, download every
 * image to bytes.
 * Returns { requestId, status, result, outputs: [{url, buffer, contentType, width, height}], wallMs }.
 * `result` is the provider's own JSON payload, kept whole for the sidecar.
 */
export async function runFalRequest({ key, model, input, timeoutMs = 600_000, pollMs = 2000 }) {
  const auth = { Authorization: `Key ${key}` };
  const t0 = Date.now();

  const res = await fetch(`${QUEUE}/${model}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const submitted = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`fal submit failed ${res.status}: ${JSON.stringify(submitted).slice(0, 500)}`);
  }
  const requestId = submitted.request_id;
  if (!requestId) throw new Error(`fal submit returned no request_id: ${JSON.stringify(submitted).slice(0, 500)}`);
  const statusUrl = submitted.status_url || `${QUEUE}/${model}/requests/${requestId}/status`;
  const responseUrl = submitted.response_url || `${QUEUE}/${model}/requests/${requestId}`;

  // Poll. One network resource, no callback available, fixed interval, hard deadline.
  let status = submitted.status || 'IN_QUEUE';
  let last = submitted;
  while (status !== 'COMPLETED') {
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(`fal request ${requestId} still ${status} after ${timeoutMs} ms`);
    }
    await sleep(pollMs);
    const s = await fetch(statusUrl, { headers: auth });
    last = await s.json().catch(() => ({}));
    if (!s.ok) {
      throw new Error(`fal status ${s.status} for ${requestId}: ${JSON.stringify(last).slice(0, 500)}`);
    }
    status = last.status;
    // The queue reports failure by handing back an error payload, not by a status word
    // of its own, so anything that is neither queued nor running is terminal.
    if (!['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
      throw new Error(`fal request ${requestId} ended as ${status}: ${JSON.stringify(last).slice(0, 500)}`);
    }
  }

  const r = await fetch(responseUrl, { headers: auth });
  const result = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`fal result ${r.status} for ${requestId}: ${JSON.stringify(result).slice(0, 500)}`);
  const wallMs = Date.now() - t0;

  const images = Array.isArray(result.images) ? result.images : [];
  if (images.length === 0) {
    throw new Error(`fal request ${requestId} completed with no images: ${JSON.stringify(result).slice(0, 500)}`);
  }

  // Bytes to memory immediately; the caller writes them to disk before anything else.
  const outputs = [];
  for (const img of images) {
    const d = await fetch(img.url);
    if (!d.ok) throw new Error(`download failed ${d.status} for image of ${requestId}`);
    outputs.push({
      url: img.url,
      buffer: Buffer.from(await d.arrayBuffer()),
      contentType: d.headers.get('content-type') || img.content_type || '',
      width: img.width ?? null,
      height: img.height ?? null,
    });
  }

  return { requestId, status, result, outputs, wallMs, queueStatus: last };
}
