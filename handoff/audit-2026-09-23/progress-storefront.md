# Прогресс: Area B (storefront) — 2026-09-23

## 10:41 WITA — ЗАВЕРШЕНО
Отчёт: /Users/ivanprotsko/upready/projects/upready-store/handoff/audit-2026-09-23/storefront.md
Оценка C. Находок 14: High 1, Medium 8, Low 3, Info 2.
Три главные:
1. B-01 High — ни один футер не выводит политику/оферту (152-ФЗ), резолвер legal-links к футеру не подключён.
2. B-02 Medium — в пресете default/medusa тёмном текст на основной кнопке 2,29:1 против нормы 4,5:1 (посчитано).
3. B-03 Medium — 0 generateStaticParams, 4 loading.tsx и 8 Suspense на 32 страницы: LCP/TTFB наследуют бэкенд.
Проверки зелёные: парити 36 каталогов (532 ключа, 0 расхождений), check-locale-catalogs.mjs,
все 9 ru-plural с one/few/many, 39/39 вызовов convertToLocale с локалью, аналитика не грузится до согласия.
Не покрыто: фокус в листах checkout, 24x24, порядок заголовков, поток checkout целиком, промокоды/поиск/фильтры,
формулировки cookie-баннера, ворктри PR #114/#115/#116, альфа-канал в расчёте контраста.

## 10:34 WITA
Прочитаны brief, AGENTS.md, standards.md. Ветка dev @ f72def34. Инвентарь снят.
