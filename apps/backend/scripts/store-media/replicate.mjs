// Minimal Replicate HTTP client — no SDK.
//
// Two rules this file exists to enforce:
//   1. The API key is read from ~/upready/.env.keys inside the process, never
//      passed through a shell, never printed, never written to disk.
//   2. A provider URL is never a deliverable. `runPrediction` returns BYTES;
//      the only place an output URL survives is the sidecar's `outputUrl`
//      field, kept purely as provenance for a URL that is already dead
//      (Replicate purges outputs in about a day — memory/patterns/ai-provider-url-rot.md).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = 'https://api.replicate.com/v1';

export function loadReplicateKey() {
  const file = path.join(os.homedir(), 'upready', '.env.keys');
  const prefix = 'REPLICATE_DEFAULT_API_KEY=';
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
 * Create a prediction, poll it to a terminal state, and download every output
 * to bytes. Returns { prediction, outputs: [{ url, buffer, contentType }] }.
 */
export async function runPrediction({ key, version, model, input, timeoutMs = 300_000 }) {
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  const createdAt = new Date().toISOString();
  const t0 = Date.now();
  const res = await fetch(`${API}/predictions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ version, input }),
  });
  const created = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`create prediction failed ${res.status}: ${JSON.stringify(created).slice(0, 500)}`);
  }

  // Poll. Not a busy-wait on a human: this is one network resource with no
  // callback available, polled at a fixed interval against a hard deadline.
  let prediction = created;
  const getUrl = created.urls?.get || `${API}/predictions/${created.id}`;
  while (!['succeeded', 'failed', 'canceled'].includes(prediction.status)) {
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(`prediction ${created.id} still ${prediction.status} after ${timeoutMs} ms`);
    }
    await sleep(2000);
    const p = await fetch(getUrl, { headers: { Authorization: `Bearer ${key}` } });
    prediction = await p.json();
  }
  const wallMs = Date.now() - t0;

  if (prediction.status !== 'succeeded') {
    return { prediction, outputs: [], wallMs, createdAt, model };
  }

  const urls = (Array.isArray(prediction.output) ? prediction.output : [prediction.output]).filter(
    (u) => typeof u === 'string' && u.startsWith('http'),
  );
  if (urls.length === 0) {
    throw new Error(`prediction ${prediction.id} succeeded with no downloadable output`);
  }

  // Bytes to memory immediately; the caller writes them to disk before doing
  // anything else. A provider URL has hours to live, not days.
  const outputs = [];
  for (const url of urls) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`download failed ${r.status} for output of ${prediction.id}`);
    outputs.push({
      url,
      buffer: Buffer.from(await r.arrayBuffer()),
      contentType: r.headers.get('content-type') || '',
    });
  }

  return { prediction, outputs, wallMs, createdAt, model };
}

/**
 * Pull whatever the provider itself says a prediction cost. Replicate exposes no
 * `pricing` field on the model object and no billing endpoint on the account
 * (both checked, 2026-09-07), so the prediction object is the only candidate.
 * Returns { costUsd: number|null, source: string, evidence: object } — never a guess.
 */
export function readProviderCost(prediction) {
  const direct = [
    ['metrics.cost', prediction?.metrics?.cost],
    ['metrics.total_cost', prediction?.metrics?.total_cost],
    ['metrics.cost_usd', prediction?.metrics?.cost_usd],
    ['cost', prediction?.cost],
    ['billing.cost', prediction?.billing?.cost],
  ];
  for (const [source, value] of direct) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { costUsd: value, source, evidence: { [source]: value } };
    }
  }
  // Nothing named cost/billing anywhere in the object?  Say so; do not invent one.
  const scan = JSON.stringify(prediction ?? {});
  const hits = [...scan.matchAll(/"([a-z_]*(?:cost|price|billing)[a-z_]*)":\s*([^,}]{0,60})/gi)].map(
    (m) => `${m[1]}=${m[2]}`,
  );
  return {
    costUsd: null,
    source: hits.length ? `unrecognised-cost-fields: ${hits.join(' ')}` : 'not-exposed-by-provider',
    evidence: { metrics: prediction?.metrics ?? null, costFieldsFound: hits },
  };
}
