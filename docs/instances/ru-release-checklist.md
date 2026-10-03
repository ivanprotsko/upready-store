# RU Release Checklist: cherkashino.ru (Russian instance)

[RULES.md](RULES.md) covers the instance level: 152-FZ data residency, forbidden env names and
processors, enforced by `deploy/instances/ru.json` and `deploy/scripts/instance-check.mjs` inside
every deploy. This file covers the **shop level**: what Ivan has already decided about the Russian
shop and must never regress. Every item names Ivan's words, how it is checked, and when it broke.

Why it exists. Ivan, 04.10.2026, verbatim:

> у нас разве нет чек-листа для русской версии? Меня очень расстраивает факт, что возвращаются
> ошибки, которые мы уже устраняли. К примеру мы давно выяснили, что в рф должны быть конкретные
> способы авторизации и вход по обычно почте в это не входит

## How to use it

1. Before showing Ivan a change on the local stand: `deploy/scripts/ru-smoke.sh --stand`.
2. After every RU deploy: `deploy/scripts/ru-smoke.sh --ssh`. A red line blocks reporting the deploy as done.
3. Walk the «manual» items whose area the release touched; write the result in the deploy report.
4. A new decision of Ivan's about the Russian shop becomes a new row here in the same PR that implements it.

## Items

| # | Rule | Ivan's words | Check | Broke before |
|---|------|--------------|-------|--------------|
| 1 | Buyers sign in with **Yandex ID only**: no e-mail/password form, e-mail login and registration refused by the backend. Setting: `tenant.metadata.buyer_login_method = "yandex"` (panel: Settings → Customer login). | 02.10: «.ru - яндекс id»; 04.10: «в рф должны быть конкретные способы авторизации и вход по обычно почте в это не входит» | smoke 2b, 3, 8 | 04.10: the RU copy of the shop kept `both`. |
| 2 | The Yandex ID button leads to Yandex with this host's own callback; the deployment has the Yandex keys. | 04.10: «почему выключен яндекс id вход, что еще недоделано? доделывай» | smoke 2c, 4 | 04.10: RU env had empty `YANDEX_*`. |
| 3 | The shop's own storefront answers on cherkashino.ru, not the fallback, and does not redirect to another domain. | 04.10: «почему здесь [Черкашино](https://cherkashino.ru/ru) до сих [fallback] а магазин клиента! Разберись и исправь» | smoke 2a, 5 | 04.10: tenant resolved through api.olavka.ru, primary domain olavka.com. |
| 4 | Product pictures load: the instance API host is allowed for next/image (derived from `NEXT_PUBLIC_MEDUSA_BACKEND_URL`). | 04.10: «здесь нет картинок [Черкашино](https://cherkashino.ru/ru)» | smoke 6, 7; unit `apps/storefront/next-image-hosts.test.ts` | 04.10: `/_next/image` answered 400 for api.cherkashino.ru. |
| 5 | The cart sidebar opens from the **right**. | 04.10: «я не просил делать сайдбар слева … он должен быть справа» | unit `cart-sidebar-side.test.ts`; manual: open the cart at 1440 px | 03.10: PR #232 moved it left. |
| 6 | Robokassa stays in **test mode** until Ivan says otherwise. | standing rule of the order o-20260921-01 | smoke 9a (`--ssh`) | — |
| 7 | Nightly backups of the RU database and media run on the RU host and never leave Russia. | 03.10: «для русского сервера нужно строго соблюдать закон 152-ФЗ» | smoke 9b, 9c (`--ssh`); restore drill per `deploy/backup/RUNBOOK.md` | 04.10: no timer was installed. |
| 8 | Only the shop of cherkashino.ru lives on the RU host: no cherkashino.com, no other shops, no internal documents or other servers' keys. | 03.10: «данные одного магазина cherkashino.ru, без cherkashino.com и без чужих магазинов, внутренних документов и ключей других серверов» | `instance-check.mjs --db` inside the deploy; manual: tenant count = 1 | — |
| 9 | The local stand mirrors cherkashino.ru: same login method, Yandex keys, same code. | 04.10: «эта верся должна быть зеркалом того что будет на cherkashino.ru» | `ru-smoke.sh --stand` gives the same results as the live run | 04.10: stand had no `YANDEX_*` and method `both`. |
| 10 | Payment and delivery of the .ru shop: Robokassa, CDEK, Russian Post. | 02.10: «.ru - яндекс id - робокасса - доставка сдек - доставка почта россии» | manual: checkout lists these | — |

## Known gaps (not yet automated or not yet decided)

- **Cart side in the browser.** The smoke script reads HTML; the drawer renders only after a click.
  Item 5 relies on the unit test plus a manual look. A Playwright check through run-queue is the next step.
- **Other delivery options on .ru** (pickup, courier, DHL) are still enabled on the shop copy; Ivan has not
  decided whether .ru keeps them (dossier question 23). Not a gate until he decides.
- **Stand pictures come from shipshift.dev.** The local database copy predates the URL rewrite, so the
  stand's product images load from the INTL host, unlike RU. Item 9 does not cover image hosts yet.
- **Checkout look by Ivan's Figma frames** 18-126619 and 16-103431 is in progress; it becomes an item
  once merged.
