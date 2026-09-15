# Приёмка f14-no-password-reset · PR #52 · раунд 1

Приёмщик: headless-сессия, ветка `fix/day16-no-password-reset` @ `18a2bec` (= `origin/...`, дерево чистое,
форк от `origin/dev` `905772f` — по рефлогу «Created from origin/dev»).

## Стенд (живой, свой код)

- БД-скретч `upready_store_f14acc` — клон `upready_store_cherkashina` + `npx medusa db:migrate` (rc=0).
- Бэкенд из ЭТОЙ ветки: `npx medusa develop`, порт **9245**. Маркер «мой код отвечает»:
  `GET /auth/tenant/mail-status` — маршрут, которого до PR #52 не существовало, отвечает 200.
- Панель из этой ветки: `npx vite --port 5247 --strictPort`, `VITE_MEDUSA_BACKEND_URL=http://localhost:9245`.
- Владелец: существующий `admin@globex.test` (tenant `Globex`, `tenadm_01M25V2Y0BRMXA1R1E7N6XTEFV`),
  старый пароль `supersecret` — до сброса пускал (`POST /auth/tenant/emailpass` → **200**).

Замер сделан в ДВУХ режимах: `SMTP_HOST` пуст (как сейчас на МТ-деплое) и `SMTP_HOST=127.0.0.1:2529`
(локальный SMTP-sink, перехват письма целиком).

## Критерии задачи

| # | Критерий | Замер | Итог |
|---|---|---|---|
| 1 | На `/login` видна ссылка восстановления, ведёт на рабочую форму | Единственная ссылка экрана: `Забыли пароль? - Сбросить :: /forgot-password`; клик → `http://localhost:5247/forgot-password`, форма рендерится | PASS |
| 2 | Существующий e-mail даёт понятный результат, код ответа в отчёте | SMTP нет: `POST /auth/tenant/emailpass/reset-password` → **201**, экран по-русски: «Платформа сейчас не может отправлять письма (не настроен почтовый сервер). Напишите нам на hello@example.com, и мы сбросим пароль вручную» — до и после отправки, без спиннера. SMTP есть: → **201**, «Мы отправили вам email…» | PASS |
| 3 | Несуществующий e-mail не раскрывает наличие владельца | `admin@globex.test` → 201, `nobody-f14-acc@example.com` → 201; тексты экранов сравнены программно: **идентичны**. С включённым SMTP на несуществующий адрес письмо НЕ ушло (в sink ровно 1 письмо, `To: admin@globex.test`) | PASS |
| 4 | Скриншоты обоих экранов 1280x900 | 10 шт., см. ниже | PASS |

## Сверх критериев — полный цикл «письмо → новый пароль → вход» (формулировка диспетчера)

1. `SMTP_HOST=127.0.0.1:2529` → форма БЕЗ предупреждения (`mail-status: {"configured":true,...}`), отправка → 201.
2. Письмо перехвачено sink'ом: `From: Upready Store <stand@example.com>`, `To: admin@globex.test`,
   `Subject: =?UTF-8?B?0KHQsdGA0L7RgSDQv9Cw0YDQvtC70Y8=?=` («Сброс пароля»). Ссылка в письме ведёт на
   **панель**, а не на витрину: `http://localhost:5247/reset-password?token=…&email=…`
   (`PANEL_PUBLIC_URL`, функция `panelResetPasswordUrl`). Лог бэкенда: `[password-reset-email] Sent to admin@globex.test (locale: ru)`.
3. Переход по ссылке из письма → форма нового пароля; отправка → `POST /auth/tenant/emailpass/update` → **200**,
   экран «Пожалуйста, войдите на странице входа».
4. Вход НОВЫМ паролем через UI панели → `http://localhost:5247/` и дашборд владельца (виден `Globex`, меню, ключ `pk_96a***a92`).
5. Старый пароль после сброса отклонён: `POST /auth/tenant/emailpass` c `supersecret` → **401** `Invalid email or password`;
   с новым → **200**.
6. `/reset-password` без токена — честный тупик: «Ваша ссылка для сброса недействительна» + кнопка «Перейти к сбросу пароля».

## Проверки кода

- `apps/backend`: `npx tsc --noEmit` rc=0; `npx medusa lint` — **0 errors**, 59 warnings, ни одной в затронутых файлах.
- `apps/tenant-panel`: `npx tsc --noEmit` rc=0.
- `apps/backend` `pnpm test:unit` — 239/240. Единственный провал `src/migration-scripts/__tests__/profile-data.unit.spec.ts`
  воспроизведён на чистом `dev` в основном чекауте (`050f777`, та же сюита: 1 failed, 14 passed) — пред-существует, не этот PR.
- Все i18n-ключи, которые используют новые экраны (`resetPassword.*`, `login.forgotPassword`), в `ru.json`/`en.json` есть —
  ни одного сырого ключа на экране (проверено и текстом экранов, и по JSON).
- Секретов в коде нет: `GET /auth/tenant/mail-status` отдаёт только `Boolean(SMTP_HOST)` и платформенный `STORE_EMAIL`.
  Миграций, удалений, изменений защищённой инфраструктуры в диффе нет.

## Мелочи (не основание для отказа)

1. «Show password» — по-прежнему по-английски, теперь ещё и на двух новых экранах сброса. По брифу закреплено за `f12`.
2. В комментарии `apps/backend/src/api/auth/tenant/mail-status/route.ts` написано «always answers 204» —
  замерено **201** (и тело `Created`). Косметика в комментарии.

## Стенд убран

Бэкенд (9245), панель (5247) и SMTP-sink (2529) остановлены по порту, порты проверены пустыми;
скретч-БД `upready_store_f14acc` удалена; `apps/backend/.env` в воркtree удалён (дерево чистое).
