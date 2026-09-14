# Goal

Answer Ivan's question of the day with numbers: how much of the InSales Combo bar does the platform now clear,
and what does the client's live shop still lack?

His order was «реализовать завтра весь функционал, который есть у конкурентов https://www.insales.ru/page/combo
и протестировать его на реальном магазине клиента» (`{{MISSION_DIR}}/MISSION.md`, verbatim). That is a claim
that has to be measured, not declared.

## Inputs

- `{{MISSION_DIR}}/research/gap-matrix.md` — the morning matrix from task `r01-gap-matrix`: every InSales
  function with its morning verdict. This is your baseline; do not rebuild it, re-judge it.
- `{{MISSION_DIR}}/artifacts/q01-qa-customer/report.md` and `{{MISSION_DIR}}/artifacts/q02-qa-owner/report.md`
  — what the live shop actually does, measured today.
- `{{MISSION_DIR}}/artifacts/d03-deploy-mt-3/report.md` — the sha that is live and the complete list of pull
  requests merged today. What is not in that list is not live, whatever a branch claims.
- `{{MISSION_DIR}}/REPORT.md` and `{{MISSION_DIR}}/logs/dispatcher.jsonl` — the state of every task.

## What to do

1. **Establish what is live, from the live shop.** For every row of the matrix that a merged pull request claims
   to have closed, verify it on `https://cherkashino.shipshift.dev` or on
   `https://panel-store.upready.dev`, with a request, a screenshot or a click. A merged PR is evidence that code
   exists; only the live shop is evidence that the function works (rule 18f). Where verification is impossible
   without a secret nobody has (live payments, a carrier account, a marketplace token), say «код есть, живьём не
   проверено» and name what is missing — never upgrade it to «есть».
2. **Re-score every row**: morning verdict, evening verdict, evidence (URL, command or screenshot path), and the
   task that changed it. Rows nobody touched keep their morning verdict and carry an empty evidence cell; do not
   invent a check you did not run.
3. **Count.** How many of the functions are `есть`, `частично`, `нет`, `не применимо`, in the morning and in the
   evening, and the difference. Give the same counts restricted to the rows marked `критично` for a real shop,
   because that is the number that actually answers the question.
4. **Name what is left**, ordered: the `критично` rows still open, each with one line saying what it would take
   and whether anything outside our control blocks it (a secret, an account, a legal step).
5. **Check the two goals separately.** Goal one is the client's live shop; goal two is the product being ready
   for real customers in general. A function can be done for the client through data and still missing as a
   product feature, and the opposite. Say which is which for every row where they differ.

## Output

`{{MISSION_DIR}}/artifacts/{{TASK_ID}}/gap-recheck.md`, in Russian:

- a first paragraph of no more than five sentences answering the question with the numbers;
- the re-scored table (id, функция, утром, вечером, доказательство, задача);
- «Осталось критичного» as a numbered list;
- «Заблокировано снаружи» — the items that need Оксана, a bank, a registrar or a marketplace, each with who must
  act;
- «Что мы сегодня сломали или не доделали» — regressions and half-landed work, honestly, with evidence.

Also append a section to `{{MISSION_DIR}}/research/gap-matrix.md` with the evening verdicts, so tomorrow starts
from one file rather than two.

## What NOT to do

- Do not re-fetch insales.ru: the inventory was collected on 2026-09-15 and the network budget was spent.
- Do not count a function as closed because a pull request is merged, and do not count one as open because you
  did not have time to check it — say «не проверено».
- Do not fix anything, do not deploy, do not file new build tasks: at this hour the queue is closing. Findings
  go into the report for tomorrow.
- Do not round a count or estimate a percentage you did not compute.

## Finish

```
ARTIFACT: {{MISSION_DIR}}/artifacts/{{TASK_ID}}/gap-recheck.md
RESULT: OK мерка InSales: утром <A> есть / вечером <B> есть из <N>; критичных открыто <K>
```
