# Редактор страниц магазина целиком на английском

Найдено живой приёмкой панели (`q02-qa-owner`) на реальном магазине Оксаны.

## Что видит владелица

https://panel-store.upready.dev/pages → любая страница (например `/pages/contacts` или созданная своя):
форма редактирования полностью английская:

```
Title
The heading of the page, and the wording of its link in the storefront footer.
Text
Markdown: # for a heading, - for a list item, [text](https://example.com) for a link, a blank line between paragraphs.
Published
A published page is open to shoppers at /pages/<key>. A draft is visible to you alone.
In the footer
A published page marked here is linked from the storefront footer's Information column, alongside the shop's other footer pages. Reorder it from the pages list.
Cancel   Save
```

Скриншот: `artifacts/q02-qa-owner/shots/s08-page-editor-1280x900.png`, выгрузка: `artifacts/q02-qa-owner/raw/s08-editor.json`.

Контраст: СПИСОК страниц (`/pages`) написан отличным русским языком («Пять готовых разделов и любые свои
страницы… Опубликованная страница, отмеченная «в подвале», появляется в подвале магазина»). По-английски
только сама форма — то единственное место, где владелица пишет свой текст.

Владелица пишет «Я ничего не поняла», когда видит технический текст
(`handoff/day-2026-09-16-oksana-store/research/telegram-digest.md` §7).

## Где искать

`apps/tenant-panel/src/routes/pages/page-edit/components/edit-page-form/edit-page-form.tsx`
(строка 139 — `<Form.Label>In the footer</Form.Label>`), рядом остальные подписи и подсказки.
Словарь: `apps/tenant-panel/src/i18n/translations/ru.json`.

Подсказку про Markdown стоит переписать по-русски и на примерах владелицы («# Заголовок», «- пункт списка»),
а не переводить дословно.

## Приёмка (замером, на живой панели)

- Открыть `/pages/contacts` и `/pages/<своя>`: в innerText формы ноль английских слов, кроме имён
  собственных и примеров ссылок.
- Кнопки «Сохранить» и «Отмена» по-русски.
- Скриншот 1280x900 каждого экрана + вывод поиска по `/\b(Title|Text|Published|Save|Cancel|footer|shoppers)\b/`.
