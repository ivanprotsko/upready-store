# Reviews and questions from WB and Ozon in the panel: read, filter, draft an answer — no sending

## What this is
Rows 10 and 11 of the parity matrix (`research/marketplace-spec.md`, section 1). InSales Combo sells «автоответы на
отзывы Wildberries (AI)». In our read-only frame we do everything up to the send: import, filter, and a DRAFT answer
stored locally. The send button does not exist — that is phase 4 (spec section 4), and the report says so plainly.

## The standing invariant (Ivan, 2026-09-16 02:46 WITA)
Read-only. `POST /api/v1/feedbacks/answer` (WB) and `POST /v1/review/comment/create` / `POST /v1/question/answer/create`
(Ozon) are on the mutation deny-list and must stay unregistrable. A test asserts no handler of this screen reaches one.

## Sources
- WB reads, all GET, from `artifacts/docs/w01-wb-readonly-client/docs/dev-wildberries-ru-ru-docs-openapi-customer-communication.txt`:
  `GET /api/v1/feedbacks` (list), `/api/v1/feedback` (one), `/api/v1/feedbacks/count`,
  `/api/v1/feedbacks/count-unanswered`, `/api/v1/feedbacks/archive`, `/api/v1/questions`, `/api/v1/questions/count`,
  `/api/v1/questions/count-unanswered`, `/api/v1/new-feedbacks-questions`. Host `feedbacks-api.wildberries.ru`.
  Oksana's key has bit 7 «Access to Feedbacks and Questions», so these are available.
- Ozon reads (only if `w11` merged): `POST /v2/review/list`, `POST /v2/review/count`, `POST /v2/review/info`,
  `POST /v1/review/comment/list`, `POST /v1/question/list`, `POST /v1/question/info`.
  **Subscription gate, documented**: reviews need «Управление отзывами» or Premium Pro; questions need Premium Plus.
  The `/v1/review/*` family is deprecated in favour of `/v2/review/*` — register v2.
  If the cabinet has no such subscription the methods will refuse: record the actual response, do not assume.
- `research/marketplace-spec.md` section 2.3 (`mp_review`, `mp_question`).
- Existing shop reviews module (a review imported from a marketplace must not silently appear on the storefront):
  look at the `product-review` module before deciding where an imported review may go.
- Geist: `~/upready/packages/geist-kit/AGENTS.md`.

## Deliverables (one PR, branch `{{BRANCH}}`)

### 1. Import into `mp_review` / `mp_question`
Sync kinds `reviews` and `questions` per adapter, one `mp_sync_run` per kind. Media links from a review are stored as
URLs in `raw`; nothing is downloaded in this task. Rows carry `is_answered` as the marketplace reports it.

### 2. Screen «Маркетплейсы → Отзывы»
Two tabs (отзывы / вопросы). Per row: marketplace, product (through `mp_link`, with «нет в магазине» when unlinked),
rating, text, pros and cons, author, date, answered state. Filters: marketplace · rating · «без ответа» · period.
Counts in the tab labels. An empty result names the filter that produced it.

### 3. The draft
A per-review text area saved to `mp_review.answer_draft` with `answer_draft_at`. Purely local. If a generator is wired
in, it runs locally and its absence must not break the screen — a missing generator disables the «сгенерировать»
button with a reason, it does not blank the row (rule 19h: an unanswered state is not an «off» state).
**No send button, no bulk send, no scheduled send.** The screen states once, in plain Russian, that sending answers to
the marketplace is not enabled.

### 4. The read-only proof
A test that walks the screen's handlers and asserts none reaches a deny-listed endpoint id, and a test that the
adapters' registries still contain no answer/comment endpoint.

## Measurement (rule 18f) — the PR body quotes commands and outputs
1. `cd apps/backend && pnpm test:unit` → whole-file `ℹ fail 0`.
2. On the LOCAL stand for `cherkashino`: the WB import, then
   `select marketplace, count(*), count(*) filter (where not is_answered) from mp_review group by 1;` and the same for
   `mp_question`.
3. `select endpoint_id, method, count(*) from mp_api_call where endpoint_id like '%feedback%' or endpoint_id like '%question%' group by 1,2;`
4. Screenshots: the list, the «без ответа» filter, a saved draft, the state with no generator.
5. For Ozon: either the real response of `POST /v2/review/list` (including a refusal, quoted verbatim, if the cabinet
   lacks the subscription) or the one-line statement that the key does not exist yet.
Report: `{{WORKTREE}}/artifacts/docs/{{TASK_ID}}/report.md` + the UI `report.json` per the preamble.

## Do not
Publish an imported marketplace review on the storefront by default. Add any send path. Assume a subscription the
cabinet may not have. Touch the live host.
