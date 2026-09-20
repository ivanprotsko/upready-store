# Source: (замер этой задачи, не страница)
# Fetched: 2026-09-16 12:22 WITA
# Topic: out-of-the-box-onboarding
# HTTP: n/a

## Замер доступности хостов первоисточников (r04, 2026-09-16 12:22 WITA)

Все пробы — курлом с UA `upready-research/1.0 (+https://upready.dev)`, по одной, без ретраев.

| Хост | Ответ | Что это значит |
|---|---|---|
| https://www.cdek.ru/ru/ | 200, 2145 байт, тело = JS-челлендж ServicePipe (`js-challenge-loader`, `servicepipe.tech/loaders/...`) | страница не отдаётся скрипту |
| https://www.cdek.ru/robots.txt | 418 | анти-бот |
| https://api-docs.cdek.ru/ | DNS не резолвится (`Could not resolve host`) | хост, названный по памяти, НЕ СУЩЕСТВУЕТ |
| https://integration.cdek.ru/ | 410 Gone | портал интеграций снят самим СДЭК |
| https://lk.cdek.ru/ | 200, 1648 байт | JS-приложение личного кабинета, документации нет |
| https://www.pochta.ru/ , /robots.txt , /support/business | 417 на UA `upready-research/1.0`, на `curl/8.7.1` и на UA Chrome | блокировка не зависит от UA |
| https://otpravka.pochta.ru/ и /static/views/specification/*.html | 200 | рабочий источник Почты |
| https://robokassa.ru/ | node fetch падает на редиректе; фактический адрес https://robokassa.com/ | канонический хост — .com |
| https://docs.robokassa.ru/ | node: `unable to get local issuer certificate`; curl (системное хранилище) — 200 | неполная цепочка сертификатов, лечится фолбэком на curl |

Вывод: по СДЭК и по основному сайту Почты России живые страницы этой машине недоступны;
цитаты по СДЭК берутся из сохранённых копий официальных документов (`raw/cdek/*`, сняты 2026-08-31),
по Почте — из работающего `otpravka.pochta.ru`.
