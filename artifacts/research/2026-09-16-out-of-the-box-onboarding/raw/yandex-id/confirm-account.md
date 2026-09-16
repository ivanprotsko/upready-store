# Source: https://yandex.ru/dev/id/doc/ru/confirm-account
# Fetched: 2026-09-16T04:10:09.571Z
# Topic: out-of-the-box-onboarding
# HTTP: 200

## Сигналы (маркеры функциональности в разметке)
reviews, blog, installments, video, account, cookie-consent, breadcrumbs, popup, faq-accordion, social-share, multi-currency, multi-language, seo-structured, analytics, product-badges

## Внутренние ссылки (20)
- (без текста) → https://yandex.ru/dev/id/doc/ru/
- (без текста) → https://yandex.ru/dev/id/doc/ru/confirm-account
- О сервисе → https://yandex.ru/dev/id/doc/ru/ru/
- Важные советы → https://yandex.ru/dev/id/doc/ru/ru/tips
- Верификация сервиса → https://yandex.ru/dev/id/doc/ru/ru/confirm-account
- Требования к Программам → https://yandex.ru/dev/id/doc/ru/ru/requirements
- Подключение к API Яндекс ID → https://yandex.ru/dev/id/doc/ru/ru/how-to
- Этап 1. Регистрация приложения → https://yandex.ru/dev/id/doc/ru/ru/register-client
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
- Добавьте организацию → https://yandex.ru/support/id/ru/organizations

## Текст страницы
Верификация сервиса | OAuth для Яндекс ID
[О сервисе](https://yandex.ru/dev/id/doc/ru/ru/)
[Важные советы](https://yandex.ru/dev/id/doc/ru/ru/tips)
[Верификация сервиса](https://yandex.ru/dev/id/doc/ru/ru/confirm-account)
[Требования к Программам](https://yandex.ru/dev/id/doc/ru/ru/requirements)
[Подключение к API Яндекс ID](https://yandex.ru/dev/id/doc/ru/ru/how-to)
[Этап 1. Регистрация приложения](https://yandex.ru/dev/id/doc/ru/ru/register-client)
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
Верификация сервиса
В этой статье :
[Преимущества верификации](https://yandex.ru/dev/id/doc/ru/ru/confirm-account#pros)
[Способы верификации](https://yandex.ru/dev/id/doc/ru/ru/confirm-account#how-to)
[Физическое лицо](https://yandex.ru/dev/id/doc/ru/ru/confirm-account#verify-person)
[Организация](https://yandex.ru/dev/id/doc/ru/ru/confirm-account#verify-org)
[Частые вопросы](https://yandex.ru/dev/id/doc/ru/ru/confirm-account#faq)
Верификация сервиса
[Преимущества верификации](https://yandex.ru/dev/id/doc/ru/ru/confirm-account#pros)
[Способы верификации](https://yandex.ru/dev/id/doc/ru/ru/confirm-account#how-to)
[Физическое лицо](https://yandex.ru/dev/id/doc/ru/ru/confirm-account#verify-person)
[Организация](https://yandex.ru/dev/id/doc/ru/ru/confirm-account#verify-org)
[Частые вопросы](https://yandex.ru/dev/id/doc/ru/ru/confirm-account#faq)
Чтобы настроить интеграцию с [Яндекс OAuth](https://oauth.yandex.ru/) , подтвердите личность через Госуслуги. Это действие верифицирует сервис и подтверждает, что аккаунт Яндекс ID принадлежит его законному владельцу.
Если аккаунт не подтвержден, пользователи увидят уведомление перед тем, как разрешить доступ сервису к их данным. Это первый шаг [сценария авторизации](https://yandex.ru/dev/id/doc/ru/ru/concepts/ya-oauth-intro#authorization-scheme) :
Преимущества верификации
Верифицированный аккаунт повышает доверие пользователей к вашему сервису. Кроме того, подтверждение аккаунта Яндекс ID открывает доступ к дополнительным возможностям:
[Техническая поддержка Яндекс OAuth](https://yandex.ru/dev/id/doc/ru/ru/feedback) для разработчиков.
[Регистрация](https://yandex.ru/dev/id/doc/ru/ru/register-client) более 5 приложений.
Доступ к дополнительной информации о пользователе.
Примечание
Если сервис не верифицирован, поддержка все равно доступна в отдельных случаях. Например, если нужно подтвердить данные без гражданства РФ. В остальных ситуациях поддержка может отказать в оказании услуг.
Способы верификации
Выберите способ подтверждения в зависимости от владельца сервиса:
Физическое лицо . Сервис создается в личных целях.
Организация . Сервис принадлежит компании.
Физическое лицо
Чтобы подтвердить данные личного аккаунта:
Войдите в сервис [Яндекс OAuth](https://oauth.yandex.ru/) под аккаунтом Яндекса, от имени которого создается сервис.
На главной странице нажмите Снять ограничения. Подтвердить аккаунт через Госуслуги .
Нажмите Продолжить через Госуслуги и следуйте инструкциям на сайте Госуслуг.
После завершения проверки вы увидите сообщение об успешной верификации.
Как подтвердить данные, если нет гражданства РФ?
Обратитесь в [техническую поддержку](https://yandex.ru/dev/id/doc/ru/ru/feedback) и укажите в обращении, что у вас нет гражданства РФ.
Организация
Создайте приложение в режиме подтвержденной организации. Для этого:
[Добавьте организацию](https://yandex.ru/support/id/ru/organizations#create) в [Яндекс ID для бизнеса](https://id.yandex.ru/org) .
В разделе Данные нажмите Подтвердить все реквизиты .
Войдите в профиль Госуслуг от имени генерального директора или другого единоличного исполнительного органа организации.
Перейдите в раздел [Яндекс ID для сайта](https://oauth.yandex.ru/) и нажмите Создать .
Частые вопросы
Как подтвердить организацию, если у нее уже есть аккаунт в Яндекс ID?
Верификация возможна только после подтверждения реквизитов организации через Госуслуги.
Вам нужно создать приложение в режиме организации. Реквизиты этой организации должен подтвердить ее владелец (генеральный директор или иной единоличный исполнительный орган) через свой профиль Госуслуг.
Подтвердить другим способом не получится.
Была ли статья полезна?
Да Нет
Предыдущая
[Важные советы](https://yandex.ru/dev/id/doc/ru/ru/tips)
Следующая
[Требования к Программам](https://yandex.ru/dev/id/doc/ru/ru/requirements)
