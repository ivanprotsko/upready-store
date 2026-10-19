# Stage 2 of t-2026-10-20-23: the owner cabinet in code, split into PRs

Starts on Ivan's approval of the prototype. Each slice is one PR against `main`, with the checks of
AGENTS.md (`pnpm check:backend-build` for a backend PR, the panel's `tsc` and `node --test`).
Estimates are of one Opus session, raw, before the lead's calibration.

Architecture: `docs/owner-cabinet/architecture.md`. Contract: `docs/owner-cabinet/contract/`.

| # | Slice | What is inside | Depends on | Estimate |
|---|---|---|---|---|
| 1 | Totals builder | `buildShopSummary(tenantId)` in the backend: one shop's `shop-summary/v1` from the queries `GET /tenants/analytics/summary` already runs, plus catalog, review and to-pack counts. A unit test validates its output against the schema. No route, no job yet. | — | 2–3 h |
| 2 | Instance registry and keys | `deploy/instances/registry.json` (ru, intl: panel URL, relay URL, public keys); `instance-check.mjs` reads it; key generation and rotation steps in `deploy/RUNBOOK-RU.md`. | — | 1–2 h |
| 3 | Relay container | `apps/owner-relay`: internal intake, schema check, Ed25519 signing, the exchange call, the answer check, the log. Services in `compose.ru-host.yml` and `compose.mt.yml`, egress to one host. Tests on fakes; memory measured on a stand. | 1, 2 | 4–6 h |
| 4 | Publish job and storage | Backend job every 5 min → relay; table `owner_summary_received` for what came back; `GET /tenants/owner/summary` (`owner-summary/v1`) with freshness. | 1, 3 | 3–4 h |
| 5 | RU identity module | `owner_identity`, the ticket signer `POST /tenants/me/owner-ticket` (aud, nonce, 60 s, jti), the RU `/owner-sso` page. Written as a module the central platform panel can reuse. | 2 | 3–4 h |
| 6 | .com ticket check and first link | `POST /tenants/auth/owner-sso` on .com: signature, aud, exp, nonce, single use; `owner_link`; the one-time password link screen. | 5 | 3–4 h |
| 7 | Panel screens | «Сводка» page and its sidebar entry (only with two shops or more); the flat shop list in «…»; the sign-in button on .com; the switch and «ticket used» screens; phone and both themes, after the accepted prototype states. | 4, 6 | 5–7 h |
| 8 | Second factor for owners (optional) | Telegram confirmation of an owner's RU sign-in, since one account now opens both shops. | 5 | 3–4 h |

**Total:** slices 1–7 about 21–30 h; with 8 about 24–34 h. Slices 1, 2 and 5 can run in parallel.

**Rollout.** Every slice ships dark: no screen changes until slice 7. Slices 3–4 go to the RU host
first with `.com` as the only peer. A live run needs the release discipline of
`docs/instances/RULES.md` and Ivan's ok for each host.

## Questions for Ivan before stage 2

1. Should «Сводка» also show one total converted to roubles at the Central Bank's rate, next to
   the per-currency rows? The prototype keeps currencies apart, as the «Обзор» does today.
2. The relay as a container on the existing RU host, or on a separate small RU server?
3. Slice 8 (a second factor for owners) now, or later?
4. A lawyer's look at the three points of `architecture.md` §8 before slice 6 goes live.
