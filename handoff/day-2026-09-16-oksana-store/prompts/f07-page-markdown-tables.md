# Goal

The page a buyer opens to check whom they are paying shows raw markdown.

Measured live (QA q01, `https://cherkashino.shipshift.dev/ru/pages/contacts`, 2026-09-15; screenshot
`{{MISSION_DIR}}/artifacts/q01-qa-customer/shots/11-contacts-1280x900.png`). On screen, verbatim:

```
| | | |---|---| | ОГРНИП | {{ОГРНИП}} | | ИНН | {{ИНН}} | | Адрес регистрации | {{ЮР_АДРЕС}} | …
---
| Способ | Данные | |---|---| | Телефон | {{ТЕЛЕФОН}} | | Email | {{EMAIL}} | | Telegram | t.me/cherkashina_oks |
```

Three separate rendering failures in one block:

1. markdown **tables** are not rendered — the pipes and the `|---|---|` separator row are printed as text;
2. a **horizontal rule** `---` is printed as three dashes;
3. `{{ЮР_АДРЕС}}` renders as «{{ЮРАДРЕС}}» in italics — the underscores were eaten as emphasis markers.

The same raw-table text is on `/ru/pages/offer` and `/ru/pages/privacy` (measured: the `|---|` pattern is
present in all three). `/ru/pages/about`, which has no tables, renders fine — so the pipeline works for plain
paragraphs and drops out at tables.

The `{{ТОКЕНЫ}}` themselves are a different, already-queued task (t12-legal-requisites fills in the seller's
details). Do NOT do t12's work here: your subject is the rendering.

## Where to look

- The storefront page that renders a tenant document: `apps/storefront/src/app/[locale]/(main)/pages/[key]/page.tsx`
  and whatever markdown component it uses.
- The backend route that serves it: `apps/backend/src/api/store/tenant/pages/[key]/route.ts` — check whether it
  hands over markdown or HTML, and where the conversion happens.
- Whether the renderer has GFM tables enabled at all (a plain CommonMark renderer has no tables).

Prefer turning on the table support in the existing renderer over rewriting the documents: the texts are the
client's own and were imported verbatim (`{{MISSION_DIR}}/artifacts/x01-tenant-live-import/report.md`).

## Acceptance (measure — rule 18f)

1. `/ru/pages/contacts` shows a real two-column table with borders or clear rows, no `|` and no `|---|` in
   `document.body.innerText` — paste the check and its output;
2. the same for `/ru/pages/offer` and `/ru/pages/privacy`;
3. `---` renders as a rule, and an underscore inside a token or a word no longer turns the text italic;
4. screenshots of `/ru/pages/contacts` at 1280×900 and 390×844, and no horizontal scroll at 390 px
   (`document.documentElement.scrollWidth === window.innerWidth`).
