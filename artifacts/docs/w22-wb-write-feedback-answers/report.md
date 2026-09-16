# w22-wb-write-feedback-answers — запись в WB, класс «ответы на отзывы и вопросы»

Отчёт исполнителя, 2026-09-16 08:13 WITA. Ветка `feat/day16-wb-write-feedback-answers`, база `dev`.
Живой записи нет: ни один запрос к Wildberries не уходил, в журнале записи ноль строк `outcome='sent'`.

## Что сделано

**1. Реестр мутаций.** В `apps/backend/src/modules/wb-write/write-endpoints.ts` добавлена
запись `wb.questions.view` — `PATCH https://feedbacks-api.wildberries.ru/api/v1/questions`,
класс `feedback_answers`, тело `{id: string, wasViewed: boolean}` (`.strict()`). Оба поля и
пример `{"id": "n5um6IUBQOOSTxXoo0gV", "wasViewed": true}` взяты дословно из сохранённой копии
`artifacts/docs/w01-wb-readonly-client/docs/dev-wildberries-ru-ru-docs-openapi-customer-communication.txt`.
Ответы на отзывы (`wb.feedbacks.answer`, `wb.feedbacks.answer.edit`) уже были в реестре с w20.

**docs missing** — `https://dev.wildberries.ru/en/docs/openapi/customer-communication#tag/questions/operation/patchV1Questions`,
вариант тела `AnswerQuestionOrEditAnswer`. Страница у нас сохранена, но её примеры запроса
свёрнуты в табы, и обе копии поймали открытым только первый таб:

```
$ grep -n 'RejectQuestion\|AnswerQuestionOrEditAnswer' artifacts/docs/*/docs/*customer-communication.txt
artifacts/docs/w01-wb-readonly-client/docs/dev-wildberries-ru-ru-docs-openapi-customer-communication.txt:461:RejectQuestion
artifacts/docs/w01-wb-readonly-client/docs/dev-wildberries-ru-ru-docs-openapi-customer-communication.txt:462:AnswerQuestionOrEditAnswer
artifacts/docs/w03-wb-sales-questions-mirror/docs/dev-wildberries-ru-en-docs-openapi-customer-communication.txt:485:RejectQuestion
artifacts/docs/w03-wb-sales-questions-mirror/docs/dev-wildberries-ru-en-docs-openapi-customer-communication.txt:486:AnswerQuestionOrEditAnswer
```

Под этими строками полей нет ни в одной копии, а в схеме выше раскрыт только вариант
`ViewQuestion`. Имён полей у нас нет, и придумывать их (`{id, answer: {text}}` — то, что
«похоже на правду») мы не стали: схема, валидирующая тело, которого никто не читал в
документации, — ровно то, от чего реестр и защищает (правило 17a). Документацию перечитать с
этой машины нельзя — анти-бот WB ответил HTTP 498 и забанил IP 2026-09-16 07:07 WITA
(приказ штаба 07:10). Пробел назван константой `WB_UNREGISTERED_MUTATIONS`, и панель говорит
о нём на экране, а не предлагает кнопку, которая не работает. Когда страницу удастся
прочитать, включение — одна запись в массив плюс одна ветка в `send/route.ts`: черновики,
шаблоны, подтверждение и журнал уже построены.

**2. Данные.** Миграция `apps/backend/src/modules/wb/migrations/Migration20260915235004.ts`:
- `wb_feedback` и `wb_question` получили `draft_answer`, `answer_status`
  (CHECK `draft|confirmed|sent|failed`, по умолчанию `draft`), `answer_sha256`,
  `answer_confirmed_by`, `answer_confirmed_at`, `answer_error`;
- новая таблица `wb_answer_template` (арендатор, slug, заголовок, текст, `target`, порядок,
  `is_builtin`), три шаблона по-русски заводятся на первом открытии вкладки идемпотентно
  **по slug** (`modules/wb/answer-templates.ts`): «Спасибо за отзыв», «Извинение и контакт»,
  «Ответ на вопрос о составе». Отредактированный шаблон не перезаписывается.

Статус `sent` достижим ТОЛЬКО когда ядро записи вернуло `dryRun: false`. Успешный черновой
прогон оставляет строку в `confirmed`: статус не говорит больше, чем произошло (правило 20a).

**3. Панель.** Вкладка «Отзывы и вопросы» на странице Wildberries
(`apps/tenant-panel/src/routes/settings/wildberries/components/wb-answers-section.tsx` +
`wb-answer-card.tsx`, `wb-answer-counts.tsx`, хук `hooks/api/wb-feedback-answers.tsx`):
оценка, текст, дата, товар (через `wb_product` по `nm_id`), поле черновика, выбор шаблона,
фильтр «Без ответа / Отвеченные / Все», два таба со счётчиками, «Сохранить черновик»,
«Подтвердить и отправить», «Отметить просмотренным» для вопросов. Без ответа — первыми.
Вверху два баннера: живой режим выключен и почему ответ на вопрос недоступен.

**4. Подтверждение на КАЖДЫЙ ответ** — сравнение, а не флажок. Порядок в панели: сохранить
черновик → диалог цитирует то, что вернул сервер → отправка несёт sha256 ЭТОГО текста →
бэкенд пересчитывает хэш по сохранённому черновику и отказывает при расхождении. Хэш и
`actor` ложатся в строку `marketplace_write_audit` (`payload_sha256` + `actor`) и в саму
строку зеркала (`answer_sha256`, `answer_confirmed_by`, `answer_confirmed_at`).
Правка черновика сбрасывает подтверждение.

**5. Два слоя ворот, оба нужны.** `modules/wb-write/feedback-answers.ts` решает то, чего пять
ворот w20 видеть не могут (они не знают про строку зеркала): мутация зарегистрирована,
черновик есть и укладывается в границы WB, на отзыв ещё не отвечали, подтверждение совпадает
с черновиком. Дальше — ядро w20 без изменений.

`POST /tenants/wb/feedback-answers/send` — боевой вызов `wbWrite`. Тест
`no-live-write-call-site.unit.spec.ts` переписан: вместо «вызывающих нет» он держит
**именной список** `REGISTERED_CALLERS` и отдельно проверяет, что `WB_WRITE_LIVE` не
выставляется ничем, что репозиторий поставляет (шаблоны env, `docker-entrypoint.sh`, оба
workflow). На момент раунда 1 в списке был один файл — мой; после сведения с `dev` их два,
второй пришёл из w23 (раздел «Раунд 2» ниже).

## Конкурент — ДА (и шире)

Дословно из `handoff/day-2026-09-16-oksana-store/research/insales-combo-features.md`:

- строка 199: «Автоответы на отзывы Wildberries | AI-генератор ответов на отзывы» — Комбо,
  линейка, https://www.insales.ru/page/combo
- строка 251: «Мультиканальный чат „Диалоги +“ | Диалоги с клиентами в одном окне» — Комбо,
  линейка, https://www.insales.ru/page/dialogues-plus

У конкурента ответы на отзывы WB подаются как функция тарифа и **генерируются ИИ**. Мы
сделали ручные ответы с шаблонами: черновик пишет владелица, подтверждает ровно тот текст,
который уйдёт, и каждый ответ виден в журнале записи. AI-черновик — следующий шаг, в этой
задаче его нет намеренно: пока в WB ничего не уходит, генератор нечему помогать.

## Аналог Ozon

По сохранённой копии `artifacts/docs/w10-marketplace-spec/docs/ozon-methods-index.tsv`
(строки 250, 294) и якорям из `docs.ozon.ru-api-seller-index.links.txt` (строки 1253, 1260).
База URL — https://docs.ozon.ru/api/seller/

| наша операция | WB | Ozon Seller API |
|---|---|---|
| ответить на отзыв | `POST /api/v1/feedbacks/answer` | `POST /v1/review/comment/create` «Оставить комментарий на отзыв» — https://docs.ozon.ru/api/seller/#operation/ReviewAPI_CommentCreate. Дословно из индекса: «Доступно для продавцов с подпиской Управление отзывами или Premium Pro.» |
| править ответ на отзыв | `PATCH /api/v1/feedbacks/answer` | прямого «изменить комментарий» нет: есть `POST /v2/review/comment/delete` «Удалить комментарий на отзыв» (строка 438) — то есть удалить и написать заново |
| ответить на вопрос | **не найдено у нас** (тело не описано в копиях, см. docs missing) | `POST /v1/question/answer/create` «Создать ответ на вопрос» — https://docs.ozon.ru/api/seller/#operation/QuestionAnswer_Create. «Доступно для продавцов с подпиской Premium Plus.» |
| отметить просмотренным | `PATCH /api/v1/questions` (`ViewQuestion`) | `POST /v1/question/change-status` «Изменить статус вопросов» (строка 253), Premium Plus |

«Не найдено» по Ozon нет ни по одной операции — у него есть парный метод везде, включая тот,
который у нас закрыт пробелом в документации WB. Две оговорки для планирования: у Ozon и
отзывы, и вопросы — **платные подписки** (у WB такого условия нет), и половина методов
раздела `review` помечена `Deprecated` с переходом на `/v2/…`.

Конструкция под это уже готова: гейты и журнал лежат в `marketplace-write/`, адаптер
`ozon-write` — это второй реестр и второй `send`. Разбиение «target × intent» в
`feedback-answers.ts` тоже адаптерно-независимо: для Ozon поменяются id записей реестра, а
ворота (черновик / дважды не отвечаем / подтверждение совпало) — те же.

## Чем измерено

Локальный стенд: БД `upready_store_w22` (клон `upready_store_w03` — тенант `cherkashino`,
**123 настоящих зеркальных отзыва и 1002 вопроса**), бэкенд `http://localhost:9042`,
панель `http://localhost:5192`. `npx medusa db:migrate` → rc=0, `Migrated Migration20260915235004`.

### Проверки

| проверка | команда | результат |
|---|---|---|
| юниты бэкенда | `npm run test:unit` в `apps/backend` | **rc=0, 57 сюит, 674 теста** (было 45/484 в w20; новый файл `feedback-answers.unit.spec.ts` — PASS) |
| типы бэкенда | `npx tsc --noEmit` | rc=0 |
| линт бэкенда | `npx medusa lint` | rc=0, 0 ошибок; предупреждений 85, ни одно не на файлах этой задачи |
| сборка образа | `pnpm check:backend-build` | rc=0, «Backend build completed successfully» |
| типы панели | `npx tsc --noEmit` в `apps/tenant-panel` | rc=0 |
| линт панели | `npx eslint src/routes/settings/wildberries src/hooks/api/wb-feedback-answers.tsx` | rc=0 |

### Прогон по стенду (живой бэкенд, токен владелицы)

```
1.  GET  /tenants/wb/feedback-answers?answered=unanswered      → 200
    endpoints: wb.feedbacks.answer POST /api/v1/feedbacks/answer |
               wb.feedbacks.answer.edit PATCH /api/v1/feedbacks/answer |
               wb.questions.view PATCH /api/v1/questions
    unregistered: questions.answer PATCH /api/v1/questions
    templates: thanks/feedback, apology-contact/feedback, composition/question
    feedbacks: 123 unanswered, 0 answered, rows 50
    questions: 2 unanswered, 1000 answered, rows 2

2.  POST .../send без черновика                                → 422  gate: no_draft
    «Сначала напишите текст ответа: отправлять нечего.»

3.  PUT  .../feedback-answers (черновик из шаблона «Спасибо за отзыв»)  → 200
    sha: 836d9fa0b42ef660573f6f75e258bb89ddaf9a589ba588ddde94ede1e299722e, status: draft

4.  POST .../send с ЧУЖИМ подтверждением                       → 422  gate: confirmation_mismatch
    «Текст ответа изменился после того, как вы его подтвердили…»

5.  POST .../send при выключенном переключателе магазина       → 422  gate: enabled
    «Writing to wb is switched off for this shop.»

6.  PUT  /tenants/wb/write-settings (переключатель + согласие на feedback_answers) → 200
    switch: true | consent: confirmed_by tenadm_01M2KB5W8GKH1H77QDSPGEHBH3
    credential usable: true | live: false

7.  POST .../send с ВЕРНЫМ подтверждением                      → 200  outcome: dry_run
    endpoint: wb.feedbacks.answer
    text sha:    836d9fa0b42ef660573f6f75e258bb89ddaf9a589ba588ddde94ede1e299722e
    payload sha: 6a942a2b5bb35f3a10c412cc3f025bb835c70a0e8672270a3aa200b7509491ed
    строка зеркала: status confirmed, подтвердил tenadm_01M2KB5W8GKH1H77QDSPGEHBH3

8.  POST .../send для ВОПРОСА (intent=answer)                  → 422  gate: unregistered_mutation
    «Тело запроса «ответить на вопрос» (вариант AnswerQuestionOrEditAnswer) отсутствует
     в сохранённых копиях документации WB…»  (черновик при этом сохранён, PUT → 200)

9.  POST .../send для вопроса, intent=view                     → 200  outcome: dry_run
    endpoint: wb.questions.view

10. PUT  с чужим id                                            → 404
    {"type":"not_found","message":"No mirrored feedback НЕТ-ТАКОГО for this shop."}

11. отзыв, у которого в зеркале is_answered=true               → 422  gate: already_answered
    «На этот отзыв ответ уже опубликован в Wildberries…»
    (в зеркале этого магазина отвеченных отзывов нет вовсе — строка помечена руками
     на СТЕНДЕ: update wb_feedback set is_answered = true where feedback_id = 'KI6UNj5iotDnrvklvztc')

12. согласие на класс отозвано, переключатель оставлен включённым → 422  gate: consent
    «The shop owner has not confirmed the operation class feedback_answers for wb.»
```

### Журнал записи после всех попыток

```
$ psql -d upready_store_w22 -c "select op_class, endpoint_id, method, outcome, gate, dry_run,
    count(*) from marketplace_write_audit group by 1,2,3,4,5,6 order by 1,2,4"

     op_class     |     endpoint_id     | method | outcome | gate    | dry_run | count
------------------+---------------------+--------+---------+---------+---------+-------
 feedback_answers | wb.feedbacks.answer | POST   | dry_run |         | t       |     2
 feedback_answers | wb.feedbacks.answer | POST   | refused | consent | t       |     1
 feedback_answers | wb.feedbacks.answer | POST   | refused | enabled | t       |     1
 feedback_answers | wb.questions.view   | PATCH  | dry_run |         | t       |     2

$ psql -d upready_store_w22 -Atc "select count(*) from marketplace_write_audit where outcome='sent'"
0
```

`dry_run = t` у всех строк, `sent` — ноль. Отказы, которые ловит первый слой (пункты 2, 4,
8, 10, 11), строк аудита не оставляют намеренно: до ядра записи они не доходят, значит
попытки обращения к Wildberries не было.

### Черновики и шаблоны в базе стенда

```
$ psql -d upready_store_w22 -c "select answer_status, count(*) from wb_feedback group by 1"
 answer_status | count
---------------+-------
 confirmed     |     1
 draft         |   122

$ psql -d upready_store_w22 -c "select feedback_id, answer_status, answer_confirmed_by,
    left(answer_sha256,12) from wb_feedback where draft_answer is not null"
     feedback_id      | answer_status |        answer_confirmed_by        |     left
----------------------+---------------+-----------------------------------+--------------
 VdkETh45CNXWe5F25tSv | confirmed     | tenadm_01M2KB5W8GKH1H77QDSPGEHBH3 | 836d9fa0b42e
 KI6UNj5iotDnrvklvztc | draft         |                                   |

$ psql -d upready_store_w22 -c "select slug, target, is_builtin, sort_order from wb_answer_template
    order by sort_order"
      slug       |  target  | is_builtin | sort_order
-----------------+----------+------------+------------
 thanks          | feedback | t          |         10
 apology-contact | feedback | t          |         20
 composition     | question | t          |         30
```

### Ноль сетевых вызовов

`fetch` — шпион в каждом кейсе юнит-сюиты: `feedback-answers.unit.spec.ts` подменяет
`globalThis.fetch` на функцию, которая БРОСАЕТ, и три dispatch-кейса проверяют
`expect(fetchSpy).not.toHaveBeenCalled()`. Названия тестов (18 штук, все зелёные):

```
planWbAnswerDispatch — the per-answer gates
  ✓ refuses to send a review answer that was never written
  ✓ treats a whitespace-only draft as no draft
  ✓ refuses a draft longer than the bound WB documents
  ✓ refuses a send with no confirmation at all
  ✓ refuses when the stored draft is not the text that was confirmed
  ✓ builds the documented body when the confirmation matches the draft
  ✓ hashes the TEXT and not the request body, so the panel can compute it
  ✓ refuses a review WB has already answered
  ✓ refuses a review this panel has already sent
  ✓ refuses to answer a QUESTION, and says it is a documentation gap
  ✓ builds the documented ViewQuestion body for «отметить просмотренным»
  ✓ refuses «отметить просмотренным» for a question WB already marked viewed
  ✓ refuses «отметить просмотренным» for a review, which WB does not document
dispatching a confirmed answer through the write core
  ✓ answers a review as a DRY RUN: zero fetches, one audit row, nothing sent
  ✓ marks a question viewed as a DRY RUN too
  ✓ is refused at the consent gate when the class was never confirmed
the registry entries this class needs
  ✓ registers the documented question mutation and validates its body
  ✓ names the unanswerable mutation, with its documentation page
```

### Скриншоты (живая панель, настоящие зеркальные отзывы)

- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-wb-write-feedback-answers/artifacts/docs/w22-wb-write-feedback-answers/shots/tab-feedbacks.png`
- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-wb-write-feedback-answers/artifacts/docs/w22-wb-write-feedback-answers/shots/tab-questions.png`

Смотрел глазами: на вкладке «Отзывы» — оба баннера, фильтр, табы со счётчиками (122 / 2),
карточка «оценка 4 из 5, 16.09.2026, Спрей для носа с АСД» со значком «подтверждён, в
журнале», текст шаблона в поле и активная кнопка «Подтвердить и отправить»; ниже карточки
без черновика с кнопкой неактивной. На вкладке «Вопросы» — настоящие вопросы покупателей,
вместо кнопки отправки стоит строка «отправка ответа недоступна — см. пояснение вверху
вкладки», кнопка «Отметить просмотренным» активна. Ошибок в консоли браузера нет
(`page errors: none`).

### Секреты

```
$ git grep -n -E "eyJhbGci|WB_API_KEY=|INTEGRATION_ENCRYPTION_KEY=" -- <файлы этой задачи>
apps/backend/src/modules/wb-write/__tests__/feedback-answers.unit.spec.ts:217:
  return `eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.${body}.test-signature`;
```

Одно вхождение, и это конструктор ФЕЙКОВОГО токена в юнит-тесте: подпись — литерал
`test-signature`, полезная нагрузка собирается в самом тесте. Ровно та же форма уже стоит в
`write-gates.unit.spec.ts` (w20) и `wb/__tests__/transport.unit.spec.ts` (w01). Настоящего
ключа в ветке нет. По ВСЕМУ репозиторию `git grep eyJhbGci` не пуст — как и записали w10 и
w13, совпадения приходят из промптов дня и старых артефактов, к этой задаче отношения не
имеющих.

Ключ записи на стенде засеян синтетическим: JWT с битом 30 снятым и подписью
`test-signature`, шифруется тем же `INTEGRATION_ENCRYPTION_KEY`, скрипт лежит в скретчпаде
сессии и в репозиторий не попадает. В проде слота `wildberries_write` нет.

## Чего НЕ сделано и почему

1. **Ответ на вопрос покупателя не отправляется** — тело запроса отсутствует в сохранённых
   копиях документации WB (`docs missing` выше), а перечитать страницу с этой машины нельзя.
   Черновики вопросов сохраняются, шаблон «Ответ на вопрос о составе» работает, диалог и
   подтверждение готовы: не хватает одной записи в реестре. Это развилка не для нас — нужна
   страница WB, а не решение.
2. **Живой записи нет и не проверялась**: `WB_WRITE_LIVE` не выставлена нигде, что репозиторий
   поставляет (тест это и проверяет), боевого ключа записи ни у одного магазина нет. Ноль
   строк `sent`.
3. **Правка уже опубликованного ответа** (`wb.feedbacks.answer.edit`, зарегистрирован с w20)
   из панели не вызывается: приёмка задачи требует «дважды ответить нельзя», и отвеченный
   отзыв отклоняется на воротах `already_answered`. Правка — отдельная операция со своим
   подтверждением (WB даёт её один раз за 60 дней), её стоит заводить задачей.
4. **AI-генератор черновиков** (то, что есть у InSales) не делался — назван как следующий шаг.
5. **Свои шаблоны арендатор пока не заводит из панели**: таблица `wb_answer_template` это
   умеет (slug, порядок, `is_builtin=false`), маршрута для создания/правки нет. Три
   встроенных выбираются из списка.
6. **Ozon-адаптера нет** — разобраны только его методы (таблица выше). Отдельная фаза.

## Расхождение с дизайн-каноном (осознанное)

Панель — `@medusajs/ui`, а не Geist: это копия Medusa Admin 2.19, и расхождение записано
ещё в отчёте w01 (`artifacts/docs/w01-wb-readonly-client/report.md`). Новых расхождений эта
задача не вводит.

## Как приёмщику проверить за 10 минут

1. `createdb -T upready_store_w03 upready_store_<ваш>`, в `apps/backend/.env` — `DATABASE_URL`
   на неё и свободный `PORT`; `npx medusa db:migrate` (ждём `Migrated Migration20260915235004`).
2. `cd apps/backend && npm run test:unit` → 57 сюит / 674 теста, зелено.
3. Поднять бэкенд и панель, войти как `owner@cherkashino.example` / `supersecret`,
   открыть «Настройки → Wildberries», пролистать до «Отзывы и вопросы».
4. Написать ответ на любой отзыв → «Подтвердить и отправить» → в диалоге стоит ровно тот
   текст → тост «Черновой прогон: …, в Wildberries ничего не ушло».
5. `select outcome, gate, dry_run, count(*) from marketplace_write_audit group by 1,2,3;` —
   строк `sent` быть не должно.

---

## Раунд 2 — сведение с `dev` (2026-09-16 08:24 WITA)

Пока шла приёмка, в `dev` уехал w23-wb-write-fbs-orders (PR #80, коммит `e8e0230c`), и PR #83
стал `CONFLICTING`. Смержил базу в ветку (`git merge origin/dev`, merge-коммит `ca3e61b7`) —
шесть конфликтов, все аддитивные, обе стороны живы:

| файл | как сведён |
|---|---|
| `api/middlewares.ts` | обе записи маршрутов рядом: `/tenants/wb/feedback-answers*` (w22) и `/tenants/wb/fbs-orders/actions` (w23) |
| `wb-write/write-endpoints.ts` | обе записи реестра: `wb.questions.view` (w22) и `wb.fbs.supply.create` + `wb.fbs.supply.add-orders` (w23). Итог — 10 мутаций |
| `wb-write/__tests__/no-live-write-call-site.unit.spec.ts` | взял версию `dev` целиком (она строже моей: исключает сам файл из скана и отдельным кейсом доказывает, что регулярка умеет падать) и добавил в `REGISTERED_CALLERS` свою строку + свой кейс про env-шаблоны, workflow и entrypoint — он смотрит на поверхность, которую скан исходников не видит |
| `wb/migrations/.snapshot-wb.json` | снимок — генерируемое состояние, руками не сводится: взял версию `dev` и перегенерировал (`npx medusa db:generate wb`). Сгенерированная миграция оказалась **побайтово тем же SQL**, что уже лежит в `Migration20260915235004`, поэтому её файл удалён, а обновлённый снимок оставлен. В снимке 13 таблиц, включая `wb_answer_template` и `wb_fbs_order`/`wb_supply` |
| `i18n/translations/{ru,en}.json` | сведены как JSON глубоким объединением, а не склейкой текста: конфликт сидел внутри одного объекта, и ручная правка скобок — ровно то место, где каталог молча теряет ключ. Скрипт объединения проверял два инварианта и отказался бы писать при нарушении любого: ни один ключ ни одной стороны не потерян, и ни один общий ключ не разошёлся текстом. **ru 2936 + 2956 → 3000, en 2840 + 2860 → 2904, потеряно 0, расхождений 0.** Мелочь, которую поверхностный spread испортил бы молча: `wildberries.kinds` есть у обеих сторон, и w23 добавил туда `supplies` и `fbs_orders` — после сведения в нём все 10 видов |

### Перепрогон после сведения (всё на слитом дереве)

```
apps/backend  npm run test:unit        → rc=0, 59 сюит, 704 теста   (было 57/674 до мержа)
apps/backend  npx tsc --noEmit         → rc=0
apps/backend  npx medusa lint          → rc=0, 0 ошибок
pnpm check:backend-build               → rc=0, «Backend build completed successfully»
apps/tenant-panel  npx tsc --noEmit    → rc=0
apps/tenant-panel  npx eslint src      → rc=0, 0 ошибок
node scripts/check-locale-catalogs.mjs → rc=0, «OK — 3 catalogs, 36 codes each, all agree»
```

Живой стенд после мержа (`npx medusa db:migrate` → `Migrated Migration20260915235342`, бэкенд поднят заново):

```
GET  /tenants/wb/feedback-answers?answered=unanswered  → 200
     endpoints: wb.feedbacks.answer, wb.feedbacks.answer.edit, wb.questions.view
     unregistered: questions.answer
     feedbacks: 122 unanswered, rows 50 | questions: 2 unanswered, rows 2
     строка из раунда 1 на месте: answer_status=confirmed, sha 836d9fa0b42e
POST .../send (отзыв, верное подтверждение)            → 200  dry_run  wb.feedbacks.answer
POST .../send (вопрос, intent=view)                    → 200  dry_run  wb.questions.view

     op_class     |     endpoint_id     | outcome | gate    | dry_run | count
------------------+---------------------+---------+---------+---------+-------
 feedback_answers | wb.feedbacks.answer | dry_run |         | t       |     3
 feedback_answers | wb.feedbacks.answer | refused | consent | t       |     1
 feedback_answers | wb.feedbacks.answer | refused | enabled | t       |     1
 feedback_answers | wb.questions.view   | dry_run |         | t       |     3

sent rows: 0
```

Скриншоты пересняты на слитом дереве (`page errors: none`); вкладка «Отзывы и вопросы» и
раздел FBS от w23 стоят на одной странице и друг другу не мешают.
