# Раунд 2 — обе находки закрыты

## 1. Конфликт с `dev` (блокер) — устранён

`git fetch origin dev && git merge origin/dev` в worktree ветки. Конфликтовал ровно `HANDOFF.json`,
ровно в шапке, как и сказано в приёмке:

```
$ git merge origin/dev
Auto-merging HANDOFF.json
CONFLICT (content): Merge conflict in HANDOFF.json
Automatic merge failed; fix conflicts and then commit the result.
merge rc=1
```

Разрешено так, как предписано: поля `updated`/`status` — мои (21:53 против 21:21 у
`c01-wave5-composer`), всё остальное — из `dev`. Проверено не на глаз, а сравнением с `dev`:

```
$ node -e '<сравнение HANDOFF.json ветки с git show origin/dev:HANDOFF.json>'
questions dev: 52 merged: 52
missing from merged: []
sessions dev: 1 merged: 1
tasks dev: 42 merged: 42
status starts: 2026-09-15 21:53 WITA: f18-f12-fixture-build ЗАКРЫТ воркером
$ node -e '<поиск нового вопроса>'
q-priemka-f03-pr-42 present: 1 q-priemka-f03-pr-42-smerzhen
```

То есть новый вопрос из `dev` на месте, все 42 задачи и обновлённый список sessions из `dev`
сохранены, конфликтных маркеров в файле нет (`grep -c '<<<<<<<\|=======\|>>>>>>>'` → 0),
JSON парсится. Merge-коммит `187fd600`.

Замер после пуша (`e8ec359b`):

```
$ git fetch origin dev && gh pr view 55 --json mergeable,mergeStateStatus
{"mergeStateStatus":"CLEAN","mergeable":"MERGEABLE"}
```

## 2. Нит: гейт сканировал только `src/` — исправлено, и нит сначала подтверждён замером

Нит верный, не отклоняю. Замер (артефакт `artifacts/docs/f18-f12-fixture-build/nit-2-scripts-compiled.txt`):

```
$ printf 'export const probe: string = "nit-2";\n' > apps/backend/scripts/zz-nit-probe.ts
$ cd apps/backend && npx tsc --noEmit --listFiles | grep zz-nit-probe
/Users/…/apps/backend/scripts/zz-nit-probe.ts
tsc rc=0
```

Файл вне `scripts/fixtures` действительно попадает в программу компиляции, значит фикстура там
уронила бы `medusa build`, а прежний гейт промолчал бы.

Что изменено в `apps/backend/src/scripts/__tests__/fixtures-outside-src.unit.spec.ts`: корень скана
теперь `apps/backend` целиком, а вычитается ровно то, что сборка и так не компилирует, и ровно по
тем же правилам, что у `isFileIgnored`:

- `scripts/fixtures` — единственный путь в `exclude` (законный дом фикстур);
- `node_modules`, `static` и любой dot-каталог (`.medusa`, `.cache`, `.turbo`, `.git`);
- сегменты `integration-tests`, `test`, `unit-tests` и путь `src/admin` — те четыре куска, которые
  выбрасывает `isFileIgnored` в `@medusajs/framework`;
- сам файл спека (он называет оба маркера в своём тексте) — по `__filename`, а не блокировкой всего
  `__tests__`: каталог `__tests__` сборка НЕ игнорирует (сравнение по сегментам, `__tests__` ≠ `test`),
  так что фикстура там тоже сломала бы образ и гейт её увидит.

Калибровка перед правкой (чтобы «зелено» не значило «ничего не нашли»): маркеры по всему
`apps/backend` встречаются только в `scripts/fixtures/*` и в самом спеке — ложных срабатываний
у широкого скана нет.

Гейт теперь ловит ОБА размещения. Подкинуты одновременно файл `ba126e8` в `src/scripts/` и фикстура
в `apps/backend/scripts/` (артефакт `unit-gate-red-on-ba126e8.txt`):

```
✓ reads the whole compiled tree, so a clean result means something
✕ finds no acceptance fixture or one-off seed script outside scripts/fixtures
✓ detects a fixture the moment one appears in the compiled tree

+ "apps/backend/scripts/zz-nit-fixture-probe.ts carries the marker \"fixture ONLY\"…"
+ "apps/backend/src/scripts/f12-seed-test-order.ts carries the marker \"fixture ONLY\"…"
+ "apps/backend/src/scripts/f12-seed-test-order.ts carries the marker \"seed-test\"…"

Tests: 1 failed, 2 passed, 3 total
rc=1
```

После удаления подкидышей (`unit-gate-green-on-branch.txt`):

```
✓ reads the whole compiled tree, so a clean result means something
✓ finds no acceptance fixture or one-off seed script outside scripts/fixtures
✓ detects a fixture the moment one appears in the compiled tree
Tests: 3 passed, 3 total
rc=0
```

Третий тест тоже усилен: во временном дереве теперь лежат фикстуры и в `src/scripts/`, и в
`scripts/`, плюс два файла, которые НЕ должны сработать — фикстура в законном `scripts/fixtures/`
и файл в `integration-tests/` (сборка этот сегмент выбрасывает).

Заодно поправлены `AGENTS.md` (абзац в «Things That Break Silently» и пункт в Conventions/Backend:
«и нигде больше в `apps/backend`», а не «не под `src/`») и `apps/backend/scripts/fixtures/README.md`.

Отдельно: первая версия этой правки не собиралась — `**/*` внутри JSDoc закрывает комментарий
(`x Expression expected` от swc). Поймано прогоном гейта до коммита, а не после.

## Перезамер всего, что трогала правка

Всё в `apps/backend`, логи в `artifacts/docs/f18-f12-fixture-build/`:

```
$ npx tsc --noEmit                     → tsc rc=0                        (tsc-src.txt)
$ npx medusa build --lint false         → Backend build completed successfully (10.00s)
                                         Frontend build completed successfully (27.36s)
                                         medusa build rc=0                (medusa-build.txt)
$ npx medusa lint                      → 61 problems (0 errors, 61 warnings), lint rc=0  (medusa-lint.txt)
$ TEST_TYPE=unit … npx jest            → Test Suites: 1 failed, 23 passed, 24 total
                                         Tests: 1 failed, 242 passed, 243 total, unit rc=1  (unit-all-green.txt)
```

Единственный красный — `src/migration-scripts/__tests__/profile-data.unit.spec.ts`, тот самый из п.3:
он красный и на `ba126e8`, и на `dev`, к этому дифу отношения не имеет.

## 3. Флажок про `profile-data.unit.spec.ts` — согласен, отдельная задача

Ничего в этом PR по нему не делаю.
