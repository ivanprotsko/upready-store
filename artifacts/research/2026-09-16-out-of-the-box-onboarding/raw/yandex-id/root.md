# Source: https://yandex.ru/dev/id/
# Fetched: 2026-09-16T04:04:21.219Z
# Topic: out-of-the-box-onboarding
# HTTP: 200

## Сигналы (маркеры функциональности в разметке)
reviews, blog, installments, video, account, cookie-consent, breadcrumbs, popup, contacts-map, social-share, multi-currency, multi-language, seo-structured, analytics, product-badges, lookbook

## Внутренние ссылки (20)
- (без текста) → https://yandex.ru/dev/id/
- О сервисе → https://yandex.ru/dev/id/ru/
- Важные советы → https://yandex.ru/dev/id/ru/tips
- Верификация сервиса → https://yandex.ru/dev/id/ru/confirm-account
- Требования к Программам → https://yandex.ru/dev/id/ru/requirements
- Подключение к API Яндекс ID → https://yandex.ru/dev/id/ru/how-to
- Этап 1. Регистрация приложения → https://yandex.ru/dev/id/ru/register-client
- Этап 2. Получение OAuth-токена → https://yandex.ru/dev/id/ru/access
- Веб-платформы — мгновенная авторизация → https://yandex.ru/dev/id/ru/suggest-description
- Подключение → https://yandex.ru/dev/id/ru/suggest-connection
- Конструктор кнопок → https://yandex.ru/dev/id/ru/suggest/but-const
- Мобильные приложения — LoginSDK → https://yandex.ru/dev/id/ru/mobileauthsdk/about
- iOS (версия SDK 3.0.0) → https://yandex.ru/dev/id/ru/mobileauthsdk/ios/sdk-ios-main
- Альтернативный способ с кодом подтверждения → https://yandex.ru/dev/id/ru/codes/code-and-token
- Этап 3. Получение информации о пользователе → https://yandex.ru/dev/id/ru/user-information
- Токены → https://yandex.ru/dev/id/ru/concepts/ya-oauth-intro
- Глоссарий → https://yandex.ru/dev/id/ru/concepts/glossary
- Обратная связь → https://yandex.ru/dev/id/ru/feedback
- Яндекс ID → https://yandex.ru/support/id/index.html
- Условия использования сервиса → https://yandex.ru/legal/authid_api/

## Текст страницы
О сервисе | OAuth для Яндекс ID
[О сервисе](https://yandex.ru/dev/id/ru/)
[Важные советы](https://yandex.ru/dev/id/ru/tips)
[Верификация сервиса](https://yandex.ru/dev/id/ru/confirm-account)
[Требования к Программам](https://yandex.ru/dev/id/ru/requirements)
[Подключение к API Яндекс ID](https://yandex.ru/dev/id/ru/how-to)
[Этап 1. Регистрация приложения](https://yandex.ru/dev/id/ru/register-client)
[Этап 2. Получение OAuth-токена](https://yandex.ru/dev/id/ru/access)
[Веб-платформы — мгновенная авторизация](https://yandex.ru/dev/id/ru/suggest-description)
[Подключение](https://yandex.ru/dev/id/ru/suggest-connection)
[Конструктор кнопок](https://yandex.ru/dev/id/ru/suggest/but-const)
[Мобильные приложения — LoginSDK](https://yandex.ru/dev/id/ru/mobileauthsdk/about)
[iOS (версия SDK 3.0.0)](https://yandex.ru/dev/id/ru/mobileauthsdk/ios/sdk-ios-main)
Android (версия SDK 3.1.3)
Архив
[Альтернативный способ с кодом подтверждения](https://yandex.ru/dev/id/ru/codes/code-and-token)
[Этап 3. Получение информации о пользователе](https://yandex.ru/dev/id/ru/user-information)
[Токены](https://yandex.ru/dev/id/ru/concepts/ya-oauth-intro)
[Глоссарий](https://yandex.ru/dev/id/ru/concepts/glossary)
[Обратная связь](https://yandex.ru/dev/id/ru/feedback)
О сервисе
В этой статье :
[Как это работает](https://yandex.ru/dev/id/ru/#how-it-works)
[Полезные ссылки](https://yandex.ru/dev/id/ru/#useful-links)
О сервисе
[Как это работает](https://yandex.ru/dev/id/ru/#how-it-works)
[Полезные ссылки](https://yandex.ru/dev/id/ru/#useful-links)
[Яндекс ID](https://yandex.ru/support/id/index.html) — это единый аккаунт на Яндексе. API Яндекс ID позволяет настроить авторизацию пользователя при помощи [протокола OAuth 2.0](https://yandex.ru/dev/id/ru/concepts/ya-oauth-intro) на вашем сайте или в мобильном приложении.
API Яндекс ID поможет упростить взаимодействие с вашим сайтом:
Посетители смогут авторизоваться с помощью аккаунта на Яндексе. Им не придется заводить новую учетную запись и заполнять дополнительные формы.
Разработчики получат возможность идентифицировать такого пользователя и использовать информацию из его аккаунта на Яндексе, чтобы персонализировать контент и интерфейс приложения. Доступ каждого приложения ограничивается правами, которые разработчик задал при его [регистрации](https://yandex.ru/dev/id/ru/register-client) .
Вход можно реализовать при помощи [технологии мгновенной авторизации](https://yandex.ru/dev/id/ru/suggest-description) для сайта или [библиотеки LoginSDK](https://yandex.ru/dev/id/ru/mobileauthsdk/about) для мобильных устройств.
О базовых принципах OAuth и об особенностях работы протокола в Яндексе читайте в разделе [Реализация OAuth в Яндексе](https://yandex.ru/dev/id/ru/concepts/ya-oauth-intro) .
Совет
Чтобы сделать ваш сервис более надежным в глазах пользователей, [подтвердите свой аккаунт на Госуслугах](https://yandex.ru/dev/id/ru/confirm-account) .
Как это работает
При авторизации в вашем приложении пользователь выбирает вход при помощи аккаунта на Яндексе.
Как выглядит
Приложение, [которое подключено к API Яндекс ID](https://yandex.ru/dev/id/ru/how-to) , перенаправляет пользователя в Яндекс OAuth и запрашивает доступ к данным его аккаунта на Яндексе. Пользователь подтверждает вход с аккаунтом на Яндексе и разрешает доступ к своим данным.
Как выглядит
Приложение [получает OAuth-токен](https://yandex.ru/dev/id/ru/access) с правами доступа к API Яндекс ID. API Яндекс ID позволяет запросить данные пользователя:
Логин, имя и фамилия, пол;
Портрет пользователя;
Адрес электронной почты;
Номер телефона;
Дата рождения.
Приложение отправляет запрос к API Яндекс ID, указывая полученный OAuth-токен, и получает [уникальный идентификатор пользователя и его данные](https://yandex.ru/dev/id/ru/user-information) .
Приложение авторизует пользователя, используя настройки и контент, привязанные к полученному идентификатору. Таким образом пользователь Яндекса получает аккаунт в вашем приложении, не заводя новую учетную запись.
Полезные ссылки
[Реализация OAuth в Яндексе](https://yandex.ru/dev/id/ru/concepts/ya-oauth-intro)
[Подключение к API Яндекс ID](https://yandex.ru/dev/id/ru/how-to)
[LoginSDK для мобильных приложений](https://yandex.ru/dev/id/ru/mobileauthsdk/about)
[Условия использования сервиса](https://yandex.ru/legal/authid_api/)
Была ли статья полезна?
Да Нет
Следующая
[Важные советы](https://yandex.ru/dev/id/ru/tips)
