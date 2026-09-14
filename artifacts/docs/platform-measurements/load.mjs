// Open-loop load generator for GET /store/products?limit=12.
// Node 26 built-in fetch, fixed-rate scheduler (issues a request every 1000/rps ms regardless of
// whether the previous one finished — that is what "open-loop" means here, as opposed to a
// closed-loop / concurrency-limited runner). Records latency per request, prints
// count / errors / p50 / p95 / p99 / max (ms) and the achieved rps.
//
// Usage: node load.mjs <baseUrl> <publishableKey> [rps] [durationSec] [warmupSec]
// Example: node load.mjs http://localhost:9026 pk_xxx 50 30 5

const [, , baseUrlArg, pkArg, rpsArg, durationArg, warmupArg] = process.argv;

if (!baseUrlArg || !pkArg) {
  console.error("usage: node load.mjs <baseUrl> <publishableKey> [rps] [durationSec] [warmupSec]");
  process.exit(1);
}

const baseUrl = baseUrlArg.replace(/\/$/, "");
const publishableKey = pkArg;
const rps = Number(rpsArg || 50);
const durationSec = Number(durationArg || 30);
const warmupSec = Number(warmupArg || 5);
const url = `${baseUrl}/store/products?limit=12`;
const intervalMs = 1000 / rps;

async function fireOne(latencies, errors) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      headers: { "x-publishable-api-key": publishableKey },
    });
    const dt = performance.now() - t0;
    if (!res.ok) {
      errors.push({ status: res.status, dt });
    } else {
      await res.arrayBuffer(); // drain body, count it in latency
      latencies.push(performance.now() - t0);
    }
  } catch (err) {
    errors.push({ status: "network-error", message: String(err), dt: performance.now() - t0 });
  }
}

async function runPhase(seconds, label) {
  const latencies = [];
  const errors = [];
  const inFlight = [];
  const phaseStart = performance.now();
  let scheduled = 0;

  while (performance.now() - phaseStart < seconds * 1000) {
    const targetTime = phaseStart + scheduled * intervalMs;
    const now = performance.now();
    if (now < targetTime) {
      await new Promise((r) => setTimeout(r, targetTime - now));
    }
    inFlight.push(fireOne(latencies, errors));
    scheduled += 1;
  }
  await Promise.all(inFlight);
  const elapsedSec = (performance.now() - phaseStart) / 1000;
  const achievedRps = scheduled / elapsedSec;
  return { latencies, errors, scheduled, elapsedSec, achievedRps, label };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function report(result) {
  const sorted = [...result.latencies].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  const max = sorted.length ? sorted[sorted.length - 1] : NaN;
  console.log(`\n=== ${result.label} ===`);
  console.log(`url=${url}`);
  console.log(`target_rps=${rps} achieved_rps=${result.achievedRps.toFixed(1)} duration_s=${result.elapsedSec.toFixed(2)}`);
  console.log(`count=${result.scheduled} ok=${result.latencies.length} errors=${result.errors.length}`);
  console.log(`p50_ms=${p50.toFixed(2)} p95_ms=${p95.toFixed(2)} p99_ms=${p99.toFixed(2)} max_ms=${max.toFixed(2)}`);
  if (result.errors.length) {
    console.log(`first_errors=${JSON.stringify(result.errors.slice(0, 5))}`);
  }
}

console.log(`warming up ${warmupSec}s at ${rps} rps against ${url} ...`);
await runPhase(warmupSec, "warmup (discarded)");
console.log(`measuring ${durationSec}s at ${rps} rps ...`);
const result = await runPhase(durationSec, "measurement");
report(result);
