# x02-domains — привязка cherkashino.ru и черкашино.рф

Замеры 2026-09-15 04:32–04:39 WITA. Задача закрыта **вторым из двух допустимых исходов**: платформенная
половина сделана целиком и проверена, DNS изменить нечем — доступа к зонам на машине нет, — поэтому
написана инструкция.

**Итог:** четыре хоста зарегистрированы на тенанте и стоят в ingress; маршрут до магазина проверен в обход
DNS; DNS обоих доменов по-прежнему смотрит на заглушки reg.ru; инструкция —
file:///Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/x02-domains/domain-instruction.md

---

## 1. Находка, которая меняла бы результат

**Punycode в задании был неверный.** В тексте задачи стояло `xn--80apaahi7a3c.xn--p1ai`; задание требовало
проверить конверсию, а не верить тексту:

```
$ python3 -c "print('черкашино.рф'.encode('idna').decode())"
xn--80ajkgrgj8cn.xn--p1ai

$ python3 -c "print('xn--80apaahi7a3c.xn--p1ai'.encode().decode('idna'))"
кирилица.рф
```

`xn--80apaahi7a3c.xn--p1ai` — **чужой домен** (`кирилица.рф`, A `80.96.109.236`, NS beget). Регистрация его
на нашем тенанте привязала бы к магазину Оксаны чужое имя. Зарегистрирован правильный
`xn--80ajkgrgj8cn.xn--p1ai`.

## 2. Доступы: что искал и что нашёл (шаг 1)

| где искал | команда | результат |
|---|---|---|
| ключи | `grep -i 'regru\|reg\.ru\|cloudflare' ~/upready/.env.keys` | только `REGRU_CLOUD_TOKEN` (комментарий: «Рег.облако (Reg.ru Cloud) — API и Terraform») |
| что это за токен | `curl -H "Authorization: Bearer $REGRU_CLOUD_TOKEN" https://api.cloudvps.reg.ru/v1/reglets` | `http=200`, список `reglets` — это **облачные VPS**, а не регистратор/DNS-зоны |
| Cloudflare | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_GLOBAL_API_KEY`, `CLOUDFLARE_EMAIL`, `CLOUDFLARE_CF_ADMIN_TOKEN`, `UPREADY_CLOUDFLARE_API_KEY` | все пять переменных **пустые** (`len=0`); запросы к API → `Invalid request headers` / `Missing X-Auth-Email header` |
| секреты | `grep -rl 'cherkashino\|reg\.ru\|regru' ~/upready/memory/secrets/` | один файл — `cherkashino-store/local-admin.txt`, это локальный Medusa-админ, к доменам отношения не имеет |
| реестр | `~/upready/specs/protected-infra/registry.json` | зон `cherkashino.ru` / `.рф` там нет; защищены `shipshift.dev` и `upready.dev` |

**Вывод:** учётных данных для зон `cherkashino.ru` и `черкашино.рф` на машине нет. И даже если бы
Cloudflare-токен работал — обе зоны делегированы на NS reg.ru, а не на Cloudflare, так что менять их
через Cloudflare нечем в принципе. Шаг 4 задания → «остановиться и написать инструкцию».

Зону `shipshift.dev` не трогал, `olavka.ru` не трогал, ни одной записи DNS нигде не менял.

## 3. DNS снаружи (шаг 2), дословно

```
$ dig +short cherkashino.ru A
31.31.197.78
$ dig +short cherkashino.ru NS
ns2.hosting.reg.ru.
ns1.hosting.reg.ru.
$ dig +short cherkashino.ru MX
20 mx2.hosting.reg.ru.
10 mx1.hosting.reg.ru.
$ dig +short cherkashino.ru TXT
"v=spf1 ip4:31.31.197.78 a mx include:_spf.hosting.reg.ru ~all"

$ dig +short xn--80ajkgrgj8cn.xn--p1ai A
95.163.244.138
$ dig +short xn--80ajkgrgj8cn.xn--p1ai NS
ns2.reg.ru.
ns1.reg.ru.

$ dig +short stores.shipshift.dev
84.46.251.149
```

**Чтение.** Оба домена живы в DNS, но указывают на заглушки хостинга reg.ru, а не на нас; на нас указывает
`84.46.251.149`. Зоны на разных NS reg.ru (`.ru` — на DNS хостинга, `.рф` — на DNS регистратора), правятся
в разных разделах кабинета. У `.ru` в зоне есть MX и SPF — значит **корень не может быть CNAME** (RFC 1034),
только A-запись; это и записано в инструкции. HTTP ни один из доменов сейчас не отдаёт (`curl rc=7`).

## 4. Регистрация хостов на тенанте (шаг 3)

Тенант `ten_01M2GQVGEN1204CN90C510DNRG`, handle `cherkashino`. Вход — `POST /auth/tenant/emailpass` → 200.

До: `"domains": []`, `primary_host: "cherkashino.shipshift.dev"`.

```
POST /tenants/domains {host:cherkashino.ru}                -> 201 {"domain":{"id":"tdom_01M2GT1QKQSSX96ZP4JZKMRYXE","host":"cherkashino.ru"}}
POST /tenants/domains {host:www.cherkashino.ru}            -> 201 {"domain":{"id":"tdom_01M2GT1SF3YQ4QMY7KAGYNPKH2","host":"www.cherkashino.ru"}}
POST /tenants/domains {host:xn--80ajkgrgj8cn.xn--p1ai}     -> 201 {"domain":{"id":"tdom_01M2GT1VFXP8AEBCBBZ9SQ1KRR","host":"xn--80ajkgrgj8cn.xn--p1ai"}}
POST /tenants/domains {host:www.xn--80ajkgrgj8cn.xn--p1ai} -> 201 {"domain":{"id":"tdom_01M2GT1X5NJX8QXY140WXDVV6K","host":"www.xn--80ajkgrgj8cn.xn--p1ai"}}
```

Зарегистрировано **четыре** хоста, а не три: `www` для `.рф` добавлен по той же причине, что и для `.ru` —
чтобы `www` не остался без сертификата.

Ingress на живом хосте:

```
$ ssh -n contabo 'grep -c cherkashino /data/coolify/proxy/dynamic/mt-tenants.yml'
12
$ ssh -n contabo 'grep -c "xn--" /data/coolify/proxy/dynamic/mt-tenants.yml'
8
```

12 = 4 роутера (https+http) на `cherkashino.ru` и `www.cherkashino.ru` + 4 строки технического хоста
`cherkashino.shipshift.dev`; правила `Host(...)` для всех четырёх новых хостов присутствуют
(см. `api-domains.log`). Файл писал `mt-ingress-sync` сам, руками не правился.

## 5. Маршрут проверен в обход DNS

Запрос с нужным `Host` прямо на IP ingress — это проверка всего пути, кроме DNS:

```
http://cherkashino.ru/ru            (--resolve 84.46.251.149) -> 302 https://cherkashino.ru/ru
http://www.cherkashino.ru/ru        (--resolve 84.46.251.149) -> 302 https://www.cherkashino.ru/ru
http://xn--80ajkgrgj8cn.xn--p1ai/ru (--resolve 84.46.251.149) -> 302 https://xn--80ajkgrgj8cn.xn--p1ai/ru
```

И резолвер бэкенда уже знает новые хосты:

```
$ curl 'https://shipshift.dev/storefront/by-host?host=cherkashino.ru'
{"tenant":{"id":"ten_01M2GQVGEN1204CN90C510DNRG","handle":"cherkashino","name":"Оксана Черкашина"},
 "primary_host":"cherkashino.shipshift.dev","is_primary_host":false,...}
```

`https` на новых хостах пока `ssl_verify=20` (`curl rc=60`) — сертификата нет, и это ожидаемо:
Let's Encrypt выдаёт по HTTP-01, для которого нужен DNS, указывающий на нас. Всё, кроме DNS, готово.

## 6. Canonical-поведение (шаг 5) — проверено живьём впервые

Инвентарь возможностей (§2) утверждал: постраничный 301 «на `dev`, живьём не проверен». Проверено на живом
`mt-storefront` (`10.0.1.29:8000`, заголовок `Host`):

| Host | путь | ответ |
|---|---|---|
| `cherkashino.ru` | `/ru` | `301` → `https://cherkashino.shipshift.dev/ru` |
| `cherkashino.ru` | `/ru/store` | `301` → `https://cherkashino.shipshift.dev/ru/store` |
| `www.cherkashino.ru` | `/ru/store` | `301` → `https://cherkashino.shipshift.dev/ru/store` |
| `xn--80ajkgrgj8cn.xn--p1ai` | `/ru/store` | `301` → `https://cherkashino.shipshift.dev/ru/store` |
| `cherkashino.shipshift.dev` | `/ru`, `/ru/store` | `200` |

**301 постраничный — путь сохраняется.** Подтверждено. Это же даёт практическое следствие для инструкции:
пока `is_primary` не переставлен на `cherkashino.ru`, домен будет **уводить** покупателя на технический
адрес. Шаг «Сделать основным» в инструкции — обязательный, а не косметический.

`is_primary` **намеренно не менял**: `POST /tenants/domains/:id/primary` перед повышением проверяет
`https://<домен>/healthz` (таймаут 5 с) и сейчас отказал бы; а если бы прошёл — увёл бы работающий магазин
на адрес, которого нет в DNS.

**Смена handle с алиасом** (`tenant_handle_alias`) — **не проверял**, отдельного повода менять handle
живого магазина не было. Остаётся непроверенным, как и было.

## 7. Открытый вопрос, не решён

В собранном бандле панели (`/assets/index-BgEosJYB.js`, образ `mt-panel` от 2026-09-14 05:17 UTC) **нет ни
одной строки вида `stores.*`**, хотя код маршрута домены в бандле есть, а на стенде
`STORES_DOMAIN=stores.shipshift.dev` задан (`/opt/upready-store/mt/deploy/mt/shipshift.env:15`). Какой
именно CNAME-адрес панель показывает владельцу вживую, **я не установил** — в UI панели не заходил.

Значение имеет: фолбэк в коде (`apps/tenant-panel/src/routes/settings/domains/domains.tsx:45`) —
`stores.upready.dev`, а он **не резолвится вовсе** (`dig +short stores.upready.dev` → пусто). Если панель
показывает фолбэк, владельцу выдаётся нерабочая инструкция. Проверяется одним открытием
`https://panel-store.upready.dev` → Настройки → Адрес магазина. В моей инструкции адрес взят из замера
(`stores.shipshift.dev` → `84.46.251.149`), а не из панели.

## 8. Магазин жив (приёмка)

```
https://cherkashino.shipshift.dev/ru        -> 200 ssl_verify=0
https://cherkashino.shipshift.dev/ru/store  -> 200
https://panel-store.upready.dev/            -> 200
https://start.upready.dev/start/onboarding  -> 200
https://zolotaya-nit-1057.shipshift.dev/    -> 302 -> /ru -> 200   (локальный редирект, не регрессия)
```

Деплоя не было, DNS не менялся, защищённые ресурсы не трогались.
