# Прогресс — Area A (security), 2026-09-23 — ЗАВЕРШЕНО

Итоговый отчёт: `/Users/ivanprotsko/upready/projects/upready-store/handoff/audit-2026-09-23/security.md`
Вывод pnpm audit: `/Users/ivanprotsko/upready/projects/upready-store/handoff/audit-2026-09-23/pnpm-audit-prod.json`

## Оценка: D (есть Critical). Critical 2, High 4, Medium 4, Low 3, Info 2.

## Все восемь пунктов «Must check» области A закрыты
1. Изоляция тенантов — разобрана целиком, спроектирована правильно; T-6 подтверждён закрытым в `dev` (PR #109, 954c860d).
2. AuthN/AuthZ — овнер/покупатель/админ разведены, IDOR по заказам закрыт; найдены: пароль min 8, нет rate limit, дефолт `supersecret`.
3. Валидация и инъекции — SQLi нет, XSS-синки закрыты, open redirect закрыт, загрузки проверяются по типу И расширению.
4. Транспорт и заголовки — НЕТ security headers, НЕТ `COOKIE_SECURE`, НЕТ rate limit; вебхуки Robokassa/Telegram/CDEK проверены.
5. Секреты — в git нет; дефолты открываются вместо того чтобы закрываться (A-06).
6. Зависимости — critical 3, high 54, moderate 52, low 7; три прямые: lodash, nodemailer, sharp.
7. Логи и приватность — e-mail в логах (A-11); тел запросов не логируются.
8. Платежи — только Robokassa с редиректом, карточные данные наших серверов не касаются (PCI DSS SAQ A), вебхук сделан правильно.

## Главное, что нашлось
- A-01/A-02 Critical: `/tenants/customers/export` и `/tenants/orders/export` пишут CSV с ПД покупателей в ПУБЛИЧНУЮ статику
  с предсказуемым именем. Три соседние выгрузки сделаны правильно — есть готовый шаблон для правки.
- A-03 High: `COOKIE_SECURE` не выставлен нигде и не передаётся в контейнер.
- A-04 High: нет ограничения частоты ни на логине овнера, ни на регистрации магазина.

## Не покрыто (перечислено в отчёте)
Построчная сверка валидаторов по всем 181 маршруту; вторая половина `store/order-access.ts` и `cart-scope.ts`;
воркфлоу `createTenantWorkflow`; схема шифрования `tenant_integration_secret`; динамических проверок не было вовсе.
