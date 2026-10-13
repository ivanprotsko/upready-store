# Дизайн-система панели владельца (tenant panel)

v1.1 — 2026-10-14. Задача t-2026-10-14-03 (прототип G2): E4 — короткое создание той же формой, что правка, идёт в `RouteDrawer`, не в `RouteFocusModal` (сотрудник, правило переадресации, домен).
v1 — 2026-10-14. Задача t-2026-10-14-01, этап 1 программы редизайна панели. Живой документ:
кто меняет правило в коде, меняет его здесь в том же PR и поднимает версию.

## Как читать этот файл агенту

Каждый бриф на экран панели ссылается на этот файл; строитель читает его целиком перед первой
правкой, а приёмщик проверяет сдачу по разделам «Правила» и «Запрещено». Правило, которое
пришлось нарушить, меняется здесь в том же PR, с датой и причиной; правило, которое просто обошли,
— дефект приёмки. Эталон — родная панель Medusa admin (`@medusajs/dashboard` 2.19.0, исходники в
`node_modules/.pnpm/@medusajs+dashboard@2.19.0_*/node_modules/@medusajs/dashboard/src/`, живая на
стенде [localhost:9700/app](http://localhost:9700/app)). Слова Ивана, 14.10.2026, дословно:
«посмотреть как сделан UI родной панели medusa – там все контролы спрятаны, т.е. нельзя сразу со
страницы что-то изменить, для этого нужно провалиться на вложенную страницу. Плюс посмотрите как
там сделаны контролы сохранения и прочие. Всё должно быть в едином стиле, а не в случайном порядке
+ опыт должен накапливаться и каждый агент должен получать актуальную версию дизайн системы, чтобы
не совершать те же ошибки, которые уже были». Термины владельца — только из
[глоссария владельца](../tenant-panel/owner-glossary.md). Аудит, из которого выросли правила —
[ux-audit-2026-10-14](../tenant-panel/ux-audit-2026-10-14.md).

Снимки эталона лежат в папке
[medusa-admin/](/Users/ivanprotsko/upready/evidence/upready-store/t-2026-10-14-01/medusa-admin/)
(1280 px, стенд :9700/app). Пути к исходникам ниже — относительно `src/` пакета dashboard.

## Эталон Medusa admin

| № | Паттерн | Когда | Снимок | Исходник в dashboard | Правило для нашей панели |
|---|---|---|---|---|---|
| E1 | **Список** | Любая сущность, которых больше одной | `01-list-products.png`, `10-settings-list-regions.png` | `routes/regions/region-list/components/region-list-table/region-list-table.tsx`, `components/table/data-table/data-table.tsx` (`_DataTable`) | Список — `Container` с шапкой (заголовок + подзаголовок слева, одна кнопка «Создать» `variant="secondary" size="small"` справа), под ней `_DataTable` с поиском, фильтрами, сортировкой, пагинацией; клик по строке ведёт в карточку (`navigateTo`), «…» в строке — только действия над строкой. |
| E2 | **Карточка с секциями** | Одна сущность или один раздел настроек | `02-detail-product.png`, `11-settings-detail-region.png` | `routes/products/product-detail/product-detail.tsx` (`LayoutComposer`, две колонки), `routes/regions/region-detail/components/region-general-section/region-general-section.tsx` | Карточка — колонка `Container`-секций; у каждой секции шапка `px-6 py-4` (заголовок, справа статус-бейдж и `ActionMenu`), тело — строки `SectionRow` «подпись — значение». На карточке ничего не редактируется: только читается. |
| E3 | **Вложенный маршрут правки** | Любое изменение полей | `05-route-drawer-edit.png`, `08-settings-edit-drawer.png` | `routes/regions/region-edit/region-edit.tsx`, `components/modals/route-drawer/route-drawer.tsx` | Правка живёт на своём адресе (`…/edit`, `…/prices`, `…/media`), открывается из «…» секции и рисуется `RouteDrawer`; после сохранения `handleSuccess()` закрывает drawer и возвращает на карточку, которая перечитывает данные. |
| E4 | **Drawer против FocusModal** | Правка существующего — drawer; создание и длинные формы — модал | `05-route-drawer-edit.png` против `06-route-focus-modal-create.png` | `components/modals/route-drawer/route-drawer.tsx`, `components/modals/route-focus-modal/route-focus-modal.tsx` (комментарий в файле: drawer «typically used for forms editing a resource», focus modal — «forms creating a resource or forms that require a lot of space») | Правка полей одной секции — `RouteDrawer`; создание сущности, многошаговая форма, редактор текста — `RouteFocusModal`. Исключение (v1.1, G2): создание из тех же полей, что и правка, и не длиннее пяти полей (сотрудник, правило переадресации, домен) — тоже `RouteDrawer` на своём адресе `…/create`, чтобы «Новый» и «Изменить» выглядели одинаково. Третьего не дано: ни inline-форм на карточке, ни `Prompt` с полями. |
| E5 | **Подвал формы и сохранение** | Каждая форма | `05-route-drawer-edit.png`, `08-settings-edit-drawer.png` | `routes/regions/region-edit/components/edit-region-form/edit-region-form.tsx` (блок `RouteDrawer.Footer`), `components/utilities/keybound-form/keybound-form.tsx` | Одна пара кнопок внизу формы: «Отмена» (`variant="secondary" size="small"`, это `RouteDrawer.Close`) и «Сохранить» (`type="submit" size="small" isLoading`). Форма — `KeyboundForm` (⌘/Ctrl+Enter отправляет, Enter в текстовом поле не отправляет). Уход с несохранёнными изменениями блокирует `RouteModalForm` (`useBlocker` + `Prompt`). |
| E6 | **Опасное действие** | Удалить, отключить, отозвать | `03-action-menu.png`, `04-delete-prompt.png` | `components/common/action-menu/action-menu.tsx`, `region-general-section.tsx` (`usePrompt` с `verificationText`) | Опасное действие — последняя группа в `ActionMenu` после разделителя, никогда не кнопка рядом с главной. Перед ним `usePrompt`: «Вы уверены?», текст с именем объекта, для необратимого — ввод имени (`verificationText`), кнопки «Отмена» и красная «Удалить». После — `toast.success` и `navigate` на список. |
| E7 | **Статусы** | Везде, где у сущности есть состояние | `02-detail-product.png` (шапка), `12-settings-users.png`, `13-list-orders.png` | `routes/products/product-detail/components/product-general-section/product-general-section.tsx` (`StatusBadge color={productStatusColor(...)}`) | Состояние — `StatusBadge` (точка + слово) в шапке секции и в столбце списка; цвет из одной функции на сущность (green опубликован/включён, grey черновик/выключен, orange ждёт, red ошибка, blue в работе). Слово — из глоссария, не из enum. |
| E8 | **Пустые состояния** | Список без записей; поиск без результата | `15-empty-no-results.png`, `16-empty-no-records.png` | `components/common/empty-table-content/empty-table-content.tsx` (`NoRecords`, `NoResults`) | Два разных экрана: «ничего нет» — иконка, одна фраза, что здесь появится, и одна кнопка «Создать»; «ничего не найдено» — лупа и фраза, без кнопки. Над пустым телом нет ни шапки таблицы, ни пагинации «0 из 0». |
| E9 | **Тосты** | Итог любого сохранения или ошибки | `09-toast-after-save.png` | `edit-region-form.tsx` (`toast.success(t("regions.toast.edit"))`, `toast.error(e.message)`) | Успех — `toast.success` короткой фразой, ошибка — `toast.error` текстом ответа платформы. Тост — единственное подтверждение; на странице не появляется ни зелёной строки, ни «Сохранено» рядом с кнопкой. |
| E10 | **Таблица и фильтры** | Список с > 1 столбцом | `01-list-products.png`, `17-filters-menu.png` | `components/table/data-table/data-table.tsx`, `hooks/table/filters/*`, `hooks/table/query/*` | Таблица — `_DataTable` (или `DataTable` из `components/data-table`): состояние поиска, фильтров, сортировки и страницы живёт в URL (`queryObject`), фильтры — кнопка «Добавить фильтр» и чипы над таблицей. Самодельная `<Table>` из `@medusajs/ui` допустима только для списка до ~20 строк без поиска, и только внутри `TableScroll`. |
| E11 | **Шапка страницы и действия** | Каждая страница | `01-list-products.png`, `07-settings-detail-store.png` | `region-list-table.tsx` (шапка `flex items-center justify-between px-6 py-4`), `routes/store/store-detail/components/store-general-section/store-general-section.tsx` | У страницы нет своего заголовка над карточками: заголовок — в шапке первой секции, там же подзаголовок одной фразой и одна кнопка или `ActionMenu`. Над страницей — только хлебные крошки оболочки. |
| E12 | **Клавиатура и Esc** | Каждый drawer и модал | `05b-after-escape.png` | `route-focus-modal.tsx` (`onEscapeKeyDown`, `closeOnEscape`), `route-modal-provider/route-provider.tsx` | Esc закрывает drawer/модал и возвращает на родительский адрес (`navigate(prev)`), если форма не «грязная» — иначе `Prompt` «Продолжить редактирование / Закрыть». ⌘/Ctrl+Enter — отправка. Внутри модала с тяжёлой правкой `setCloseOnEscape(false)`. |
| E13 | **Раздел «Настройки»** | Каждая настройка магазина | `18-settings-nav.png`, `07-settings-detail-store.png` | `components/layout/settings-layout/settings-layout.tsx`, `routes/store/store-detail/store-detail.tsx` + `store-edit/store-edit.tsx` | Одна настройка — один экран-карточка только для чтения (`SectionRow`-строки) и один вложенный `…/edit` в drawer. Никаких форм прямо на экране настроек. |

## Правила

Нумерация сквозная; у каждого — ошибка, которую оно закрывает, и где она была сделана
(F1–F22 — аудит 21.09; M — мобильный аудит 13.10; A — аудит 14.10; И — слова Ивана 14.10).

1. **Карточка читает, вложенный маршрут правит.** Поля редактируются только в `RouteDrawer`/`RouteFocusModal` на своём адресе; на странице — `SectionRow` и «…». Закрывает: inline-формы на 24 экранах (A1, И), два поля и «Сохранить» в правой колонке карточки товара (`product-sites-section`, A).
2. **Одна форма — одна кнопка «Сохранить», и она в подвале.** Пара «Отмена / Сохранить» внизу drawer/модала; на странице кнопок сохранения нет. Закрывает: три «Сохранить» на `/settings/payments` и два на `/courses/:id` (A2), «Сохранить» в шапке `/home-settings` (F1 — обрезалась на телефоне).
3. **Один экран — одна тема.** Карточка настройки отвечает на один вопрос владельца; смежная тема — соседний экран в табах раздела или своя секция с собственным `…/edit`. Закрывает: `/settings/payments` = режим Robokassa + Tribute + BTCPay + Bitcart + x402 + ручная оплата + уведомление (A3); «Доставка» = список способов + вес по умолчанию + зоны (A).
4. **Порядок секций фиксирован: общее → состав → связи → редкое.** Главная секция с именем сущности всегда первая, «Дополнительно» и технические секции последние, справа — то, что не меняется ежедневно. Закрывает: «Не заполнено» выше формы на `/settings/requisites` (F20), «Сайты-сёстры» после формы создания сайта (A).
5. **Блок объясняет себя одной фразой подзаголовка.** Каждая секция имеет подзаголовок «что это и зачем» словами владельца; блок, который нельзя объяснить одной фразой, не попадает на экран. Закрывает: «Предупреждение перед оплатой» на `/settings/payments`, который Иван не опознал (И), «Для разработчика» на обзоре (F8).
6. **Слова — из глоссария, статусы — из `StatusBadge`.** Ни одного enum, ключа i18n, английского fallback или слова из списка «никогда не на экране». Пробы `nav-routes`, `no-medusajs-com-links` и `innerText`-сторож аудита ловят утечку. Закрывает: `paymentPreNotice.preview.valuePlaceholder` в предпросмотре (A6), `WB_WRITE_LIVE` и подобное (F6), «Авторизован» (F12), «Standard / Across / Not part of a campaign» на карточке акции (A).
7. **Ничего не хардкодится в tsx.** Любая строка, которую видит владелец, — ключ в `ru.json`/`en.json`; `defaultValue` допустим только с тем же текстом, что в словаре. Закрывает: 93 русских литерала в 22 файлах (`shipping-method-form`, `article-fields`, `pages`, `courses`, `reviews`, `requisites`; A7).
8. **Опасное — за «…» и за `usePrompt`.** Удалить/отозвать/отключить не стоит рядом с «Сохранить» и не выполняется без подтверждения с именем объекта. Закрывает: красная «Удалить счёт» рядом с главной кнопкой на `/settings/integrations/robokassa` и «Удалить договор» у СДЭК (F19, A), корзина без подтверждения у строки переадресации и способа доставки (A).
9. **Список — `_DataTable`, не `<Table>`.** Поиск, фильтры, сортировка и страница — в URL; строка кликабельна целиком; действия над строкой — в «…». Самодельная `<Table>` только до ~20 строк, без поиска, в `TableScroll`. Закрывает: восемь голых таблиц с горизонтальным скроллом (M R1), пагинация «0 из 0» на пустом поиске (F14), иконки-кнопки в строках без меню (`/settings/staff`, `/settings/redirects`, `/shipping`; A).
10. **Пустое — `NoRecords`/`NoResults`.** Над пустым телом нет шапки таблицы и пагинации; «ничего нет» получает одну кнопку. Закрывает: F14, «Статей пока нет» внутри первой ячейки таблицы и «0 из 0» над ней (`/journal`, A).
11. **Итог сохранения — тост, и только тост.** `toast.success` короткой фразой, `toast.error` текстом платформы; никаких зелёных строк «Сохранено» на странице и никаких `alert`. Закрывает: разнобой «Реквизиты сохранены» / «Сохранено» / молчание (A).
12. **Загрузка — скелет, не пустота и не спиннер в заголовке.** `SingleColumnPageSkeleton`/`TwoColumnPageSkeleton` до ответа; элементы управления не прячутся на время запроса, а рисуются `disabled` (правило 19h). Закрывает: «Загрузка…» навсегда на карточке заказа площадки (F18), спиннер под заголовком на `/home-settings` (A).
13. **Секреты — только `SecretValue`.** Ключ, пароль, адрес с токеном показываются последними четырьмя знаками или скрытой строкой с «Показать/Скопировать». Закрывает: токен в адресе статуса СДЭК и логин в открытом поле (F13).
14. **Один формат даты, денег и счётчиков.** Деньги — «1 084,00 ₽», дата — «15 сент. 2026, 06:57», счётчик согласован с существительным — через общие форматтеры панели (`lib/money`, `getFullDate`). Закрывает: четыре формата дат и «₽»/«RUB» (F12), `toLocaleString()` «02.10.2026, 17:28:13» на `/home-settings` и в «Последняя отправка» уведомлений (A).
15. **Телефон — те же маршруты, не другой экран.** Ниже 640 px drawer становится листом на весь экран, таблица — карточками (`PHONE_CARDS`), шапка переносит кнопки под заголовок; горизонтального скролла оболочки нет (`TableScroll`, `min-w-0`). Закрывает: F1, F2, F11, M R1–R6.
16. **Один маршрут — одна запись в `e2e/owner-routes.mjs`.** Новый адрес в `app.tsx` регистрируется в манифесте с `kind` и `core`, иначе его никто не снимет (тест `owner-routes-manifest`). Закрывает: экраны, выпадавшие из аудитов до 21.09.
17. **Интеграция = состояние + ссылка на реквизиты + поведение, в таком порядке.** Шапка с бейджем «подключено / не подключено / ключ не читается», `CrossLink` к `/settings/integrations/<service>`, затем секция поведения с собственным `…/edit`. Закрывает: F19 (одна настройка на двух экранах без единого порядка), A3.
18. **Прототип прежде кода.** Экран, не совпадающий с паттерном E1–E13, сначала получает HTML-прототип в proto-viewer (этап 2 программы), потом сборку; строитель не придумывает компоновку сам. Закрывает: «случайный порядок» (И).

## Запрещено

- Форма с полями ввода прямо на странице-карточке или на экране настроек (любой `<form>` вне `RouteDrawer`/`RouteFocusModal`).
- Больше одной кнопки «Сохранить» на один адрес; кнопка «Сохранить» в шапке страницы.
- `Button` с `variant="danger"` или красная кнопка рядом с главной; удаление без `usePrompt`.
- Голая `<Table>` из `@medusajs/ui` без `TableScroll`; таблица с поиском/фильтрами не на `_DataTable`.
- Русский или английский литерал в tsx, raw-ключ i18n, enum, id провайдера, имя переменной окружения, команда, путь API на экране владельца (список — глоссарий, раздел «What Never Reaches an Owner Screen»).
- `window.alert`, `confirm`, собственные всплывашки; подтверждение успеха текстом на странице вместо тоста.
- Инлайн-стили, собственные цвета, собственные размеры шрифта; только токены `@medusajs/ui-preset` (`text-ui-fg-subtle`, `bg-ui-bg-subtle`, `border-ui-border-base` …).
- Карточки «Метаданные», «JSON», «Для разработчика», «Публичный ключ» на экранах владельца.
- Нативный `<input type="file">`/`<select>`/`<input type="date">`: только `FileUpload`, `Select`, `DatePicker` из `@medusajs/ui`.
- Иконка-кнопка без `aria-label`; диалог без `Title`.
- Новый компонент-обёртка, когда в `src/components` или `@medusajs/ui` уже есть примитив для той же работы.

## Словарь

Термины владельца — только из [глоссария владельца](../tenant-panel/owner-glossary.md); новое слово сначала попадает туда, потом в `ru.json`. Короткие правила, которые чаще всего нарушают: «товар», не «продукт»; «название», не «заголовок»; «площадка», не «маркетплейс»; «обмен», не «синхронизация»; «ключ доступа», не «токен»; «сборка заказа», не «fulfillment»; «передать в доставку», не «отгрузить»; «страна продаж», не «регион»; «ждёт оплаты / оплачен», не «авторизован / получен».

## Компоненты

Единственно допустимые примитивы на каждую работу (всё из `@medusajs/ui` 4.2 или `apps/tenant-panel/src/components`):

| Работа | Примитив | Не использовать |
|---|---|---|
| Каркас страницы | `SingleColumnPage`, `TwoColumnPage` (`components/layout/pages`), секции через `LayoutComposer` | свой `div` с колонками |
| Секция | `Container className="divide-y p-0"` + шапка `px-6 py-4` + `SectionRow` (`components/common/section`) | `Container` с формой внутри |
| Меню действий | `ActionMenu` (`components/common/action-menu`) | россыпь `IconButton` |
| Правка | `RouteDrawer`, `RouteFocusModal`, `RouteDrawer.Form`/`RouteFocusModal.Form`, `KeyboundForm`, `Form.*` (`components/common/form`), `useRouteModal().handleSuccess` | `Drawer`/`FocusModal` напрямую со state-флагом (`staff-drawer.tsx` — переделать) |
| Поля | `Input`, `Textarea`, `Select`, `Combobox` (`components/inputs/combobox`), `Switch` в `SwitchBox`, `RadioGroup`, `Checkbox`, `DatePicker`, `CurrencyInput`, `HandleInput`, `CountrySelect`, `FileUpload` | нативные элементы, `react-currency-input-field` напрямую |
| Подтверждение | `usePrompt` | `Prompt` вручную, `confirm()` |
| Статус | `StatusBadge` (с точкой) для состояния, `Badge size="2xsmall"` для коротких меток (валюта, «Это вы») | цветной `Text` |
| Таблица | `_DataTable` (`components/table/data-table`) / `DataTable` (`components/data-table`), `useDataTable`; малые списки — `Table` в `TableScroll` (`components/table/table-scroll`) | `<table>` руками |
| Пусто | `NoRecords`, `NoResults` (`components/common/empty-table-content`) | текст в ячейке |
| Загрузка | `SingleColumnPageSkeleton`, `TwoColumnPageSkeleton`, `TableSkeleton` (`components/common/skeleton`) | `Spinner` + «Загрузка» |
| Секрет | `SecretValue` (`components/common/secret-value`) | `code`, `Input` с ключом |
| Детали для поддержки | `SupportDetails` (`components/common/support-details`) | `pre` с JSON, `Alert` с ответом API |
| Переход к смежному экрану | `CrossLink` (`routes/settings/integrations/components/cross-link`), `LinkButton` | «см. ниже / вверху» текстом |
| Тост | `toast.success`/`toast.error` из `@medusajs/ui` | `Alert` на успех |
| Текст | `Heading` (h1 только в шапке первой секции), `Text size="small"`, подписи `text-ui-fg-subtle` | `h2`/`p` с классами |

Редактор контента (страницы, статьи, уроки) — исключение по E4: `RouteFocusModal` с редактором `journal/components` и боковым предпросмотром, кнопки в подвале.
