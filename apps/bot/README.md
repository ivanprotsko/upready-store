# @upready/upreadystore-bot

Telegram-бот [@upreadystore_bot](https://t.me/upreadystore_bot) — вход в платные тарифы
upready.dev. Страница тарифов ведёт сюда диплинком `https://t.me/upreadystore_bot?start=plan_<n>`,
где `<n>` — номер карточки тарифа (1 — Новичок, 2 — Профи, 3 — Мастер). Бот отвечает одним
сообщением: приветствие, тариф с ценой и составом, кнопки оплаты.

## Что бот делает

| Пришло | Ответ |
|---|---|
| `/start plan_1` | Тариф «Новичок». Он бесплатный — платить нечего, кнопок оплаты нет |
| `/start plan_2` | Тариф «Профи» + две кнопки оплаты |
| `/start plan_3` | Тариф «Мастер» + две кнопки оплаты |
| `/start` без payload | Приветствие и выбор из трёх тарифов (кнопки `plan_1..3`) |
| Неизвестный payload, любой другой текст | То же меню — не первый тариф и не молчание |

Кнопки оплаты подписаны дословно: «Оплатить картой РФ или МИР» и
«Оплатить картой Visa/MasterCard». Обе ведут в Tribute.

## Где что лежит

| Файл | Что в нём |
|---|---|
| `src/plans.ts` | ЕДИНСТВЕННОЕ место с содержанием тарифов: имена, цены, состав, пробный период |
| `src/payments.ts` | ЕДИНСТВЕННОЕ место с платёжными адресами: читает переменные окружения |
| `src/message.ts` | Чистое ядро: payload → тело `sendMessage`. Ни сети, ни окружения |
| `src/route.ts` | Апдейт Telegram → действие. Тоже чистая функция |
| `src/telegram.ts` | Тонкий клиент Bot API поверх `fetch` |
| `src/index.ts` | Процесс: длинный опрос, маршрутизация, лог оператора |

Переименовали тариф на странице — правка в `src/plans.ts`, одна.
Источник содержания — `apps/homepage/port/src/sections/tariffs/data.ts`
(ветка `feature/pricing-copy`, PR #6), а не память.

## Зависимости

Их нет. Node 22.18+ (здесь — 26.8.1) исполняет TypeScript напрямую, снимая типы, HTTP берётся из
глобального `fetch`, тесты — из `node --test`. В `devDependencies` только `typescript` и
`@types/node` — ради `tsc --noEmit`; обе версии уже стояли в корневом lock-файле.

Отсюда два флага в `tsconfig.json`: импорты пишутся с расширением `.ts`, а `erasableSyntaxOnly`
запрещает синтаксис, который снятием типов не выражается (`enum`, `namespace`,
параметры-свойства) — иначе `tsc` был бы доволен кодом, который Node не запустит.

## Команды

```sh
corepack pnpm --filter @upready/upreadystore-bot test       # юнит-тесты ядра
corepack pnpm --filter @upready/upreadystore-bot typecheck  # tsc --noEmit
corepack pnpm --filter @upready/upreadystore-bot poll       # живой бот, длинный опрос
```

Живой прогон направляют в файл, а не в конвейер: фильтр держал бы поток до конца процесса, и
работающий бот был бы неотличим от повисшего.

```sh
cd apps/bot && node --env-file-if-exists=.env src/index.ts > /tmp/upreadystore-bot.log 2>&1 &
```

## Переменные окружения

Полный список с пояснениями — в [`.env.example`](.env.example). Боевые значения лежат в
`apps/bot/.env`, который в git не уезжает (`**/.env` в корневом `.gitignore`).

- `TELEGRAM_UPREADY_STORE_BOT` — токен бота. Без него процесс не стартует и говорит почему.
- `TRIBUTE_URL_PLAN_<1|2|3>_<RU_MIR|VISA_MC>` — шесть платёжных адресов Tribute.
- `TELEGRAM_API_BASE` — база Bot API; пусто = `https://api.telegram.org`.

**Незаданный адрес — это отсутствие, а не рабочая ссылка.** Мёртвая кнопка не рисуется никогда:
вместо неё сообщение честно говорит, что оплату подключают, а дырка уходит в лог оператора —
при старте (`payment.link.missing`) и на каждой отправке (`payment.link.missing.onSend`), с именем
переменной, которой не хватило.

## Лог оператора

Одна строка JSON на событие: `bot.start`, `payment.link.ready` / `payment.link.missing`,
`sendMessage.request` (исходящее тело целиком — по нему и принимают прогон), `sendMessage.ok`,
`getUpdates.failed`, `handle.failed`.
