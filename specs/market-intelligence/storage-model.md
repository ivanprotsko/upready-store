# Модель хранения market intelligence

Основание — раздел 4 отчёта `artifacts/research/2026-09-14-market-intelligence/report.md`.
Реализация — модуль Medusa 2 `apps/backend/src/modules/market-intelligence`. Medusa резолвит модули из файловой системы, поэтому новых соглашений не требуется. Вспомогательный код не кладётся в `src/subscribers`: этот каталог обходится рекурсивно и каждый `.ts` под ним валидируется как подписчик (AGENTS.md).

## 1. Сущности

### `competitor`
| Поле | Тип | Смысл |
|---|---|---|
| `id` | id | |
| `owner_scope` | `platform` \| `tenant` | наш контур или контур владельца магазина |
| `tenant_id` | id \| null | заполнен при `owner_scope=tenant` |
| `title` | string | как называет его человек |
| `domains` | string[] | один конкурент — много доменов |
| `kind` | `platform` \| `store` \| `marketplace` | |
| `note` | text \| null | |

### `watched_page`
| Поле | Тип | Смысл |
|---|---|---|
| `id` | id | |
| `competitor_id` | id | |
| `url` | string | |
| `url_normalized` | string | ключ дедупликации: схема, хост, путь, отсортированные значимые параметры |
| `kind` | `pricing_table` \| `legal_doc` \| `product` \| `category` | |
| `request_context` | object | `country`, `currency`, `locale`, `authenticated` — см. 2.2 |
| `schedule` | object | окно проверки, а не момент: `window_start`, `window_end`, `period` |
| `state` | `active` \| `quarantined` \| `lost` \| `restricted` \| `policy_blocked` | |
| `state_since` | ts | |
| `last_success_at` | ts \| null | показывается владельцу рядом со значением |

`policy_blocked` — адрес запрещён robots.txt. Отдельно от `restricted` (сайт ограничил нас) и от `lost` (страница не найдена), потому что лечится иначе: ручным приёмом.

### `extraction_template`
Схема — `extraction-template.schema.json`. Версии **не перезаписываются**: новая версия добавляется, старая остаётся с `superseded_at`. Без истории версий нельзя ответить на вопрос «с какого дня мы читали неверно».

### `snapshot` — свидетельство
| Поле | Тип | Смысл |
|---|---|---|
| `id` | id | |
| `watched_page_id` | id | |
| `fetched_at` | ts | |
| `http_status` | int | |
| `body_ref` | string \| null | ключ в объектном хранилище |
| `body_kind` | `visible_text` \| `raw_html` \| `manual_upload` | по умолчанию `visible_text` |
| `content_hash` | string | хэш нормализованного видимого текста |
| `request_context` | object | фактический, а не запрошенный |
| `cost` | object | `{ provider, units, rub }` — стоимость этого прохода |
| `method` | `selector` \| `agent` \| `manual` | |

Храним **нормализованный видимый текст**, не HTML: замер даёт 15 654 символа против 2 108 049 байт на `wix.com/plans`, то есть в 135 раз меньше. Ретеншн тел — 90 дней; хэши и значения — навсегда.

### `observation` — вывод
| Поле | Тип |
|---|---|
| `id` | id |
| `watched_page_id` | id |
| `anchor_id` | string — идентификатор якоря внутри шаблона |
| `field` | string — `price`, `price_base`, `price_discounted`, `currency`, `period`, `availability`, `plan_limit`… |
| `value_normalized` | string \| number |
| `unit` | string \| null |
| `observed_at` | ts |
| `snapshot_id` | id |
| `template_version` | int |
| `method` | `selector` \| `agent` \| `manual` |
| `confidence` | 0..1 |

Наблюдение **неизменяемо**. Значение с `method=agent` не годится для автоматической переоценки цены (см. `collection-policy.md`, п. 7).

### `change` — утверждение с жизненным циклом
| Поле | Тип |
|---|---|
| `id` | id |
| `observation_from_id` / `observation_to_id` | id |
| `delta_abs` / `delta_rel` | number |
| `status` | `suspected` \| `confirmed` \| `dismissed` |
| `confirmed_by_snapshot_id` | id \| null |
| `significance` | `major` \| `minor` \| `cosmetic` — для правовых документов заполняет агент |
| `detected_at` / `resolved_at` | ts |

### `watch_rule`
Схема — `watch-rule.schema.json`. Принадлежит владельцу, не источнику: два владельца могут смотреть одну страницу по-разному, а собирается она один раз.

### Служебные
- `notification` — что, кому, когда, по какому `change_id`; нужна для дедупликации и дайджестов.
- `reprice_action` — `was`, `became`, `floor_manual`, `floor_margin`, `rule_id`, `change_id`, `applied_by` (`auto` \| `user_id`), `reverted_at`, `revert_of_id`.

## 2. Три решения, которые надо держать в голове при реализации

### 2.1 Снимок отделён от наблюдения
Снимок — факт о сервере, наблюдение — наш вывод. Вывод можно пересчитать задним числом, когда починили шаблон; свидетельство пересчитать нельзя. Если хранить только значения, спор «у конкурента была другая цена» неразрешим.

### 2.2 Контекст запроса — часть идентичности источника
Цена без страны, валюты и локали — не факт. Что это не паранойя, видно из чужого robots.txt: Shopify запрещает индексировать `*country=*` и `*lang=*`, то есть сам считает страновые варианты разными страницами. Сравнивать можно только наблюдения с совпадающим `request_context`.

### 2.3 Источник собирается один раз на всех
Дедупликация по `(url_normalized, request_context)`. Если сто наших магазинов следят за одной страницей, конкурент получает один наш запрос, а не сто. Это требование вежливости и предел нагрузки одновременно.

## 3. Объём

| Величина | Расчёт | Итог |
|---|---|---|
| Тело снимка | видимый текст страницы | ≈15 КБ |
| 50 000 источников × 90 дней | 15 КБ × 50 000 × 90 | **≈67 ГБ** в объектном хранилище |
| То же в HTML | ≈2 МБ × 50 000 × 90 | ≈9 ТБ — поэтому не HTML |
| Наблюдения | 50 000 × 365 × ~4 поля | ≈73 млн строк в год — партиционировать по времени |
