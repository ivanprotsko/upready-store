# Goal

Produce `{{MISSION_DIR}}/research/gap-matrix.md` — one table that says, for every function InSales Combo
advertises, whether our platform has it, where in our code it lives, and how much a real shop needs it.
Everything else today is measured against this file, and task `q03-gap-recheck` re-reads it in the evening.

This is a desk task: you read two files that already exist and produce a third. You write no product code and
you touch no git branch.

## Inputs (read in full, both are on disk)

- `{{MISSION_DIR}}/research/insales-combo-features.md` — 169 functions of the competitor in 17 categories,
  each with the URL where it is named. Section 4 of that file carries the same list as JSON with stable `id`s.
  **Use those ids verbatim** as the key of your rows.
- `{{MISSION_DIR}}/research/upready-store-capabilities.md` — what our `dev` branch has on 2026-09-15, with
  statuses DONE / PARTIAL / MISSING, the paths behind each, and §6 «Топ-15 разрывов».
- `{{MISSION_DIR}}/research/telegram-digest.md` §3 and §8 — what the client actually asked for. A function the
  competitor has and no real shop needs is worth less than a function the client named out loud.
- `{{MISSION_DIR}}/tasks.json` — today's queue. For every row you mark as a gap, say whether a task of today
  closes it, and which one.

## What the file must contain

1. A one-paragraph summary: how many of the 169 we have, partially have, and lack, and the three gaps that hurt
   a real shop most.
2. The table, one row per InSales function id:

   | id | категория | функция | у нас | где в коде / почему нет | нужно реальному магазину | задача дня |
   |---|---|---|---|---|---|---|

   - «у нас» is one of `есть` / `частично` / `нет` / `не применимо`. Use `не применимо` for things that belong
     to a hosted SaaS business rather than to a shop (referral programme, InSales University, their own app
     store) and say in one clause why.
   - «где в коде» carries a real path from the capabilities inventory when the answer is `есть` or `частично`,
     and the reason when it is `нет`. Never invent a path: if the inventory does not name one, write
     «не найдено».
   - «нужно реальному магазину» is `критично` / `важно` / `можно позже`, judged against the client's own words
     where they exist, and quote the message id from the telegram digest when they do (e.g. `#463839`).
   - «задача дня» is the task id from `tasks.json` or `—`.
3. A short closing section «Чего нет ни у нас, ни в задачах дня» listing the `критично` and `важно` rows with no
   task, ordered by how much they hurt. That list is the backlog Ivan reads first.

## Rules for this file

- Every claim about our side comes from the capabilities inventory or from a path you opened yourself. If you
  check something in the repository, quote the command and its output in a footnote of the row.
- Zero is a measurement too: if you say a function is missing because a search found nothing, put the search
  command and its output in the footnote. Widen it once (second root, other extension) before you call it zero.
- Do not re-fetch insales.ru. The inventory was collected 2026-09-15 and the network budget was spent; work
  from the file.
- Russian prose, plain words, no marketing. A metric carries its unit and its meaning.

## Finish

Write the file, then print:

```
ARTIFACT: {{MISSION_DIR}}/research/gap-matrix.md
RESULT: OK <N функций: X есть, Y частично, Z нет; критичных без задачи: K>
```

If you cannot finish, print `RESULT: FAIL <reason>` as the last line and leave whatever you did write in place.
