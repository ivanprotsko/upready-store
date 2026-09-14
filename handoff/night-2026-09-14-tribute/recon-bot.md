# Recon: @upreadystore_bot (PR #11, feature/upreadystore_bot) — can it be LIVE tonight?

Worktree: `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feature/upreadystore_bot`
Code: `apps/bot`. Measured 2026-09-14 (WITA, exact clock not re-queried per call).

## 1. What apps/bot contains

```
apps/bot/
  .env            (600, present, TELEGRAM_UPREADY_STORE_BOT set — see §3)
  .env.example
  README.md
  package.json
  tsconfig.json
  node_modules/   (typescript + @types/node only, symlinked from pnpm store)
  src/
    index.ts       process: long polling, routing, operator log
    route.ts       pure: Telegram update -> Action
    message.ts     pure: payload + links -> sendMessage body
    payments.ts    reads TRIBUTE_URL_* env, "unset link" vs "invalid link"
    plans.ts       plan content (copied from feature/pricing-copy PR #6)
    telegram.ts    thin Bot API client over global fetch
    log.ts
    message.test.ts, route.test.ts
```

`package.json`:
```json
{
  "name": "@upready/upreadystore-bot",
  "type": "module",
  "engines": { "node": ">=22.18.0" },
  "scripts": {
    "poll": "node --env-file-if-exists=.env src/index.ts",
    "test": "node --test src/*.test.ts",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": { "@types/node": "^22.10.0", "typescript": "^5.6.3" }
}
```

Runtime: Node >=22.18 (measured local `node --version` = v26.8.1). No runtime dependencies at
all — HTTP via global `fetch`, long polling (`getUpdates`), not a webhook. `apps/bot` IS included
in the pnpm workspace (`pnpm-workspace.yaml`: `packages: ["apps/**", ...]`, no exclusion for bot).

**No Dockerfile, no compose entry, no systemd unit for apps/bot anywhere in the worktree.**
`find`/`grep` for Dockerfile/compose referencing `apps/bot` returned only `apps/storefront/Dockerfile`
and `apps/backend/Dockerfile` (unrelated) plus `pnpm-lock.yaml` (workspace listing). This app has
**no containerized/deploy artifact today** — it is started as a bare `node` process only.

Start command (from README, confirmed by the live process actually running — see §4):
```sh
cd apps/bot && node --env-file-if-exists=.env src/index.ts > /tmp/upreadystore-bot.log 2>&1 &
```

## 2. Environment variables (grepped `process.env` across `src/`)

| Variable | File:line | Purpose |
|---|---|---|
| `TELEGRAM_UPREADY_STORE_BOT` | `src/index.ts:27` | Bot token. Required — process exits(1) with a log line if missing/blank. |
| `TRIBUTE_URL_PLAN_1_RU_MIR` | via `payments.ts` `envNameFor` | Payment link, plan 1 (free — normally absent by design) |
| `TRIBUTE_URL_PLAN_1_VISA_MC` | same | " |
| `TRIBUTE_URL_PLAN_2_RU_MIR` | same | Payment link, plan 2 "Профи" |
| `TRIBUTE_URL_PLAN_2_VISA_MC` | same | " |
| `TRIBUTE_URL_PLAN_3_RU_MIR` | same | Payment link, plan 3 "Мастер" |
| `TRIBUTE_URL_PLAN_3_VISA_MC` | same | " |
| `TELEGRAM_API_BASE` | `src/telegram.ts:11` | Optional override of Bot API base, default `https://api.telegram.org`; used only for local capture/testing. |

Design (confirmed in code, `payments.ts`/`message.ts`): an unset or invalid Tribute URL is treated
as an ABSENCE, not a broken link — the bot never renders a dead button. Instead the message says
payment is being connected, and the gap is logged (`payment.link.missing` at start,
`payment.link.missing.onSend` per send). This is intentional per rule 20a and matches
`~/upready/memory/upreadystore-bot-deeplink-contract-2026-09-14.md`.

## 3. Is a bot token available?

**YES — already present in the worktree and confirmed LIVE right now.**

- `apps/bot/.env` exists (mode 600, created 2026-09-14 04:23), contains exactly one variable:
  `TELEGRAM_UPREADY_STORE_BOT` (46 chars, non-empty — length checked, value not printed).
- Live check (read-only `getMe` call, no message sent to anyone):
  ```
  curl -s https://api.telegram.org/bot$TOKEN/getMe
  → {"ok":true,"result":{"id":8710049173,"is_bot":true,
     "first_name":"Создание магазина","username":"upreadystore_bot", ...}}
  ```
  Confirms the token belongs to `@upreadystore_bot` and Telegram accepts it right now.
- `~/upready/.env.keys`: **no** `TELEGRAM_UPREADY_STORE_BOT` or equivalent upready-store bot key
  present (grep for upready/store/bot/telegram matched only unrelated bots — RizzLab, momgo,
  agent-creatr, telegram-master userbot, etc.). The canonical secrets registry does NOT hold this
  token — it lives only in the worktree's gitignored `apps/bot/.env` (and presumably in the sibling
  worktree `feature/onboarding/.env`, its documented source per the branch's own task prompt found
  in a live `ps -ef` listing). **Gap: token is not registered in `~/upready/.env.keys`.**
- Memory: `~/upready/memory/upreadystore-bot-deeplink-contract-2026-09-14.md` and
  `~/upready/memory/homepage-cta-routing-2026-09-14.md` both document the bot; the latter still
  lists "шесть URL Tribute для бота" as an OPEN question to Ivan — **Tribute payment URLs are not
  set anywhere** (all 6 `TRIBUTE_URL_PLAN_*` vars are unset in `.env`/`.env.example`).

## 4. Is the bot already running?

**YES — locally, right now, and has been since last night.**

```
ps -p 93693 -o pid,etime,command
  PID  ELAPSED COMMAND
93693 05:50:19 node --env-file-if-exists=.env src/index.ts
```
`lsof -p 93693` confirms its cwd is
`.../worktrees/b29f7dd2.../feature/upreadystore_bot/apps/bot`. Its log
(`artifacts/docs/2026-09-14-upreadystore-bot/run-live.log`) shows a real `bot.start` event at
`2026-09-13T20:33:20Z` against the live token (`upreadystore_bot`), followed by six
`payment.link.missing` lines — exactly the six Tribute vars, all unset.

**This is a foreground process on Ivan's own Mac, started by the branch worker as an acceptance
aid ("Иван откроет три ссылки сам" — per the capture README), not a managed/durable service.** It
has no supervisor, no restart-on-crash, no boot persistence. If this Mac sleeps, reboots, or the
terminal session is closed, the bot dies and the deep links stop answering.

Remote (Coolify host `root@84.46.251.149`):
```
ssh -i ~/.ssh/id_ed25519_contabo -o BatchMode=yes -o ConnectTimeout=5 root@84.46.251.149 true
ssh rc=0   (host reachable)
```
`docker ps` (read-only) lists 32 containers — agent-creatr stack, MT stack (backend/storefront/panel
per tenant), coolify system containers, bpj-dev, verdaccio. **No container for upreadystore-bot.**
`ps aux | grep -i bot` on the host shows only unrelated `postgres: typebot` connections and
`agent-crm/src/user-bot.js` (a different project's bot). **The bot is NOT deployed on the Coolify
host** — it exists only as the local foreground process above.

## 5. Minimal recipe to run it as a long-running process

Prerequisites proved:
- Node: worktree requires `>=22.18.0`; local `node --version` = `v26.8.1` — satisfied, no install needed.
- Dependencies: none beyond dev-only `typescript`/`@types/node`, already present in
  `apps/bot/node_modules` (symlinked from the pnpm store) — `corepack pnpm --filter
  @upready/upreadystore-bot typecheck` ran with **exit=0** without any install step, so the
  workspace is already provisioned. (No separate `npm install`/build log was needed since nothing
  had to be fetched; this is itself the proof the worktree already compiles clean.)
- Token: already live (§3) — a fresh run needs the SAME `apps/bot/.env` (already exists).

**A copy is already running (pid 93693) — do not start a second poller against the same token: two
long-polling processes on one Bot API token both call `getUpdates` and will race/duplicate
responses to the same chat.**

If a durable restart is wanted (e.g. to move it off the developer laptop onto a host that survives
sleep/reboot), the sequence is:

```sh
# on whatever host will run it long-term (needs Node >=22.18, e.g. the Coolify host or any always-on box)
cd apps/bot
cp .env.example .env            # then fill TELEGRAM_UPREADY_STORE_BOT (+ Tribute URLs when Ivan sends them)
corepack pnpm install --frozen-lockfile   # only if node_modules absent
corepack pnpm --filter @upready/upreadystore-bot typecheck   # tsc --noEmit, proves it compiles
corepack pnpm --filter @upready/upreadystore-bot test        # node --test, proves the routing/message logic
nohup node --env-file-if-exists=.env src/index.ts > /var/log/upreadystore-bot.log 2>&1 &
disown
```
For real durability (survives reboot) this needs a process supervisor (systemd unit / pm2 / a
Coolify "Docker Compose" or "Resource" — there is currently no Dockerfile, so Coolify's normal
git-deploy path does not apply without adding one) — **that packaging does not exist yet and is the
concrete missing piece**, not the code.

## 6. Deep-link routing — exact code

`src/route.ts`:
```ts
export function payloadFromStart(text: string): string | null {
  const match = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(.*))?$/s.exec(text.trim());
  if (match === null) return null;
  return (match[1] ?? "").trim();
}

export function routeUpdate(update: TelegramUpdate): Action {
  const callback = update.callback_query;
  if (callback !== undefined) { ... return { kind: "reply", ..., payload: (callback.data ?? "").trim(), source: "callback", ... }; }
  const message = update.message;
  if (message === undefined) return { kind: "ignore", reason: "no message" };
  const text = message.text;
  if (text === undefined) return { kind: "ignore", reason: "message without text" };
  const started = payloadFromStart(text);
  if (started !== null) return { kind: "reply", chatId: message.chat.id, payload: started, source: "command" };
  return { kind: "reply", chatId: message.chat.id, payload: "", source: "text" };
}
```
`src/plans.ts`: `planByPayload` maps `"plan_1"|"plan_2"|"plan_3"` to plan objects; unknown payload
→ `null` → menu (`message.ts` `buildReply`), never the first plan. This matches PR #11's claim:
`/start plan_1|plan_2|plan_3` each produce their own plan message, `/start` with no payload or any
unrecognized text produces the 3-plan menu, never silence and never a wrong default.

Live-captured proof exists already in the worktree at
`artifacts/docs/2026-09-14-upreadystore-bot/{run-live.log,capture-no-links.md,capture-with-links.md}`
— five scenarios × two config states, produced against the real `src/index.ts` and the real token
(for `getMe`; outbound `sendMessage` was captured via a local `TELEGRAM_API_BASE` stub, never sent
to a real chat, per rule 17b which blocks the live bot from sending to arbitrary/test chats).

**Pay buttons today: none are rendered.** All six `TRIBUTE_URL_PLAN_*_*` vars are unset in the live
`.env` → `payments.ts` reports `gap: "unset"` for all of them → `message.ts` never emits a button
with a URL → the outgoing message text instead says (verbatim, RU): for the free plan "тариф
бесплатный, магазин создаётся в мастере"; for Профи/Мастер "Оплату сейчас подключаем: платёжные
ссылки появятся здесь в ближайшее время. Напишите /start, чтобы проверить снова." This is
confirmed both by reading `message.ts`/`payments.ts` and by the actual `run-live.log` output
(6 `payment.link.missing` lines, all `gap:"unset"`).

## 7. Tests

```
corepack pnpm --filter @upready/upreadystore-bot typecheck   → exit=0 (tsc --noEmit, no errors)
corepack pnpm --filter @upready/upreadystore-bot test        → exit=0
  ℹ tests 15
  ℹ suites 0
  ℹ pass 15
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
```
All 15 unit tests pass (route parsing, message building, link-gap handling, HTML escaping).

## PR #11 mergeability

`gh pr view 11` → OPEN, base `dev`, head `feature/upreadystore_bot`, `mergeable: UNKNOWN` (GitHub
had not computed it yet at check time). Local `git merge-tree` of `origin/dev` vs
`origin/feature/upreadystore_bot` shows exactly ONE conflicting file: `HANDOFF.json` (both branches
appended different status/task entries — a process journal, trivially resolvable by keeping both
blocks) plus a clean add of `apps/bot/**` (no code conflicts, no reported conflict in `apps/bot/`
files or `pnpm-lock.yaml`). `git rev-list --left-right --count origin/dev...origin/feature/upreadystore_bot`
= `12  3` (dev is 12 commits ahead, branch is 3 ahead) — a normal, small rebase/merge, not a
long-divergent branch.

---

## Summary

**CAN-GO-LIVE: PARTIALLY.** The bot CODE is done, tested (15/15), typechecks clean, and is already
running live locally against the real `@upreadystore_bot` token (pid 93693, since 2026-09-13
20:33 UTC) — the three deep links `https://t.me/upreadystore_bot?start=plan_{1,2,3}` will answer
correctly RIGHT NOW as long as that laptop process keeps running. There is no code blocker and no
missing-token blocker.

**The blocking gap is packaging/hosting, not code or secrets:**
1. There is no Dockerfile/compose/systemd unit for `apps/bot` — nothing to hand Coolify or any
   host for a durable deploy. It only exists as a bare foreground `node` process on Ivan's Mac.
2. The bot token is not in `~/upready/.env.keys` (the canonical secrets store) — only in the
   worktree's gitignored `.env`, sourced originally from a sibling worktree
   `feature/onboarding/.env`. If that worktree/Mac is cleaned up, the token reference is lost.
3. All six Tribute payment URLs are unset — by design this degrades gracefully (a "connecting
   payment" message, no dead buttons) rather than breaking, so this alone does NOT block "live",
   but it does mean paid-plan buttons will show no payment button tonight.

**Exact sequence to make it durably live tonight** (assuming the currently-running pid 93693 stays
up as the stopgap): merge PR #11 into `dev` (resolve the one-file `HANDOFF.json` conflict by
keeping both status/task entries), then either (a) leave the current laptop process running through
the night as the de facto production bot (already proven live, zero extra work, but fragile to
sleep/reboot/session-close), or (b) copy `apps/bot/` + its `.env` to the Coolify host or any
always-on box and run:
```sh
cd apps/bot && corepack pnpm install --frozen-lockfile
nohup node --env-file-if-exists=.env src/index.ts > /var/log/upreadystore-bot.log 2>&1 & disown
```
No Dockerfile exists, so this is a bare-process deploy, not a Coolify-managed one, unless a
Dockerfile is written first (out of scope for "tonight" unless explicitly requested).

**What the paid-plan buttons on the landing should point to tonight:** keep them exactly as PR #12
already sets them — `https://t.me/upreadystore_bot?start=plan_2` / `plan_3` — because the bot is
live and answers correctly; it will just tell the user payment is "being connected" until Tribute
URLs arrive, which is the honest, currently-designed behavior, not a placeholder to swap out.
