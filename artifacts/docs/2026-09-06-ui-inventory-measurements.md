# Замеры витрины перед программой «UI из JSON», 2026-09-06

Снято архитектором (сессия `store-ds`) на коммите `852bbca` (`main`, до создания `dev`). Каждое число скопировано из вывода команды. Подсчёт JSX-тегов через grep занижает и здесь не приводится: тег с переносом строки после имени (`<Button\n`) под шаблон не попадает. Точный реестр даёт парсер задачи T0 (`apps/storefront/scripts/ui-inventory.mjs`).

## Пакеты

```
apps/storefront/package.json: @medusajs/ui 4.2.1 · @medusajs/ui-preset 2.19.0 · @medusajs/icons 2.19.0
node_modules/@medusajs/ui/package.json: "version": "4.2.1"
```

Компоненты в `node_modules/@medusajs/ui/dist/esm/components/` (46): alert avatar badge button calendar checkbox code code-block command command-bar container copy currency-input date-picker date-segment divider drawer dropdown-menu focus-modal heading hint i18n-provider icon-badge icon-button inline-tip input kbd label otp-input popover progress-accordion progress-tabs prompt radio-group select skeleton status-badge switch table tabs text textarea time-input toast toaster tooltip. Все семь компонентов пилота присутствуют.

## Объём витрины

```
cd apps/storefront
find src -name '*.tsx' | wc -l                              → 223
find src/modules -name index.tsx | wc -l                    → 132
find src/app -name page.tsx | wc -l                         → 24
find src/app -name layout.tsx | wc -l                       → 5
grep -rl '"use client"' src --include='*.tsx' | wc -l       → 84
```

## Импорты `@medusajs/ui` (файлов на компонент)

```
grep -rhoE "from \"@medusajs/ui\"" src | wc -l              → 78 (строк импорта)
grep -rhoE "import \{[^}]*\} from \"@medusajs/ui\"" src | sed -E 's/import \{([^}]*)\}.*/\1/' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | sort | uniq -c | sort -rn
```

| Имя | Файлов |
|---|---|
| clx | 30 |
| Text | 28 |
| Button | 24 |
| Heading | 11 |
| Container | 7 |
| Checkbox | 7 |
| RadioGroup | 4 |
| Label | 4 |
| Badge | 4 |
| Table | 2 |
| Input | 2 |
| StatusBadge | 1 |
| Select | 1 |
| IconButton | 1 |
| IconBadge | 1 |
| DropdownMenu | 1 |

## Иконки

```
grep -rhoE "from \"@medusajs/icons\"" src | wc -l           → 34 (файлов)
… | sort -u | wc -l                                          → 30 (разных иконок)
```

## Другие UI-библиотеки

```
grep -rhoE "from \"@(headlessui|ariakit|radix-ui)[^\"]*\"" src | sort | uniq -c
→ 13 @headlessui/react · 1 @ariakit/react · 1 @radix-ui/react-accordion
```

## Allowlist Tailwind против импортов

`tailwind.config.js` перечисляет 14 глобов: badge, button, checkbox, container, dropdown-menu, heading, icon-badge, icon-button, input, label, radio-group, status-badge, table, text. `Select` импортирован в `src/modules/store/components/refinement-list/sort-products/index.tsx` (строки 3, 28–45), глоба `select` в allowlist нет. По AGENTS.md такой компонент рендерится без стилей без единой ошибки; в самом файле уже стоят ручные `className="bg-ui-bg-base"` на `Trigger`, `Content` и `Item`. Живой рендер на `:8000` не снимался: это входит в приёмку агента A2 (до и после).

## Тесты и инфраструктура

```
ls apps/storefront | grep -iE "playwright|vitest|jest|storybook"   → (пусто)
grep -E '"(playwright|@playwright|vitest|jest|storybook)' */package.json → только apps/backend: jest ^29.7.0
docker info                                                   → OK (colima)
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:8000/ → 302 http://localhost:8000/en
```

## Ветки

```
git branch -a → main · origin/chore/update-medusa-2.20.1 · origin/feat/seed-admin-user · origin/fix/demo-walkthrough · origin/main
git worktree list → только основной checkout
```

`dev` создана 2026-09-06 05:41 WITA в основном checkout (`WORKTREE_OK=1 git switch -c dev`, интеграционная ветка, за которой Иван смотрит на `:8000`).

## app-shell, база подписки

```
git -C ~/upready/projects/app-shell branch --show-current → feat/component-library (502179a)
git -C ~/upready/projects/app-shell tag | wc -l → 11 (renderer 1.0.0–1.0.3, block-gen 1.0.0–1.2.1)
grep -rIl -iE "release[- ]?updates|release channel|releases" app-shell (md/json/mjs) → ничего
```

Роадмап `docs/ROADMAP-JSON-UI.md`: срезы 0–3 сделаны (2026-09-04/05), срез 4 «целые экраны из JSON» следующий.
