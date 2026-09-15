# WB: turn `readOnly: 'unknown'` into a documented fact, show the key's scope and expiry in the panel

## What happened and why this is a task
w01 built `GET /tenants/wb/status` and had to report `readOnly: 'unknown'`: the meaning of the bits in the JWT's `s`
mask was not found in any source, and a memory is not a source (rule 17a). **The source has since been found and
saved.** `dev.wildberries.ru/en/docs/openapi/api-information`, section Authorization, table "Bit values" — copy at
`artifacts/docs/w10-marketplace-spec/docs/dev.wildberries.ru-ru-api-information.txt`:

| bit | property (if bit is 1) |
|---|---|
| 1 | Access to Content |
| 2 | Access to Analytics |
| 3 | Access to Prices and discounts |
| 4 | Access to Marketplace |
| 5 | Access to Statistics |
| 6 | Access to Promotion |
| 7 | Access to Feedbacks and Questions |
| 9 | Access to Buyers chat |
| 10 | Access to Supplies |
| 11 | Access to Buyers returns |
| 12 | Access to Documents |
| 13 | Access to Finance |
| 16 | Access to Users |
| **30** | **Read only token** |

The staff measured bits 1,2,3,4,5,7,30 on Oksana's key (`research/wb-plan.md`). By the table that means: a READ-ONLY
token with the categories Content, Analytics, Prices and discounts, Marketplace, Statistics, Feedbacks and Questions —
which is exactly why `supplies-api` (bit 10) and `finance-api` (bit 13) answered 403. Verify this yourself against the
saved page before you encode it; if the live page now says something different, the live page wins and you say so.

The same page also documents the token lifetime (180 days from creation) and the rate-limit headers
(`X-Ratelimit-Remaining`, `-Retry`, `-Reset`, `-Limit`).

## The invariant this task must NOT weaken
The transport must keep being read-only **by construction**, not because the flag says so. A key whose bit 30 is
absent must still be unable to write, because there is no write path in the code. Prove it with a test: with
`readOnly: false` forced, an attempt to `PUT`/`DELETE` through the transport still throws before any socket.

## Deliverables (one PR, branch `{{BRANCH}}`)
1. `apps/backend/src/modules/wb/token.ts` — decode the `s` mask into a named scope list using the documented table.
   Each entry cites the doc URL and the saved copy path in a comment. A bit the table does not name is reported as
   `unknown bit N`, not silently dropped.
2. A unit test covering every bit in the table plus an unnamed bit, plus a mask with bit 30 clear (→ `readOnly: false`).
3. `GET /tenants/wb/status` returns `readOnly: true | false` (no longer `'unknown'` when the token parses),
   `readOnlySource` = the doc URL, and `scopes: [{ name, granted }]`. The token itself is never returned.
4. The panel card shows the scope list with granted/denied marks, the expiry date, and a warning when the key expires
   in under 14 days. Labels in plain Russian, not raw enum names (rule 18e). Geist only
   (`~/upready/packages/geist-kit/AGENTS.md`).
5. The boot warning in `loaders/warn-on-writable-key.ts` keeps working and now names which scope made the key writable.

If `w12-marketplace-core` has already merged, do this inside the new `/settings/marketplaces` card instead of the old
page, and keep the old route answering.

## Measurement (rule 18f) — the PR body quotes commands and outputs
1. `cd apps/backend && pnpm test:unit` → the whole-file `ℹ fail 0` line.
2. On the LOCAL stand with tenant `cherkashino`'s key: `curl` to `GET /tenants/wb/status` (redact the owner token) —
   the body shows `readOnly: true`, `readOnlySource`, and the six granted categories.
3. The "write is still impossible" test output with `readOnly` forced to `false`.
4. Screenshot of the panel card, and a second screenshot with the expiry warning (stub the date, say that you did).
5. `git grep -n "eyJhbGci" -- .` → empty.
Report: `{{WORKTREE}}/artifacts/docs/{{TASK_ID}}/report.md` + the UI `report.json` per the preamble.

## Do not
Claim `readOnly: true` for a mask you did not decode. Make the transport consult the flag. Touch the live host.
