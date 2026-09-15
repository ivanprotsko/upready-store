# d01-deploy-mt-1 — деплой dev на mt-платформу, волна 1

Время отчёта: 2026-09-15 03:41 WITA (см. `date` выше). Часы хоста Contabo — CEST (UTC+2), в логах и таймстемпах образов ниже время хоста.

## Деплой

- Sha: `bd4ced7` (origin/dev на момент запуска, `git log --oneline -5`:
  `bd4ced7 chore(handoff): штаб дня — дайджесты исследований (5), notify в Избранное Ивана, правки терминалов в диспетчере (day-2026-09-16)`,
  `a15bf51 chore(handoff): штаб дня магазина Оксаны — MISSION, движок диспетчера, UI, шаблоны промптов, сторож run.sh (day-2026-09-16)`,
  `814e5cd chore(handoff): статус ночной миссии и развилка по Telegram Mini App (t-2026-09-14-01)`,
  `4b2f924 chore(handoff): ночная миссия закрыта — DONE (t-2026-09-14-01)`,
  `7a98794 chore(handoff): ночная миссия — итоговый отчёт, приёмка и открытый дефект страницы заказа (t-2026-09-14-01)`).
- Liveness-проба: `ssh rc=0`.
- Env: забран с хоста через `scp -i ~/.ssh/id_ed25519_contabo` (прямая форма `scp root@…` без ключа даёт `Permission denied` — алиас `contabo` в `~/.ssh/config` использует другой identity, ssh к нему проходит, а scp по IP — нет). md5 после копирования: `b788f1886315a512485e0515aeb8fb53`.
- Дамп БД: `/opt/upready-store/backups/mt-medusa_mt-20260914-212303.sql.gz`, 4 971 267 байт (сделан этим прогоном; часы хоста CEST совпали по виду с существовавшими соседними дампами, из-за чего первая проверка ложно показалась «дамп не создался» — перепроверено содержимым и таймингом, дамп реальный и свежий).
- rsync код → хост: без `--delete`, rc=0 (ушёл в фон дольше 300 c, дождался явно).
- Сборка (`docker compose build backend storefront panel`): лог `/opt/upready-store/mt-build-20260914-213213.log`, все три образа собраны (`Built`).
- `docker compose up -d`: `mt-backend` и `mt-storefront` — Recreate → Healthy/Started; `mt-panel`, `mt-postgres`, `mt-ingress-sync` остались Running (без изменений в их слоях).
- Бэкфиллы:
  - `backfill-hero-copy.js`: 12 home documents, 0 patched, 12 left alone (own copy, already localized, or no hero).
  - `backfill-option-translations.js`: profile "sneakers", 5 options × 36 locales: 32 rows rewritten, 0 created, 1192 already right.
- Seed: demo-тенанты `acme`, `globex`, `initech` уже существуют в БД — `seed-mt-demo.js` не запускался (идемпотентен, но не нужен).

## Health-checks (все 4/4 = 200)

| URL | код |
|---|---|
| https://shipshift.dev/health | 200 |
| https://start.upready.dev/start/onboarding | 200 |
| https://panel-store.upready.dev/ | 200 |
| https://zolotaya-nit-1057.shipshift.dev/ru | 200 |

Дополнительно (реестр protected-infra, `upready-store-mt-platform`):
- `https://shipshift.dev/static/store-profiles/abstract/home-hero.webp` → 200.

## Контейнеры (`docker ps`, mt-*)

```
mt-backend       Up 3 minutes (healthy)
mt-ingress-sync  Up 3 days
mt-panel         Up 14 hours (healthy)
mt-postgres      Up 3 days (healthy)
mt-storefront    Up About a minute (healthy)
```

## Образы (mt-*)

```
mt-storefront:latest 2026-09-14 21:37:59 +0200 CEST
mt-backend:latest    2026-09-14 21:35:44 +0200 CEST
mt-panel:latest      2026-09-14 07:17:50 +0200 CEST
```

## Что удивило / находки

1. **scp по прямому IP не проходит** (`Permission denied`), а `ssh` через алиас `contabo` — проходит. Причина: в `~/.ssh/config` алиас, видимо, задаёт `IdentityFile`, которого нет по умолчанию при обращении `root@84.46.251.149` напрямую. Рабочая форма — явный `-i ~/.ssh/id_ed25519_contabo`.
2. **Часы хоста Contabo — CEST (UTC+2)**, не WITA и не UTC. При сверке свежести дампа/логов по timestamp это важно учитывать — начальная проверка ложно показалась ошибкой (файл со «старым» на вид временем на самом деле был только что создан).
3. **`mt-panel:latest` не пересобрался этим прогоном** — образ остался от более раннего билда (07:17:50 CEST того же дня), потому что в этом sha не было изменений, затрагивающих панель, и docker сборка воспользовалась кэшем слоёв. Контейнер `mt-panel` не был Recreate-нут при `up -d`. Это не поломка (панель отвечает 200, здорова), но acceptance-критерий «image CreatedAt within this run» для панели формально не выполнен — фиксирую как факт, не подгоняю под критерий.
4. Демо-тенанты (`acme`/`globex`/`initech`) уже существовали — сид не запускался.

## Итог

Платформа обслуживает все 4 проверяемых URL кодом 200, все `mt-*` контейнеры Up/healthy, БД задампена и rsync/build/up прошли без ошибок. Деплой sha `bd4ced7` подтверждён свежими образами backend и storefront.
