# Source: https://yandex.ru/dev/id/doc/ru/register-client
# Fetched: 2026-09-16T04:07:53.504Z
# Topic: out-of-the-box-onboarding
# HTTP: 200

## Сигналы (маркеры функциональности в разметке)
reviews, installments, video, account, cookie-consent, breadcrumbs, popup, social-share, multi-currency, multi-language, seo-structured, analytics, product-badges, lookbook

## Внутренние ссылки (22)
- (без текста) → https://yandex.ru/dev/id/doc/ru/
- (без текста) → https://yandex.ru/dev/id/doc/ru/register-client
- О сервисе → https://yandex.ru/dev/id/doc/ru/ru/
- Важные советы → https://yandex.ru/dev/id/doc/ru/ru/tips
- Верификация сервиса → https://yandex.ru/dev/id/doc/ru/ru/confirm-account
- Требования к Программам → https://yandex.ru/dev/id/doc/ru/ru/requirements
- Подключение к API Яндекс ID → https://yandex.ru/dev/id/doc/ru/ru/how-to
- Этап 1. Регистрация приложения → https://yandex.ru/dev/id/doc/ru/ru/register-client
- Приложение для авторизации → https://yandex.ru/dev/id/doc/ru/ru/register-auth
- Приложение для доступа к API → https://yandex.ru/dev/id/doc/ru/ru/register-api
- Этап 2. Получение OAuth-токена → https://yandex.ru/dev/id/doc/ru/ru/access
- Веб-платформы — мгновенная авторизация → https://yandex.ru/dev/id/doc/ru/ru/suggest-description
- Подключение → https://yandex.ru/dev/id/doc/ru/ru/suggest-connection
- Конструктор кнопок → https://yandex.ru/dev/id/doc/ru/ru/suggest/but-const
- Мобильные приложения — LoginSDK → https://yandex.ru/dev/id/doc/ru/ru/mobileauthsdk/about
- iOS (версия SDK 3.0.0) → https://yandex.ru/dev/id/doc/ru/ru/mobileauthsdk/ios/sdk-ios-main
- Альтернативный способ с кодом подтверждения → https://yandex.ru/dev/id/doc/ru/ru/codes/code-and-token
- Этап 3. Получение информации о пользователе → https://yandex.ru/dev/id/doc/ru/ru/user-information
- Токены → https://yandex.ru/dev/id/doc/ru/ru/concepts/ya-oauth-intro
- Глоссарий → https://yandex.ru/dev/id/doc/ru/ru/concepts/glossary
- Обратная связь → https://yandex.ru/dev/id/doc/ru/ru/feedback
- Яндекс ID → https://yandex.ru/support/id/ru/

## Текст страницы
Регистрация приложения | OAuth для Яндекс ID
[О сервисе](https://yandex.ru/dev/id/doc/ru/ru/)
[Важные советы](https://yandex.ru/dev/id/doc/ru/ru/tips)
[Верификация сервиса](https://yandex.ru/dev/id/doc/ru/ru/confirm-account)
[Требования к Программам](https://yandex.ru/dev/id/doc/ru/ru/requirements)
[Подключение к API Яндекс ID](https://yandex.ru/dev/id/doc/ru/ru/how-to)
[Этап 1. Регистрация приложения](https://yandex.ru/dev/id/doc/ru/ru/register-client)
[Приложение для авторизации](https://yandex.ru/dev/id/doc/ru/ru/register-auth)
[Приложение для доступа к API](https://yandex.ru/dev/id/doc/ru/ru/register-api)
[Этап 2. Получение OAuth-токена](https://yandex.ru/dev/id/doc/ru/ru/access)
[Веб-платформы — мгновенная авторизация](https://yandex.ru/dev/id/doc/ru/ru/suggest-description)
[Подключение](https://yandex.ru/dev/id/doc/ru/ru/suggest-connection)
[Конструктор кнопок](https://yandex.ru/dev/id/doc/ru/ru/suggest/but-const)
[Мобильные приложения — LoginSDK](https://yandex.ru/dev/id/doc/ru/ru/mobileauthsdk/about)
[iOS (версия SDK 3.0.0)](https://yandex.ru/dev/id/doc/ru/ru/mobileauthsdk/ios/sdk-ios-main)
Android (версия SDK 3.1.3)
Архив
[Альтернативный способ с кодом подтверждения](https://yandex.ru/dev/id/doc/ru/ru/codes/code-and-token)
[Этап 3. Получение информации о пользователе](https://yandex.ru/dev/id/doc/ru/ru/user-information)
[Токены](https://yandex.ru/dev/id/doc/ru/ru/concepts/ya-oauth-intro)
[Глоссарий](https://yandex.ru/dev/id/doc/ru/ru/concepts/glossary)
[Обратная связь](https://yandex.ru/dev/id/doc/ru/ru/feedback)
Регистрация приложения
[Подключение к API Яндекс ID](https://yandex.ru/dev/id/doc/ru/ru/how-to)
Этап 1. Регистрация приложения
Регистрация приложения
Чтобы получать OAuth-токены для работы с данными пользователей Яндекса, разработчик должен зарегистрировать приложение в сервисе [Яндекс OAuth](https://oauth.yandex.ru/) . После регистрации приложение будет доступно для редактирования в личном кабинете Яндекс OAuth.
Примечание
После получения доступа к данным пользователя приложение отобразится в его [Яндекс ID](https://yandex.ru/support/id/ru/) в [списке приложений](https://id.yandex.ru/personal/data-access) , которые имеют доступ к его аккаунту.
Указывайте полные данные о вашем приложении, чтобы пользователь знал, кому он дает разрешение на использование данных.
Срок жизни токена зависит от разрешений, которые вы запрашиваете. Если вы добавите новые разрешения, срок жизни токена может сократиться.
Пользователь всегда может посмотреть разрешения, которые выданы на его аккаунт, и отозвать их. В таком случае токен, который выдан на этот аккаунт, станет недействительным.
Типы приложений
Приложения в [Яндекс OAuth](https://oauth.yandex.ru/) делятся на два типа:
[Для авторизации пользователей](https://yandex.ru/dev/id/doc/ru/ru/register-auth) на стороннем сервисе. Такие приложения передают данные пользователя.
Приложения для авторизации могут получить не более 3 групп разрешений от API сервисов Яндекса. Название группы разрешений указывается перед : в названии доступа. Например, доступ login:info относится к группе login .
О регистрации приложения для авторизации читайте в [разделе](https://yandex.ru/dev/id/doc/ru/ru/register-auth) .
[Для доступа к API](https://yandex.ru/dev/id/doc/ru/ru/register-api) . Такие приложения не предназначены для пользователя. Они работают только с данными разработчика и используются для получения токенов и доступов к API сервисов Яндекса.
Приложения для доступа к API не могут получить разрешения из группы login , но не имеют ограничения по числу доступов.
О регистрации приложения для доступа к API читайте в [разделе](https://yandex.ru/dev/id/doc/ru/ru/register-api) .
Во время регистрации приложения выберите нужный тип приложения во всплывающем окне.
Как выглядит
Важно
Определите тип вашего приложения перед регистрацией. Поменять тип после регистрации невозможно.
Если ваше приложение создано до того, как появилось разделение на типы, то оно продолжит работать в прежнем режиме.
Была ли статья полезна?
Да Нет
Предыдущая
[Подключение к API Яндекс ID](https://yandex.ru/dev/id/doc/ru/ru/how-to)
Следующая
[Приложение для авторизации](https://yandex.ru/dev/id/doc/ru/ru/register-auth)
