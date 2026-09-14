# Goal

Two documents that close the day: one screen for Ivan, and one message he can forward to the client without
editing it.

## Inputs

Read all of these before writing a word; everything you state must come from one of them:

- `{{MISSION_DIR}}/REPORT.md` and `{{MISSION_DIR}}/logs/dispatcher.jsonl` — every task and its final state.
- `{{MISSION_DIR}}/artifacts/q03-gap-recheck/gap-recheck.md` — the numbers against the competitor bar.
- `{{MISSION_DIR}}/artifacts/q01-qa-customer/report.md`, `q02-qa-owner/report.md` — what the live shop does.
- `{{MISSION_DIR}}/artifacts/d03-deploy-mt-3/report.md` — what is live and the merged list.
- `{{MISSION_DIR}}/artifacts/x01-tenant-live-import/report.md` and `x02-domains/domain-instruction.md`.
- `{{MISSION_DIR}}/logs/blocked-*.md`, if any — what stopped and why.
- `{{MISSION_DIR}}/research/telegram-digest.md` §6 and §7 — the open questions with the client, and how she
  reads messages.

## File 1 — `{{MISSION_DIR}}/artifacts/{{TASK_ID}}/for-ivan.md`

Russian, one screen, in this order:

1. **Где магазин** — the links to open, each with what he will see there and its status code as measured by the
   last deploy.
2. **Что сделано за день** — merged pull requests grouped by what they give a shop owner, not by branch name.
   Numbers, not adjectives.
3. **Что не доехало** — tasks that ended `failed`, `blocked` or `needs-ivan`, each with one line of why and what
   would unblock it.
4. **Развилки, которые может решить только Иван** — decisions, each with the options, a recommendation, and what
   the plan did in the meantime. No question is left without a default already executed.
5. **Риски** — what could bite tomorrow, with the evidence line.
6. **Первое, что стоит сделать завтра** — five items, ordered.

No background, no retelling of the mission. He wrote it.

## File 2 — `{{MISSION_DIR}}/artifacts/{{TASK_ID}}/for-oksana.md`

Russian, plain language, a numbered list, ready to be sent as one Telegram message. She writes in one line,
does not read technical text, and the format that has worked before is one message with a numbered list of what
is needed from her (`{{MISSION_DIR}}/research/telegram-digest.md` §7, #469363).

- Open with one sentence: the shop is online and here is the link.
- Then two or three sentences of what she can already do there, in her words, not ours («ваш каталог, 29
  товаров, страницы, оформление заказа»).
- Then the numbered list of what is needed from her, each item one sentence, each saying what it unblocks:
  the missing legal details, the shop e-mail, the domain identification, the Wildberries token, the Yandex ID,
  the choice of the shop's name. Take these from the open questions in the digests and from today's reports.
  Say nothing about a deadline, and promise nothing that is not already true.
- Do not include passwords, internal URLs, branch names, task ids or anything technical.
- Do not invent a detail she has already given, and do not ask again for something the digests record as
  received.

## Rules

- Every number and link is copied from a report, never remembered.
- Timestamps come from `date "+%Y-%m-%d %H:%M WITA"` at the moment you write them.
- If a report you need does not exist because its task never finished, say so in `for-ivan.md` in one line
  rather than filling the gap with a guess.

## Finish

```
ARTIFACT: {{MISSION_DIR}}/artifacts/{{TASK_ID}}/for-ivan.md
ARTIFACT: {{MISSION_DIR}}/artifacts/{{TASK_ID}}/for-oksana.md
RESULT: OK сводка для Ивана и сообщение Оксане готовы
```
