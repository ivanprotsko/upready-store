# The sync scheduler: one run per (tenant × marketplace × kind), 429 backoff, a «Синхронизация» screen, expiry warnings

## What this is
Without a scheduler the mirror is refreshed by hand and every screen built on it shows yesterday. This task makes the
data live and — just as important — makes a sync that did NOT happen visible (rule 20a: zero is not empty).

## The standing invariant (Ivan, 2026-09-16 02:46 WITA)
Read-only. The scheduler only calls `runSync`, which only calls registered reads. It adds no write path.

## Sources
- `research/marketplace-spec.md` section 2.6 (intervals, single-run rule, backoff) and 2.7 (the panel).
- The core from `w12-marketplace-core`: `MARKETPLACES`, `mp_sync_run`, `mp_api_call`.
- Documented rate limits, both from the saved pages:
  **WB** — token bucket; for the Marketplace category a personal token gets 300 requests/minute with a burst of 20;
  a 4XX response counts as TEN requests; the 429 answer carries `X-Ratelimit-Retry`, `X-Ratelimit-Reset`,
  `X-Ratelimit-Limit`, and every other answer carries `X-Ratelimit-Remaining`
  (`docs/dev.wildberries.ru-ru-api-information.txt`).
  **Ozon** — no more than 50 requests per second on all methods from one Client-Id; `/v1/analytics/data` no more than
  once per minute (`docs/docs.ozon.ru-api-seller-index.txt`).
- Medusa scheduled jobs: `apps/backend/src/jobs/` and its framework README.

## Deliverables (one PR, branch `{{BRANCH}}`)

### 1. `apps/backend/src/jobs/marketplace-sync.ts`
Schedules per (tenant × marketplace × kind), intervals from the spec: cards and prices hourly, stocks every 15 min,
orders every 10 min, reviews and questions every 30 min, analytics daily. Intervals live in one named constant map,
not scattered as literals.

### 2. Single run per triple
A second run of the same triple while the first is `running` does not start. Implement it on the `mp_sync_run` row
itself (a `running` row is the lock) with a stale-lock timeout so a crashed process cannot park the kind forever —
name the timeout and say why you chose that number. Unit test: two concurrent starts → one `running` row, the second
call returns «already running» without touching the network (fetch spy 0 calls).

### 3. Backoff
On 429 honour `Retry-After` / `X-Ratelimit-Retry`, cap one backoff (WB transport already caps at 30 s — reuse the
policy, do not invent a second one), at most three attempts, then mark the run `failed` with the message. Unit test on
mocked responses; the test asserts the total wait is bounded.

### 4. Visibility — this is the point
- A failed run keeps its `mp_sync_run` row with `status='failed'` and the error text. It never disappears.
- Screen «Маркетплейсы → Синхронизация»: a row per (marketplace, kind) with last success time, rows, requests, current
  state, and the error of the last failure in full. A kind that has never run says «ни разу не запускалась», not «0».
- A warning when the key expires in under 14 days (Ozon keys live 3 months, so this will fire regularly).
- The operator-side log line for every failure carries the marketplace, the kind, the endpoint id and the status.

## Measurement (rule 18f) — the PR body quotes commands and outputs
1. `cd apps/backend && pnpm test:unit` → whole-file `ℹ fail 0`.
2. The concurrency test and the backoff test outputs.
3. On the LOCAL stand: let the job run at least twice for one kind —
   `select marketplace, kind, status, started_at, finished_at, rows, requests from mp_sync_run order by started_at desc limit 20;`
   with two rows at different times.
4. A deliberately failing run (point a fixture at a 500) — the red row on the screen and the row in the table.
5. Screenshots: the sync screen with a success, a never-run kind and a failure; the expiry warning (stub the date and
   say that you did).
Report: `{{WORKTREE}}/artifacts/docs/{{TASK_ID}}/report.md` + the UI `report.json` per the preamble.

## Do not
Busy-wait or poll in a loop to prove the schedule works — one bounded measurement is enough (rule 5h). Leave a dev
server or a job process alive at the end of the turn: stop what you started, identified by PORT, and re-measure.
Touch the live host.
