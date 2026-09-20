# Goal

Make the shop's legal texts show the seller's real details instead of `{{ПЛЕЙСХОЛДЕРОВ}}`, and show the owner
exactly which details are still missing.

The client's offer, privacy policy and contacts were carried into her shop as markdown with the tokens left
verbatim, on purpose, because nobody may invent a seller's registration data. The migration report lists the
16 distinct tokens
(`/Users/ivanprotsko/upready/worktrees/upready-store/feat/cherkashina-tenant/artifacts/docs/2026-09-12-cherkashina-migration/03-migration-report.md`,
«Предложения задач», row «Реквизиты»):

```
{{ФИО_ИП}} {{ОГРНИП}} {{ИНН}} {{ЮР_АДРЕС}} {{ТЕЛЕФОН}} {{EMAIL}} {{СПОСОБЫ_ДОСТАВКИ}}
{{ДАТА_ВСТУПЛЕНИЯ}} {{ДАТА_РЕДАКЦИИ}} {{ДАТА_УВЕДОМЛЕНИЯ_РКН}} {{РКН_РЕГ_НОМЕР}} {{EMAIL_ДПО}}
{{ДОМЕН_САЙТА}} {{ДАТА_ДОКУМЕНТА}} {{ССЫЛКА_УПРАВЛЕНИЯ_РАССЫЛКАМИ}} {{АДРЕС_ВОЗВРАТА}}
```

There is no resolver in this repository: the tokens render literally. A shop cannot take real customers, and
Robokassa will not pass its moderation, without a filled offer and privacy policy
(`{{MISSION_DIR}}/research/telegram-digest.md`, #463427, #463583).

## Step plan

1. **Requisites on the tenant.** Add a requisites document to the tenant (its own table or a typed JSON column,
   your call — say why in the PR): legal form and name, ИНН, ОГРН/ОГРНИП, legal address, postal address,
   return address, phone, e-mail, data-protection e-mail, RKN registration number and notification date, bank
   details if the owner wants them public, plus the two document dates. Every field optional, every field
   labelled in plain Russian, not by token name.
2. **Resolver.** When a tenant page is rendered, the tokens are replaced from that document. An unfilled token
   stays visible exactly as it is today — that is the deliberate «not filled» signal, and it must survive. Apply
   the resolver on the server, in one place, so every consumer of page text gets the same result.
   `{{ДОМЕН_САЙТА}}` resolves from the tenant's own primary host, not from a stored string.
3. **Panel screen** under settings: the form, and above it a short list «Не заполнено: …» naming the missing
   fields in the same plain Russian, with a note of which page needs each. That list is what the owner sends to
   their lawyer or, in this case, what Ivan sends to the client.
4. **Prefill what is actually recorded, invent nothing.** The following values are recorded in
   `{{MISSION_DIR}}/research/chrxnasdmds-digest.md` §1 (row «Продавец») and may be used as the seed for the
   `cherkashino` tenant, through a script with `--dry-run`, never hardcoded in product code:
   ИП Черкашина Оксана Ивановна, ИНН 524900658999, ОГРНИП 309524933000032, город Элиста (Республика Калмыкия),
   return address «СДЭК, Элиста, Ленина 1». The phone `+7 (911) 718-01-23` is recorded there as **unconfirmed** —
   put it in the script commented out, or write it with a flag that the panel shows as «требует подтверждения»;
   do not silently publish an unconfirmed phone number on a public offer.
   The street and index of the legal address, the real e-mail, the data-protection e-mail, the RKN number and
   its date are **not known** (`q-yur-adres-bez-ulicy`, `q-realnyy-email-prodavca` in the same digest §5). Leave
   them empty and let them appear in the «не заполнено» list. The placeholder `olavka@example.com` from the old
   code is not a value: do not carry it over.
5. **Tests.** A page with all tokens filled renders no braces; a page with one missing renders exactly that one
   token and nothing else changes; a second tenant's requisites never leak into the first one's page.

## Commands

```
cd apps/backend && npx medusa lint && npx tsc --noEmit && pnpm test:unit
cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http
cd apps/tenant-panel && pnpm typecheck && pnpm lint
cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build
```

## Acceptance (measured, quoted in the PR body)

- On the local stand the owner fills ИНН and the legal name, and `/ru/pages/offer` shows them where the tokens
  were. Before and after screenshots of the same paragraph.
- A token whose field is empty still renders as `{{ТОКЕН}}` on the page and appears in the panel's «не
  заполнено» list. Screenshot of both.
- The prefill script run with `--dry-run` prints what it would write, then writes it, then writes nothing on a
  second run. Quote all three.
- A second tenant's offer is unaffected. Quote the two page bodies' differing lines.
- Suites pass; quote the whole-file result lines.

## What NOT to do

- Do not invent, guess or «reconstruct» any registration number, address, e-mail or date. A wrong ИНН on a
  public offer is a legal document with a false statement in it.
- Do not remove the literal-token behaviour: an unfilled document must look unfinished.
- Do not write the client's requisites into product code or into a committed fixture; the script is the place.
- Do not deploy, and do not write to the live database.
