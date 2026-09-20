# Сырьё замеров b08-seo-storefront

Полные HTML-дампы страниц и sitemap «до» (312 КБ и 261 КБ) в git не кладутся — из них взяты списки
путей и счётчики, которые и лежат здесь. Как повторить — раздел «Как приёмщику проверить» в `../report.md`.

| Файл | Что это |
|---|---|
| `paths-before-cherkashino.txt`, `paths-before-acme.txt` | все пути sitemap двух тенантов ДО фикса (1481 и 1405 строк, 36 языков) |
| `sitemap-after-*.xml`, `paths-after-*.txt` | то же ПОСЛЕ (92 и 79 адресов, 2 языка) |
| `collections-api.txt` | ответы `/store/collections` и `/store/tenant/collections` для обоих тенантов |
| `redirects-after.txt` | коды ответа и Location для старых адресов `page`, `legacy_page` и каталога |
| `leak-sweep-after.txt` | обход всех 92 адресов sitemap + поиск и корзина на вхождения `olavka.ru` |
