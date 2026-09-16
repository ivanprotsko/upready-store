# {{TASK_ID}} — WB write, class "feedback_answers": answer reviews and questions from the seller panel, per-answer owner confirmation, dry-run through the write core. NO live write.

Worktree `{{WORKTREE}}`, branch `{{BRANCH}}` from `{{BASE}}`. Requires merged w20 (write core) and the mirrors `wb_feedback` (w01) and `wb_question` (w03; if not merged, do feedbacks only and say so).

Ivan's order of 2026-09-16 04:44 WITA: «заведи все задачи, и для каждой укажи есть ли такой функционал у конкурентов. Сразу проектируй все так, чтобы проверять есть ли аналогичные функции для озон…». Invariant of 02:46: nothing is sent to WB; answers end as dry-run audit rows.

## Competitor — YES (and more)
InSales Combo: «Автоответы на отзывы Wildberries — AI-генератор ответов на отзывы» (research/insales-combo-features.md line 199, https://www.insales.ru/page/combo); «Мультиканальный чат „Диалоги +“» (line 251). We build manual answers with templates; AI drafting is a listed follow-up, not built here.

## Build
1. Registry entries for "answer a feedback" and "answer a question" (and the "mark viewed" call if documented as a mutation) — method+path+body from the WB docs (saved copies FIRST: `artifacts/docs/w01-wb-readonly-client/docs/` and `artifacts/docs/w10-marketplace-spec/docs/` incl. `wb-methods-index.tsv`; do NOT open dev.wildberries.ru — its anti-bot already banned this machine's IP with HTTP 498 and blocks Ivan's own browser with it; a page missing locally is listed in your report as «docs missing: <url>», not fetched), with docUrl and bodySchema.
2. Data: `wb_feedback.draft_answer`, `wb_question.draft_answer` (nullable text), `answer_status` (draft|confirmed|sent|failed); answer templates per tenant (3 defaults in Russian: спасибо за отзыв / извинение и контакт / ответ на вопрос о составе).
3. Panel «Отзывы и вопросы» tab on the Wildberries page: list with rating, text, date, product (via link table or vendor_code), draft field, template picker, «Подтвердить и отправить» → confirmation dialog quoting the answer → `wbWrite` (dry-run today) → status; unanswered first; filter answered/unanswered.
4. Owner consent per ANSWER (in addition to the class consent from w20): the audit row carries the answer text hash and the confirming user.
5. Tests: cannot send without a draft; per-answer confirmation recorded; dry-run = 0 fetches; answered items cannot be answered twice.

## Measurements for the PR
Screenshots of the tab with real mirrored reviews on the local stand; audit rows; test names; Ozon analogue: review/question answer methods from https://docs.ozon.ru/api/seller/ with URLs, or «не найдено». No PII beyond what WB shows publicly; nothing in git except code and fixtures. `git grep -n "eyJhbGci" -- .` empty. Report per the preamble.
