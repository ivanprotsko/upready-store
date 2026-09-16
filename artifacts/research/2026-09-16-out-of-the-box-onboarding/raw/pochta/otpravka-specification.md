# Source: https://otpravka.pochta.ru/specification
# Fetched: 2026-09-16T04:07:41.732Z
# Topic: out-of-the-box-onboarding
# HTTP: 200

## Сигналы (маркеры функциональности в разметке)
account, specs-table, contacts-map, multi-currency, kit-bundle, product-badges

## Внутренние ссылки (1)
- ГЛАВНАЯ СТРАНИЦА → https://otpravka.pochta.ru/specification

## Текст страницы
Почта России - Спецификация
[ГЛАВНАЯ СТРАНИЦА](https://otpravka.pochta.ru/specification#/main)
[ОСНОВНЫЕ ШАГИ](https://otpravka.pochta.ru/specification#/flow)
АВТОРИЗАЦИЯ
[Токен авторизации приложения](https://otpravka.pochta.ru/specification#/authorization-token)
[Ключ авторизации пользователя](https://otpravka.pochta.ru/specification#/authorization-key)
ТЕСТИРОВАНИЕ API
[Проверка и нормализация адреса с помощью SoapUI](https://otpravka.pochta.ru/specification#/usecases-soapui-clean_address)
[Создание отправлений с помощью расширения Chrome браузера](https://otpravka.pochta.ru/specification#/usecases-chrome-backlog)
ЗАКАЗЫ
[Создание заказа](https://otpravka.pochta.ru/specification#/orders-creating_order)
[Создание заказа (версия №2)](https://otpravka.pochta.ru/specification#/orders-creating_order_v2)
[Поиск заказа](https://otpravka.pochta.ru/specification#/orders-search_order)
[Поиск заказа по идентификатору](https://otpravka.pochta.ru/specification#/orders-search_order_byid)
[Редактирование заказа](https://otpravka.pochta.ru/specification#/orders-editing_order)
[Удаление заказа](https://otpravka.pochta.ru/specification#/orders-delete_new_order)
[Возврат заказов в "Новые"](https://otpravka.pochta.ru/specification#/orders-shipment_to_backlog)
[Поиск заказов по идентификатору группы](https://otpravka.pochta.ru/specification#/orders-search_orders_by_group_name)
ПАРТИИ
[Создание партии из N заказов](https://otpravka.pochta.ru/specification#/batches-create_batch_from_N_orders)
[Изменение дня отправки в почтовое отделение](https://otpravka.pochta.ru/specification#/batches-sending_date)
[Перенос заказов в партию](https://otpravka.pochta.ru/specification#/batches-move_orders_to_batch)
[Поиск партии по наименованию](https://otpravka.pochta.ru/specification#/batches-find_batch)
[Поиск заказов с ШПИ](https://otpravka.pochta.ru/specification#/batches-find_orders_with_barcode)
[Добавление заказов в партию](https://otpravka.pochta.ru/specification#/batches-add_orders_to_batch)
[Удаление заказов из партии](https://otpravka.pochta.ru/specification#/batches-delete_order_from_batch)
[Запрос данных о заказах в партии](https://otpravka.pochta.ru/specification#/batches-get_info_about_orders_in_batch)
[Поиск всех партий](https://otpravka.pochta.ru/specification#/batches-search_all_batches)
[Поиск заказа в партии по id](https://otpravka.pochta.ru/specification#/batches-find_order_by_id)
[Поиск заказов по идентификатору группы](https://otpravka.pochta.ru/specification#/batches-find_orders_by_group_name)
ДОКУМЕНТЫ
[Генерация пакета документации](https://otpravka.pochta.ru/specification#/documents-create_all_docs)
[Генерация печатной формы Ф7п](https://otpravka.pochta.ru/specification#/documents-create_f7_f22)
[Генерация печатной формы Ф112ЭК](https://otpravka.pochta.ru/specification#/documents-create_f112)
[Генерация печатных форм для заказа (до формирования партии)](https://otpravka.pochta.ru/specification#/documents-create_forms_backlog)
[Генерация печатных форм для заказа](https://otpravka.pochta.ru/specification#/documents-create_forms)
[Генерация печатной формы Ф103](https://otpravka.pochta.ru/specification#/documents-create_f103)
[Подготовка и отправка электронной формы Ф103](https://otpravka.pochta.ru/specification#/documents-checkin)
[Генерация акта осмотра содержимого](https://otpravka.pochta.ru/specification#/documents-create_comp_check_form)
[Генерация возвратного ярлыка на одной печатной странице](https://otpravka.pochta.ru/specification#/documents-easy_return_pdf)
АРХИВ
[Запрос данных о партиях в архиве](https://otpravka.pochta.ru/specification#/archive-search_batches)
[Перевод партии в архив](https://otpravka.pochta.ru/specification#/archive-batch_to_archive)
[Возврат партии из архива](https://otpravka.pochta.ru/specification#/archive-revert_batch)
ПОИСК ОПС
[По индексу](https://otpravka.pochta.ru/specification#/services-postoffice)
[По адресу](https://otpravka.pochta.ru/specification#/services-postoffice-by-address)
[Почтовые сервисы ОПС](https://otpravka.pochta.ru/specification#/services-postoffice-service)
[Почтовые сервисы ОПС по идентификатору группы сервисов](https://otpravka.pochta.ru/specification#/services-postoffice-service-group)
[По координатам](https://otpravka.pochta.ru/specification#/services-postoffice-nearby)
[Поиск индексов в населенном пункте](https://otpravka.pochta.ru/specification#/services-postoffice-settlement.offices.codes)
[Выгрузка из паспорта ОПС](https://otpravka.pochta.ru/specification#/postoffice_passport-unload_passport)
ВРЕМЕННЫЕ ИНТЕРВАЛЫ
[Получение списка свободных таймслотов](https://otpravka.pochta.ru/specification#/tss-timeslots_by_postindex)
[Оформление бронирования](https://otpravka.pochta.ru/specification#/tss-booking_by_postindex)
[Формирование заказа](https://otpravka.pochta.ru/specification#/tss-booking_by_postindex_uuid)
[Получение списка свободных таймслотов при перебронировании](https://otpravka.pochta.ru/specification#/tss-timeslots_for_rebooking)
[Оформление перебронирования](https://otpravka.pochta.ru/specification#/tss-rebooking_by_postindex)
[Отмена заказа](https://otpravka.pochta.ru/specification#/tss-delete_booking_by_postindex)
ДОЛГОСРОЧНОЕ
ХРАНЕНИЕ
[Запрос данных о заказах в архиве](https://otpravka.pochta.ru/specification#/long-term-archive-search_shipments)
ВОЗВРАТЫ
[Создание возвратного отправления для ранее созданного отправления](https://otpravka.pochta.ru/specification#/returns-create_for_direct)
[Создание отдельного возвратного отправления](https://otpravka.pochta.ru/specification#/returns-create_without_direct)
[Удаление отдельного возвратного отправления](https://otpravka.pochta.ru/specification#/returns-delete_separate_return)
[Редактирование отдельного возвратного отправления](https://otpravka.pochta.ru/specification#/returns-update_separate_return)
НАСТРОЙКИ
[Текущие точки сдачи](https://otpravka.pochta.ru/specification#/settings-shipping_points)
[Текущие настройки пользователя](https://otpravka.pochta.ru/specification#/settings-user_settings)
ДАННЫЕ
[Нормализация адреса](https://otpravka.pochta.ru/specification#/nogroup-normalization_adress)
[Нормализация ФИО](https://otpravka.pochta.ru/specification#/nogroup-normalization_fio)
[Нормализация телефона](https://otpravka.pochta.ru/specification#/nogroup-normalization_phone)
[Расчет стоимости пересылки](https://otpravka.pochta.ru/specification#/nogroup-rate_calculate)
[Текущее количество запросов по API](https://otpravka.pochta.ru/specification#/nogroup-count_request_api)
ЗАЯВЛЕНИЯ
[Оформление заявления на дополнительную услугу](https://otpravka.pochta.ru/specification#/claims-creating_claim)
ОПИСАНИЕ СВОЙСТВ
Основные
[Тип адреса](https://otpravka.pochta.ru/specification#/enums-base-address-type)
[Категория партии](https://otpravka.pochta.ru/specification#/enums-base-batch-category)
[Категория РПО](https://otpravka.pochta.ru/specification#/enums-base-mail-category)
[Вид РПО](https://otpravka.pochta.ru/specification#/enums-base-mail-type)
[Продукты](https://otpravka.pochta.ru/specification#/enums-product)
[Статусы партии](https://otpravka.pochta.ru/specification#/enums-base-batch-status)
[Коды отметок внутренних и международных отправлений](https://otpravka.pochta.ru/specification#/enums-base-postmarks)
[Способы оплаты](https://otpravka.pochta.ru/specification#/enums-payment-methods)
[Вид транспортировки](https://otpravka.pochta.ru/specification#/enums-base-transport-type)
[Категория уведомления о вручении РПО](https://otpravka.pochta.ru/specification#/enums-base-notify-category)
[Код качества нормализации адреса](https://otpravka.pochta.ru/specification#/enums-clean-address-quality)
[Код проверки нормализации адреса](https://otpravka.pochta.ru/specification#/enums-clean-address-validation)
[Код качества нормализации ФИО](https://otpravka.pochta.ru/specification#/enums-clean-fio-quality)
[Код качества нормализации телефона](https://otpravka.pochta.ru/specification#/enums-clean-fio-phone-quality)
[Тип операции из трекинга](https://otpravka.pochta.ru/specification#/enums-base-last-oper-type)
[Атрибут операции из трекинга](https://otpravka.pochta.ru/specification#/enums-base-last-oper-attr)
[Тип конверта](https://otpravka.pochta.ru/specification#/enums-base-envelope-type)
[Разряд письма](https://otpravka.pochta.ru/specification#/enums-base-mail-rank)
[Тип печати](https://otpravka.pochta.ru/specification#/enums-base-print-type)
[Категория вложения](https://otpravka.pochta.ru/specification#/enums-base-entries-type)
[Список стран](https://otpravka.pochta.ru/specification#/dictionary-countries)
[Список валют](https://otpravka.pochta.ru/specification#/dictionary-currencies)
[Статусы заявки на вызов курьера](https://otpravka.pochta.ru/specification#/enums-courier-order-statuses)
[Статусы отправления по гиперлокальной доставке](https://otpravka.pochta.ru/specification#/enums-hyper-local-status)
[Статусы партии по гиперлокальной заявки](https://otpravka.pochta.ru/specification#/enums-batch-hyper-local-status)
[Коды видов сервиса](https://otpravka.pochta.ru/specification#/enums-ecom-services)
[Тип пункта выдачи](https://otpravka.pochta.ru/specification#/enums-delivery-point-type)
[Типоразмер](https://otpravka.pochta.ru/specification#/enums-dimension-type)
[Ошибки](https://otpravka.pochta.ru/specification#/enums-errors)
[Состояния](https://otpravka.pochta.ru/specification#/enums-statuses)
