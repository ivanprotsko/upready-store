| id | функция | утром | вечером | доказательство | задача |
|---|---|---|---|---|---|
| varianty-tovara | Варианты товара | есть | есть |  | — |
| svoystva-i-parametry-tovara | Свойства и параметры товара | частично | частично | Экран «Характеристики товаров» живой в панели (`shots/p01-product-attributes-1280x900.png`); у Оксаны характеристик нет — `tenant_product_attribute` = 0 на живой БД. Продукт есть, у клиента не заполнено. | t15-product-attributes |
| gruppovoe-redaktirovanie-variantov | Групповое редактирование вариантов | нет | нет |  | — |
| vidy-tsen | Виды цен | нет | нет |  | — |
| tipy-tsen | Типы цен (по клиенту/оплате/количеству) | нет | нет |  | — |
| komplekty-tovarov | Комплекты товаров | нет | нет |  | — |
| umnye-kategorii | Умные категории | нет | нет |  | — |
| skrytye-kategorii-i-gruppy | Скрытые категории и группы | нет | нет |  | — |
| tsifrovye-tovary | Цифровые товары | нет | нет |  | — |
| sortirovka-tovarov | Сортировка товаров | частично | есть | Живая витрина: сортировка «Новинки» и пять фильтров каталога, выбор «10 шт» сузил выдачу с 12 карточек до 1 (`q01-qa-customer/report.md` §2). | t07-catalog-filters-hero |
| massovye-operatsii-s-tovarami | Массовые операции с товарами | нет | нет |  | — |
| poisk-po-katalogu-v-adminke | Поиск по каталогу в админке | нет | нет |  | — |
| redaktor-kartochki-tovara | Редактор карточки товара (WYSIWYG) | нет | нет |  | — |
| dopolnitelnye-tovary | Дополнительные товары | нет | нет |  | — |
| otzyvy-na-tovary | Отзывы на товары | нет | частично | Экран «Отзывы» в панели живой, текст «Найдено отзывов: 0» (`shots/p01-reviews-1280x900.png`); `product_review` = 0 по ВСЕЙ живой платформе — 332 отзыва Оксаны не перенесены. | t09-reviews |
| markirovannye-tovary-487-fz | Маркированные товары (487-ФЗ) | нет | нет |  | — |
| tovarnyy-uchet-i-ostatki | Товарный учёт и остатки | есть | есть |  | — |
| sklady-multisklad-s-rezervirovaniem | Склады (мультисклад с резервированием) | частично | частично |  | — |
| import-eksport-csv-xls-xlsx | Импорт/экспорт CSV, XLS, XLSX | нет | частично | Выгрузка живьём: `GET /tenants/products/export` → 200, CSV 171 строка (`raw/export-products.csv`); в панели кнопки «Выгрузить CSV» и «Загрузить CSV». Загрузка живьём не запускалась — `tenant_product_import` = 0. Колонка цены в выгрузке — «Цена, USD» со значением 18 при 1 084 ₽ на витрине, рублёвой колонки нет. | t14-product-import |
| import-eksport-yml-xml | Импорт/экспорт YML, XML | нет | нет |  | t14-product-import |
| import-po-raspisaniyu | Импорт по расписанию | нет | нет |  | t14-product-import |
| import-iz-google-sheets-po-ssylke | Импорт из Google Sheets по ссылке | нет | нет |  | t14-product-import |
| zagruzka-izobrazheniy-po-ssylkam | Загрузка изображений по ссылкам | нет | нет |  | t14-product-import |
| avtoopredelenie-struktury-importa | Автоопределение структуры импорта | нет | нет |  | t14-product-import |
| sistemnye-parametry-dlya-marketpleysov | Системные параметры для маркетплейсов | нет | нет |  | — |
| faylovoe-hranilische | Файловое хранилище | частично | частично |  | — |
| gotovye-adaptivnye-shablony | Готовые адаптивные шаблоны | частично | частично |  | — |
| vizualnyy-redaktor-sayta | Визуальный редактор сайта | нет | нет |  | — |
| vidzhety-vitriny | Виджеты витрины | частично | частично |  | — |
| redaktor-koda-html-css-js-liquid | Редактор кода HTML/CSS/JS/Liquid | нет | нет |  | — |
| otdelnye-versii-desktop-mobilnaya | Отдельные версии десктоп/мобильная | частично | частично |  | — |
| generator-logotipov | Генератор логотипов | нет | нет |  | t16-owner-branding |
| storonnie-shablony | Сторонние шаблоны | нет | нет |  | — |
| palitra-tsvetov-shablona | Палитра цветов шаблона | нет | есть | Живой экран «Бренд»: логотип светлой и тёмной темы, фавикон, картинка для соцсетей и основной цвет (`shots/p01-settings-branding-1280x900.png`). У Оксаны всё пусто — витрина отдаёт платформенный `/icon.svg`. | t16-owner-branding |
| upravlenie-kontentom | Управление контентом | частично | частично | Живые «Страницы», «Журнал» и «Главная страница» в панели; редактора меню по-прежнему нет. | t05-page-keys / t10-blog |
| galereya-shablonov-katalog | Галерея шаблонов (каталог) | частично | частично |  | — |
| klientskaya-baza | Клиентская база | частично | есть | Живой экран «Клиенты» с пятью покупателями и `POST /tenants/customers/export` → CSV на 5 строк (`raw/customers-export.csv`). Дефект: «Заказы» и «Сумма покупок» удвоены — у `qa1` 2 заказа на ₽ 2 188 при одном заказе на ₽ 1 094. | t13-customers-screen |
| statusy-zakaza | Статусы заказа | есть | есть |  | — |
| sinhronizatsiya-statusov-s-marketpleysami | Синхронизация статусов с маркетплейсами | нет | нет |  | — |
| polnyy-tsikl-obrabotki-zakazov-marketpleysov | Полный цикл обработки заказов маркетплейсов | нет | нет |  | — |
| massovye-operatsii-s-zakazami | Массовые операции с заказами | нет | нет |  | — |
| dokumenty-po-zakazam | Документы по заказам (чек/накладная/счёт-фактура) | нет | нет |  | — |
| zadachi-k-zakazam | Задачи к заказам | нет | нет |  | — |
| lichnyy-kabinet-pokupatelya | Личный кабинет покупателя | есть | есть |  | — |
| segmentatsiya-pokupateley | Сегментация покупателей | нет | нет |  | t13-customers-screen |
| avtorizatsiya-pokupatelya | Авторизация покупателя | частично | частично | Обычная регистрация проверена живьём: заказ #10 гостем → регистрация на тот же e-mail → «Заказ №10» в кабинете (`shots/s10-account-orders-1280x900.png`). Яндекс ID и Госуслуг нет. | — |
| nastroyka-oformleniya-zakaza | Настройка оформления заказа | частично | частично |  | — |
| zakaz-v-odin-klik | Заказ в один клик | нет | нет |  | — |
| uvedomleniya-o-novyh-zakazah | Уведомления о новых заказах | частично | частично | Живой заказ #10, лог `mt-backend`: `[order-placed-telegram] … the shop … has no Telegram chat linked, skipping` и `[order-placed-email] Failed to send the letter … Could not find a notification provider for channel: email`. Канал есть, ни один адресат не получает. | t08-order-notifications |
| avtoopredelenie-naselennogo-punkta-antibot-kommentarii | Автоопределение города, антибот, комментарии | нет | нет |  | — |
| dokumentatsiya-zakazy-klienty | Документация «Заказы», «Клиенты» | не применимо | не применимо |  | — |
| sistema-skidok | Система скидок | есть | есть |  | — |
| promokody | Промокоды | есть | есть |  | — |
| bonusnaya-programma | Бонусная программа | нет | нет |  | — |
| polzovatelskie-skidki | Пользовательские скидки | частично | частично |  | — |
| natsenki-i-skidki-na-sposoby-oplaty | Наценки/скидки на способы оплаты | нет | нет |  | — |
| broshennye-korziny | Брошенные корзины | нет | нет |  | — |
| massovye-rassylki-email-sms | Массовые рассылки email/SMS | нет | нет |  | — |
| triggernye-rassylki | Триггерные рассылки | частично | частично |  | t08-order-notifications |
| retargeting-vkontakte | Ретаргетинг ВКонтакте | нет | нет |  | — |
| reklamnye-servisy | Рекламные сервисы (СберТаргет, VK, Директ) | нет | нет |  | — |
| generator-utm-metok | Генератор UTM-меток | нет | нет |  | — |
| schetchiki-i-pikseli | Счётчики и пиксели | частично | есть | Живой экран `/settings/analytics`: «Номер счётчика Яндекс Метрики» и «Идентификатор GA4» (`shots/p01-settings-analytics-1280x900.png`). У Оксаны не заполнены. | t17-analytics |
| startovye-reklamnye-bonusy | Стартовые рекламные бонусы | не применимо | не применимо |  | — |
| yukassa | ЮKassa | нет | нет | ЮKassa в коде нет; сделан Robokassa — другой провайдер. Ключей Оксаны нет: `tenant_integration_secret` = 0. | t03-tenant-secrets-robokassa |
| sposoby-oplaty-cherez-yukassa | Способы оплаты через ЮKassa (карты/СБП/SberPay) | нет | нет | На живом чекауте единственный способ — «Оплата вручную» (демо-карта). `GET /store/payment-providers` у q01 отдавал только `pp_system_default`. | t03-tenant-secrets-robokassa |
| drugie-platezhnye-servisy | Другие платёжные сервисы | частично | частично | Живой экран «Приём оплат» с полями Robokassa и статусом «не настроено» (`shots/p01-settings-payments-1280x900.png`); `tenant_integration_secret` = 0 — код есть, живьём не проверено, нужны боевые пароли Robokassa от Оксаны. | t03-tenant-secrets-robokassa |
| onlayn-kassy | Онлайн-кассы (54-ФЗ) | нет | нет |  | — |
| oflayn-sposoby-oplaty | Офлайн-способы оплаты | нет | нет |  | — |
| onlayn-kreditovanie | Онлайн-кредитование | нет | нет |  | — |
| vneshnie-sposoby-oplaty-cherez-api | Внешние способы оплаты через API | частично | частично |  | — |
| svyaz-oplaty-i-dostavki | Связь оплаты и доставки | нет | нет |  | — |
| insales-dostavka | Собственный агрегатор служб доставки | нет | нет |  | t04-shipping-tariffs |
| sdek-pochta-rossii-dpd-dalli | СДЭК, Почта России, DPD, Dalli | нет | нет | На живом чекауте только «Самовывоз» и «Курьером» — ни одной реальной службы (`shots/s01-checkout-1280x900.png`). | t04-shipping-tariffs |
| boxberry-dostavista | Boxberry, Dostavista | нет | нет |  | — |
| yandeks-dostavka-5post | Яндекс Доставка, 5Post | нет | нет |  | — |
| raschet-dostavki-v-kartochke-tovara | Расчёт доставки в карточке товара | нет | нет |  | t04-shipping-tariffs |
| zony-dostavki | Зоны доставки | нет | частично | Мастер «Новый способ доставки» просит «Название, зона и правило цены»; у живых способов зона — «Все страны магазина» (`shots/p03-shipping-create-1280x900.png`). Региональных зон РФ нет. | t04-shipping-tariffs |
| pravila-stoimosti-dostavki | Правила стоимости доставки (по сумме/весу/региону) | нет | частично | Живой экран «Доставка»: «Фиксированная цена» у обоих способов и блок «Вес товара по умолчанию … Для тарифов по весу». По сумме заказа и по региону правил нет. | t04-shipping-tariffs |
| sposoby-dostavki | Способы доставки (курьер/самовывоз/ПВЗ) | частично | есть | Живой чекаут: «Самовывоз — Бесплатно» и «Курьером — 300,00 ₽», названия человеческие, выбор доезжает до заказа («Метод: Самовывоз · 0,00 ₽» на странице заказа #10). | t04-shipping-tariffs |
| kalendar-i-intervaly-dostavki | Календарь и интервалы доставки | нет | нет |  | — |
| edinye-etiketki-i-treking | Единые этикетки и трекинг | нет | нет | Код есть (приёмка t04 на стенде), живьём не проверено: все шесть заказов магазина отменены, отгрузку создавать не на чем; на карточке заказа #10 поля трек-номера нет (`shots/p03-order-card-1280x900.png`). Этикеток нет вовсе. | t04-shipping-tariffs |
| otgruzki | Отгрузки | нет | нет |  | — |
| nalozhennye-platezhi-i-balans | Наложенные платежи и баланс | нет | нет |  | — |
| natsenka-na-dostavku | Наценка на доставку | нет | нет |  | — |
| vozvraty | Возвраты | частично | частично |  | — |
| upakovki-i-kontakty-sklada | Упаковки и контакты склада | нет | нет |  | — |
| vneshnie-sposoby-dostavki-cherez-api | Внешние способы доставки через API | частично | частично |  | t04-shipping-tariffs |
| ozon-wildberries-yandeks-market-avito | Ozon, Wildberries, Яндекс Маркет, Avito | нет | нет |  | — |
| shemy-fbs-fbo-dbs | Схемы FBS, FBO, DBS | нет | нет |  | — |
| obedinenie-kartochek | Объединение карточек | нет | нет |  | — |
| ai-generatsiya-opisaniy-kartochek | AI-генерация описаний карточек | нет | нет |  | — |
| edinyy-ostatok-i-tablitsa-tsen | Единый остаток и таблица цен | нет | нет |  | — |
| edinaya-lenta-zakazov-ploschadok | Единая лента заказов площадок | нет | нет |  | — |
| avtootvety-na-otzyvy-wildberries | Автоответы на отзывы Wildberries | нет | нет |  | — |
| vkontakte-i-odnoklassniki | ВКонтакте и Одноклассники | нет | нет |  | — |
| messendzhery-kak-kanal-prodazh | Мессенджеры как канал продаж | частично | частично |  | — |
| prochie-ploschadki | Прочие площадки | нет | нет |  | — |
| spravka-po-integratsiyam | Справка по интеграциям | не применимо | не применимо |  | — |
| onbording-na-marketpleysy | Онбординг на маркетплейсы | не применимо | не применимо |  | — |
| sayt-iz-vitriny-marketpleysa | Сайт из витрины маркетплейса | не применимо | не применимо |  | — |
| osnovnye-pokazateli-prodazh | Основные показатели продаж | нет | частично | Блок «Продажи» на «Обзоре» живой, но цифры неверны: панель показывает 11 заказов / ₽ 14 293 при реальных 6 заказах на ₽ 8 050, из которых 5 отменены (`shots/s11-panel-overview-sales-1280x900.png`). | t17-analytics |
| tovarnaya-analitika | Товарная аналитика | нет | нет |  | — |
| reklama-tovarov | Реклама товаров (CPC/CPA) | нет | нет |  | — |
| pribyl-i-ubytki | Прибыль и убытки | нет | нет |  | — |
| oborachivaemost | Оборачиваемость | нет | нет |  | — |
| otchety-po-prodazham | Отчёты по продажам | нет | частично | «Выручка по дням» и «Топ товаров» живые, но считаны из тех же удвоенных данных: «Свечи АСД с чесноком — 6 шт» при трёх проданных. | t17-analytics |
| istochniki-zakazov | Источники заказов | нет | нет |  | — |
| abc-xyz-analiz | ABC/XYZ-анализ | нет | нет |  | — |
| posescheniya-konversiya-vremya-obrabotki | Посещения, конверсия, время обработки | частично | частично |  | t17-analytics |
| ai-analitik | AI-Аналитик | нет | нет |  | — |
| opovescheniya-o-defitsite-ostatkov | Оповещения о дефиците остатков | нет | нет |  | — |
| vstroennye-seo-instrumenty | Встроенные SEO-инструменты | частично | есть | Живьём: `robots.txt` 200 с `Host` и `Sitemap`, `sitemap.xml` 200, `<link rel="canonical">` и `og:image` на карточке товара (`raw/t11-seo.txt`). | t11-seo-redirects |
| seo-filtry | SEO-фильтры | нет | нет |  | — |
| seo-parametry-stranits-i-tovarov | SEO-параметры страниц и товаров | нет | частично | Поля SEO в панели есть (приёмка t11), у товаров Оксаны не заполнены: на живой карточке `meta name="description"` — ноль вхождений, `<title>` шаблонный «Гепачисты | Оксана Черкашина». | t11-seo-redirects |
| robots-txt-i-sitemap-xml | Robots.txt и Sitemap.xml | частично | есть | `https://cherkashino.shipshift.dev/robots.txt` 200, `sitemap.xml` 200 с 2021 адресами. Замечание: карта сайта перечисляет 35 языков, хотя магазин русский. | t11-seo-redirects |
| 301-redirekty | 301-редиректы | нет | нет | Таблица `tenant_redirect` на живой БД есть, правил ноль (0 строк по всей платформе); старые адреса `/ru/ru/products/zubnaya-pasta-tayskaya-otbelivayuschaya` и `/ru/ru/categories/dobavki` отдают 404. Скрипт `import-cherkashino-redirects.ts` на живом хосте не запускали — приёмка t11 мерила на стенде `cherkashino.localhost:8121`. | t11-seo-redirects |
| blog-i-stati | Блог и статьи | нет | частично | Лента `/ru/journal` отдаёт 200 («Журнал | Оксана Черкашина»), экран «Журнал» в панели живой; статей ноль — `tenant_article` = 0, панель пишет «Статей пока нет». | t10-blog |
| chpu-ssylki | ЧПУ-ссылки | есть | есть |  | — |
| prilozhenie-ios-i-android | Приложение iOS и Android | нет | нет |  | — |
| upravlenie-zakazami | Управление заказами с телефона | нет | нет |  | — |
| tovary-i-ostatki | Товары и остатки с телефона | нет | нет |  | — |
| analitika-prodazh | Аналитика продаж в приложении | нет | нет |  | — |
| redaktor-struktury-i-kontenta | Редактор структуры и контента в приложении | нет | нет |  | — |
| kommunikatsii | Коммуникации в приложении | нет | нет |  | — |
| mobilnye-pushi-o-zakazah | Мобильные пуши о заказах | нет | нет |  | — |
| multikanalnyy-chat-dialogi | Мультиканальный чат «Диалоги +» | нет | нет |  | — |
| onlayn-chat-dlya-sayta | Онлайн-чат для сайта | нет | нет |  | — |
| kanaly-kommunikatsii | Каналы коммуникации (WhatsApp/TG/Viber/VK/email) | частично | частично |  | — |
| shablony-soobscheniy-i-pisem | Шаблоны сообщений и писем | частично | частично |  | — |
| uvedomleniya-o-statusah | Уведомления о статусах | частично | частично |  | t08-order-notifications |
| triggery-na-sbor-otzyvov | Триггеры на сбор отзывов | нет | нет |  | — |
| promokody-na-povtornuyu-pokupku | Промокоды на повторную покупку через чат | нет | нет |  | — |
| priem-zvonkov | Приём звонков | нет | нет |  | — |
| sinhronizatsiya-s-1s | Синхронизация с 1С | нет | нет |  | — |
| moysklad | МойСклад | нет | нет |  | — |
| bitriks24-retailcrm | Битрикс24, RetailCRM | нет | нет |  | — |
| chaty-i-servisy-obsluzhivaniya | Чаты и сервисы обслуживания | нет | нет |  | — |
| marketing-i-prodvizhenie | Маркетинг и продвижение (UniSender, Roistat и т.п.) | нет | нет |  | — |
| rasshireniya-funktsionala | Расширения функционала (Sber ID и т.п.) | нет | нет |  | — |
| prodazhi-i-bez-ustanovki | Продажи и «без установки» | нет | нет |  | — |
| magazin-prilozheniy-insales | Магазин приложений inSales | не применимо | не применимо |  | — |
| otkrytyy-api-insales | Открытый API inSales | есть | есть |  | — |
| portal-razrabotchikov-liquidhub | Портал разработчиков Liquidhub | не применимо | не применимо |  | — |
| tehpodderzhka-24-7 | Техподдержка 24/7 | не применимо | не применимо |  | — |
| besplatnye-dorabotki-do-15-minut | Бесплатные доработки до 15 минут | не применимо | не применимо |  | — |
| dokumentatsiya | Документация | не применимо | не применимо |  | — |
| faq | FAQ | не применимо | не применимо |  | — |
| universitet-insales-keysy | Университет inSales, кейсы | не применимо | не применимо |  | — |
| pereezd-na-insales | Переезд на inSales | не применимо | не применимо |  | — |
| magazin-pod-klyuch-uslugi-razrabotki | Магазин «под ключ», услуги разработки | не применимо | не применимо |  | — |
| referalnaya-i-partnerskaya-programmy | Реферальная и партнёрская программы | не применимо | не применимо |  | — |
| sobstvennyy-domen | Собственный домен | есть | частично | Четыре хоста зарегистрированы на тенанте, но DNS смотрит на заглушки регистратора: `cherkashino.ru` → A 31.31.197.78, `черкашино.рф` (`xn--80ajkgrgj8cn.xn--p1ai`) → A 95.163.244.138, HTTPS обоих не отвечает (код 000). Магазин открывается только на `cherkashino.shipshift.dev`. | x02-domains |
| besplatnyy-poddomen | Бесплатный поддомен | есть | есть |  | — |
| ssl-sertifikat | SSL-сертификат | есть | есть |  | — |
| domennaya-pochta | Доменная почта | нет | нет |  | — |
| neogranichennyy-trafik-i-hranilische | Неограниченный трафик и хранилище | частично | частично |  | — |
| monitoring-24-7-i-avtoobnovleniya | Мониторинг 24/7 и автообновления | нет | нет |  | — |
| uptime-99-9-zaschita-ot-atak | Uptime 99,9%, защита от атак | нет | нет |  | — |
| avtomaticheskoe-rezervnoe-kopirovanie | Автоматическое резервное копирование | нет | нет |  | — |
| dokumentatsiya-nastroyki-domena | Документация «Настройки домена» | не применимо | не применимо |  | — |
| proizvolnye-stranitsy-magazina | Произвольные страницы магазина | частично | есть | Ключ страницы стал свободным slug (`PAGE_SLUG_PATTERN`), панель: «Пять готовых разделов и любые свои страницы» (`shots/p01-pages-1280x900.png`). У Оксаны 5 страниц; `delivery`, `faq`, `returns` не заведены — эти адреса отдают 404. | t05-page-keys |
| yur-dokumenty-platformy | Юр. документы платформы | не применимо | не применимо |  | — |
| komplaens-i-kiberbezopasnost | Комплаенс и кибербезопасность | не применимо | не применимо |  | — |
| multiyazychnost | Мультиязычность | частично | есть | Живой экран «Язык и валюта»: языки магазина «Русский (ru)» и «English (en)», язык по умолчанию русский (`shots/p03-settings-locale-1280x900.png`). | t06-locale-currency |
| nalogi-i-valyuty | Налоги и валюты | частично | частично | Валюта настраивается владельцем на том же экране; налоги — только строка «Налоги 0,00 ₽» в корзине и на странице заказа, настройки нет. | t06-locale-currency |
| sotrudniki-i-prava-dostupa | Сотрудники и права доступа | нет | нет |  | — |
| limit-polzovateley | Лимит пользователей | не применимо | не применимо |  | — |
| kartochka-magazina | Карточка магазина (контакты, владелец, учёт) | нет | нет |  | — |