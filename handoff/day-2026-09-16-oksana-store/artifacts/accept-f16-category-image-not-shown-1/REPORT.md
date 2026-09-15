# Приёмка f16-category-image-not-shown · PR #54 · раунд 1

_Замеры сняты 2026-09-15 17:25 WITA, приёмщик — headless-сессия дня._

Ветка `fix/day16-category-image-not-shown`, база `dev`, mergeable=MERGEABLE/CLEAN, дерево воркера чистое на `origin/fix/day16-category-image-not-shown` (12bf0f5).

## Проверки (в дереве воркера)

| Проверка | Команда | Результат |
|---|---|---|
| Типы витрины | `apps/storefront && npx tsc --noEmit` | rc=0 |
| Юниты витрины | `apps/storefront && npm run -s test` | 20 файлов, 195 тестов PASS, rc=0 |
| Новый юнит-файл | `npx vitest run src/lib/util/category-image.test.ts` | 8 PASS, rc=0 |
| Типы панели | `apps/tenant-panel && npx tsc --noEmit` | rc=0 |

## Живой замер (стенд воркера, код PR исполняется)

Витрина `next dev -p 8046` с cwd в worktree PR, бэкенд `medusa develop` :9046, БД-клон. Маркеры PR в разметке (`category-header-image`, `category-image-tiles`) — значит отвечает именно этот код.

Данные: из 9 категорий тенанта `cherkashino` картинка ровно у ОДНОЙ (`asd-cherkashino`), остальные `image_url: null` — то есть «минимум три» проверено на реальном дефицитном случае.

| Страница | http | картинка категории отрисована | размер | ссылок категорий с `<img>` |
|---|---|---|---|---|
| `/ru` | 200 | 1 (видима) | 393×491 | 1 из 14 |
| `/ru/store` | 200 | 1 (видима) | 183×229 | 1 из 23 |
| `/ru/categories/asd-cherkashino` | 200 | 1 в шапке (`category-header-image`) | 94×118 | — |

`img src` на всех трёх — один и тот же файл, разные ширины `next/image`:
```
/_next/image?url=http://localhost:9046/static/tenants/ten_01M29Q4KYQHC70JZBENWZ8Z88M/1789463594084-f16-asd-final.png&w={384,256,96}&q=60
```

Соседний магазин без загруженных картинок (`acme.localhost:8046`): полосы в каталоге нет (`category-image-tiles`=0), плиток на главной 0 — поведение не изменилось.

## Чего я НЕ смог проверить сам

Вход в панель стенда: `owner-cherkashino@example.test` / `supersecret1` → HTTP 401 (на клоне БД `upready_store_f16` пароль выставлен локальным скриптом воркера). Панельная половина (колонка «Изображение», превью в форме, новая подсказка) принята по диффу, `tsc` и скриншотам воркера — они просмотрены глазами и показывают ровно заявленное. Ядро приёмки (три поверхности витрины, одна картинка, порога нет) измерено мной.
