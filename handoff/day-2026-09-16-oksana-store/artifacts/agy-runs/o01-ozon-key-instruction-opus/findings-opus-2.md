# Приёмка двойника o01-ozon-key-instruction-opus (парный дизайн m04, раунд 2)

Исполнитель: claude/opus (`claude -p`, effort medium), сессия `063c72dc-29ca-42fa-b337-a198e2a784eb`, независимый
двойник после REJECT прогона gemini (раунд 1, `o01-ozon-key-instruction-gem`, findings-opus-1.md в соседней задаче).
Акцептор: opus (задача написана под opus, фактически выполнена под sonnet-5 по решению штаба 07:19 WITA — модели
переведены на sonnet для ещё не начатых задач; эта приёмка начата после переключения).

Бриф: `/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/prompts/o01-ozon-key-instruction.md`
+ преамбула `prompts/_run-preamble.md` (runner claude — не agy, поэтому «запись только относительно cwd» из
`_agy-preamble.md` здесь НЕ действует; преамбула сама требует писать `report.json` в
`{{MISSION_DIR}}/artifacts/{{TASK_ID}}/`, то есть вне cwd задачи — это спецификация, не нарушение).

## Вердикт

**ACCEPT**.

## Этап 0

- `ls -R` рабочей папки: `SUMMARY.md`, `artifacts/docs/o01-ozon-key-instruction/{index.html,report.md}`,
  `shots/` (4 PNG: 1280×900 и 390×844, каждый в обычном и full-page варианте). Все 8 строк `ARTIFACT:` из
  `logs/o01-ozon-key-instruction-opus-1.log` проверены: 7 внутри рабочей папки существуют, восьмая
  (`artifacts/o01-ozon-key-instruction-opus/report.json`) — по адресу, который прямо требует преамбула claude-раннера
  для UI-карточки; существует.
- `git -C … status --porcelain`: изменены `HANDOFF.json`, `state.json`, `REPORT.md` (разрешено условием) плюс
  `INTAKE.md` и `tasks.json` — но это правка штаба (решение Ивана 07:19 WITA про модели, переиндексация задач),
  не этого прогона: `git diff` по `INTAKE.md` показывает добавленный раздел «Вопрос Ивана 2026-09-18 07:19 WITA»,
  а по `tasks.json` — только переформатирование отступов существующих задач; ни разу не упоминается содержимое
  инструкции Ozon. Лог прогона `o01-ozon-key-instruction-opus-1.log` не содержит команд записи в эти файлы.
- `find -newer` по репозиторию: свежие файлы вне рабочей папки принадлежат параллельным задачам дня (g01, e01, kb01,
  pf01/pf02, диспетчер) — окно прогона 23:12–23:25 UTC (07:12–07:25 WITA) перекрывается с несколькими другими
  прогонами, запись в чужие рабочие папки не найдена. `~/.gemini/antigravity-cli/scratch/` не тронут (claude-раннер
  его не использует). Docker/git-состояние/протected-инфра не тронуты, на docs.ozon.ru/seller.ozon.ru не ходили
  (`report.md`: «сеть не использовалась вовсе», подтверждено логом — ни одного `WebFetch`).

Этап 0 — пройден.

## Дефекты

Блокеров и major нет. Есть один minor.

1. **minor · `SUMMARY.md`, `report.md` · метка времени написания опережает старт прогона** — оба файла датированы
   «Написано 2026-09-18 07:15 WITA» при `run.startedAt` = 07:12 WITA и `finishedAt` = 07:25 WITA; сама модель это
   заметила и подписала рядом «(показание системных часов на момент промпта запуска — 07:12 WITA)», то есть 07:15 —
   не сфабрикованная метка, а «на глаз» внутри собственного окна работы (07:12–07:25). Не влияет на приёмку.

## Что сделано хорошо

- **Все проверяемые цитаты дословны.** Сверил не менее трёх источников построчно:
  - `artifacts/docs/w10-marketplace-spec/docs/docs.ozon.ru-api-seller-index.txt` (сохранённая копия, `SAVED:
    2026-09-15T20:50:25Z`) — шаги «Настройки → Seller API» → «Сгенерировать ключ» → название + уровень доступа →
    цель использования → «Сгенерировать», срок «3 месяца», текст «Вы не сможете восстановить доступ к несохранённым
    API-ключам», все 5 строк таблицы ошибок («Invalid Api-Key…», «Api-key is deactivated…», «Api-Key is missing a
    required role…», «Api-Key is restricted to specific IP addresses…») и «403 Offer not signed» — все совпали
    посимвольно с копией;
  - `docs.ozon.ru-api-seller-index.links.txt` — адреса `https://seller.ozon.ru/app/signin` и
    `https://seller.ozon.ru/app/settings/api-keys` подтвердились;
  - `apps/tenant-panel/src/i18n/translations/ru.json` — все процитированные подписи панели
    (`integrations.title`="Подключение", `integrations.marketplace.rowSubtitle`="ключ Seller API площадки",
    `marketplaces.key.form.save`="Сохранить", `marketplaces.key.form.saved`="Ключ сохранён, оканчивается на
    {{last4}}.", `marketplaces.readOnly.label`="Права ключа", `marketplaces.expiresAt`="Действует до",
    `marketplaces.access`="Что открыто ключу", `marketplaces.endpoints.title`="Что мы имеем право спрашивать",
    `marketplaces.problem`="Проблема с ключом", `marketplaces.key.form.writeRights`, `marketplaces.card.subtitle`,
    `marketplaces.card.statusFailed`) совпали дословно;
  - `apps/backend/src/modules/ozon/adapter.ts` — поля `credentialFields` (`client_id`/`Client-Id`, `api_key`/
    `Api-Key`, `secret: true` только у второго) подтвердились; `apps/backend/src/modules/ozon/endpoints.ts` —
    ровно 19 записей в `OZON_READ_ENDPOINTS`, как заявлено; `apps/backend/src/modules/ozon/credentials.ts` —
    `readOnly: writeMethods.length === 0` подтверждает описанный в инструкции способ определения «прав ключа»
    через `POST /v1/roles`.
- **Честные «нет в копиях» вместо додумывания.** Три места, где источник не даёт ответа, названы прямо и без
  подмены: названия вариантов «уровня доступа» на экране создания ключа (в копии — только пример ответа
  `POST /v1/roles` с ролями `Admin`/`Posting FBS`, это ответ API, а не подписи кабинета, и текст инструкции это
  разъясняет), точное место отображения Client-Id на экране Ozon, отсутствие скриншотов кабинета (копия текстовая).
  Ни одна кнопка, экран или число не выдуманы для заполнения этих провалов.
- **Пункт брифа про инструкцию по Wildberries выполнен, а не проигнорирован.** Бриф просил «повторить структуру и
  тон» готовой инструкции для WB; такой инструкции в репозитории не существует (проверено `grep` по `artifacts/docs`,
  `~/upready/memory`, `~/upready/research`) — вместо тихого пропуска исполнитель это явно зафиксировал и взял за
  образец единственный сопоставимый владельческий документ (`artifacts/x02-domains/domain-instruction.md`). Именно
  этого не хватило в раунде 1 (gemini «молча не выполнил» тот же пункт — findings-opus-1.md по `o01-ozon-key-instruction-gem`).
- **Формальные проверки настоящие, а не декларативные**: `grep -c` на отсутствие внешних ресурсов (0), баланс тегов
  html.parser, рендер на 390×844 и 1280×900 (playwright) без горизонтальной прокрутки — я открыл скриншоты
  `01-desktop-1280x900.png` и `02-phone-390x844.png` глазами: инструкция читается, вёрстка не ломается, счётчики
  шагов и текст на месте.
- Секретов, реальных ключей и логинов в файле нет — только плейсхолдеры (`Мой магазин (чтение)`, `••••`).
- Права ключа объяснены Оксане по существу (не «because rule says so»): почему только чтение безопаснее, что
  произойдёт, если выдать ключ с правами записи (магазин их не использует, но честно покажет предупреждение).

## Замеры для m04

| Показатель | Значение |
|---|---|
| Исполнитель | claude -p, model=opus, effort=medium |
| Попытка | 1 из 1 |
| startedAt / finishedAt | 2026-09-17T23:12:12.369Z → 2026-09-17T23:25:31.589Z (07:12 → 07:25 WITA) |
| duration_seconds | 799.22 (13 мин 19 с) |
| num_turns (сообщений assistant в транскрипте сессии) | 104 |
| usage: output_tokens (сумма по транскрипту) | 71 564 |
| usage: cache_read_input_tokens (последнее значение) | 159 100 |
| Квота | неприменимо (claude-раннер на подписке, не Gemini-квота) |
| Приёмка (opus/фактически sonnet-5) | раунд 2, вердикт ACCEPT |

Сравнение с раундом 1 (gemini, `o01-ozon-key-instruction-gem`): 240.09 с / 212 518 токенов / REJECT (1 блокер
«запись мимо cwd», 3 major) против 799.22 с / ~231 тыс. токенов (по транскрипту) / ACCEPT здесь — opus-двойник
в 3.3 раза дольше, но без блокеров и с честно закрытым пунктом про WB, который gemini пропустил.
