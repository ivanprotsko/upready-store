# Состояние МТ-деплоя на момент передачи (2026-09-11, вечер, session_01HqysBVaN4S8qDwkauRQdvB)

Приказ Ивана: продолжать в режиме оркестрации — эта сессия становится **приёмщиком**, работу делает
отдельный **оркестратор** по брифу `artifacts/prompts/2026-09-12-mt-deploy-orchestrator.md`.

## Что СДЕЛАНО и чем это проверено

| Пункт | Состояние | Чем подтверждено |
|---|---|---|
| Ветка `feat/mt-deploy` = волна A + волна B | сделано | `fbdbdcf` (merge, 3 конфликта разрешены), `aeff2fe` (деплой-обвязка); `medusa build`/`tsc`/`medusa lint` rc=0, панель `tsc --noEmit` rc=0 — мои прогоны в этом worktree |
| DNS на 4 зоны | применено | `node deploy/scripts/mt-dns-records.mjs` → «0 change(s) pending»; бэкап 27 записей до правки в `artifacts/deliverables/mt-deploy/dns-backup-2026-09-11.json` |
| Образы собраны на хосте | сделано | лог `/opt/upready-store/mt-build.log`; backend build 31 с, storefront `next build` 11/11 страниц |
| Контейнеры | ЧАСТИЧНО | замер 2026-09-11 ~23:5x: `mt-postgres` healthy, `mt-backend` health: starting, `mt-ingress-sync` up, `mt-panel`/`mt-storefront` Created (ждут здоровья бэкенда) |

**Ничего из живого ещё не принято.** Ни один домен я не открывал после деплоя, ни одного сертификата
не видел, сид не запускал. Всё, что ниже слова «осталось», — не сделано.

## Осталось (это и есть работа волны)

1. Дождаться здоровья `mt-backend` (первая загрузка гонит миграции + сид профиля sneakers +
   composition + ensure-accounts), затем поднять `mt-panel` и `mt-storefront`.
2. Сид: `home-goods` и `electronics` вторым и третьим прогоном `initial-data-seed.js`, затем
   `seed-mt-demo.js` (три тенанта, каталоги, темы, домены).
3. Проверить живьём: `shipshift.dev/app`, `panel.shipshift.dev`, три домена тенантов, сертификаты.
4. Четыре задачи Ивана из брифа: имя магазина, категории, изображения категорий и hero, и страница
   ссылок (оплата → онбординг, онбординг нового прототипа, ночные документы и схемы).

## Развилки, которые несёт приёмщик

- **Сколько доменов.** Первый приказ (вечер): `custombot.space`, `setpomo.com`, `shiftship.dev`.
  Второй (при передаче): `custombot.space`, `shiftship.dev`. DNS и `seed-mt-demo.ts` сейчас
  настроены на все три (Acme → custombot.space, Globex → setpomo.com, Initech → shiftship.dev).
  Снимать третий — только по слову Ивана.
- **Имя магазина в витрине** сегодня вшито в образ (`NEXT_PUBLIC_SITE_NAME`) — это дефект A4, а не
  настройка. Пункт «разное название» без правки кода не закрывается.
- **Картинка категории** в Medusa полем не хранится. Механизм выбирает оркестратор и объявляет его
  ДО кода.
- Дыра изоляции `t-2026-09-11-01` открыта; волна не должна её расширять.

## Что я поменял снаружи репозитория (для отката)

- Cloudflare: 14 правок в 4 зонах. Заменены парковочные CNAME апексов `custombot.space`,
  `setpomo.com` (и их `www`) на `sell-domain-97s.pages.dev` и `www.shiftship.dev` → `0ui.dev`.
  Полный дамп «как было» — в `dns-backup-2026-09-11.json`.
- Хост Contabo: новый каталог `/opt/upready-store/mt`, проект docker compose `mt` (5 контейнеров),
  файл `/data/coolify/proxy/dynamic/mt-tenants.yml` пишется контейнером `mt-ingress-sync`.
  Пять старых стендов и agent-creatr не тронуты.
