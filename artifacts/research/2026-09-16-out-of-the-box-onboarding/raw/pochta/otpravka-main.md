# Source: https://otpravka.pochta.ru/static/views/specification/main.html
# Fetched: 2026-09-16T04:19:38.427Z
# Topic: out-of-the-box-onboarding
# HTTP: 200

## Сигналы (маркеры функциональности в разметке)
contacts-map

## Внутренние ссылки (1)
- токеном авторизации приложения → https://otpravka.pochta.ru/static/views/specification/main.html

## Текст страницы
Основная информация
API Онлайн-сервиса «Отправка»
является самым прямым способом взаимодействия сторонних приложений с Онлайн-сервисом «Отправка»
посредством REST запросов .
Запросы и ответы сервиса используют JSON текстовый формат.
Подключение ваших приложений к API Онлайн-сервису «Отправка» позволит интегрировать в ваши бизнес-процессы:
подготовку печатных ярлыков для отправлений;
подготовку печатных документов с расчетом стоимости;
подготовку электронных документов с автоматической отсылкой в почтовое отделение;
подключение дополнительных сервисов для нормализации адресов, телефонов, наименований (фамилия, имя, отчество) получателей.
Внимание! Не сохраняйте и не храните ваш пароль к API в текстовых файлах, так как это может привести к его хищению и/или компрометации.
Не оставляйте записанные на бумаге и т.п. носителях информации токен авторизации, ключ авторизации, логин и пароль к API, не передавайте эти данные третьим лицам!
Необходимые условия
Для интеграции с API Онлайн-сервиса «Отправка» необходимо располагать:
[токеном авторизации приложения](https://otpravka.pochta.ru/static/views/specification/main.html#/authorization-token) ;
[ключом авторизации пользователя](https://otpravka.pochta.ru/static/views/specification/main.html#/authorization-key) .
Особенности доступа к API Онлайн-сервиса «Отправка»
При работе с API Онлайн-сервиса «Отправка» используйте HTTPS соединение!
Это позволит обмениваться данными по защищенному соединению.
Проверяйте ссылки на сервис: ссылка должна начинаться с " https ://".
С чего начать
[Проверка и нормализация адреса с помощью SoapUI](https://otpravka.pochta.ru/static/views/specification/main.html#/usecases-soapui-clean_address)
[Создание заказов с помощью расширения Chrome браузера](https://otpravka.pochta.ru/static/views/specification/main.html#/usecases-chrome-backlog)
Ссылки
[Что такое API ?](https://ru.wikipedia.org/wiki/API)
[Что такое REST ?](https://ru.wikipedia.org/wiki/REST)
[Что такое JSON ?](https://ru.wikipedia.org/wiki/JSON)
[Что такое HTTPS ?](https://ru.wikipedia.org/wiki/HTTPS)
[SoapUI - Бесплатная утилита для тестирования REST запросов](https://www.soapui.org/downloads/soapui.html)
[Расширение Chrome браузера для тестирования REST запросов](https://chrome.google.com/webstore/detail/advanced-rest-client/hgmloofddffdnphfgcellkdfbfbjeloo?hl=en-US)
[Расширение Firefox для тестирования REST запросов](https://addons.mozilla.org/ru/firefox/addon/restclient/)
