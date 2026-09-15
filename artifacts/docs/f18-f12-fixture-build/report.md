# fix(backend): Образ бэкенда не собирается после #50: фикстура f12 в компилируемом src/scripts (f18-f12-fixture-build)

Отчёт написан 2026-09-15 21:51 WITA. Ветка `fix/day16-f12-fixture-build`, база `dev`.

## Диагноз (замер, не пересказ задания)

`medusa build` компилирует НЕ только примитивы Medusa. Компилятор собирает программу из
`tsConfig.fileNames` и выбрасывает только сегменты пути `integration-tests`, `test`, `unit-tests`
и `src/admin` (`@medusajs/framework` 2.19.0: `#emitBuildOutput` в
`dist/build-tools/compiler.js`, `isFileIgnored` в `dist/build-tools/compiler-utils.js`).
`include` в `apps/backend/tsconfig.json` — `**/*`, поэтому одноразовая приёмочная фикстура под
`src/` типизируется и эмитится как часть ПРОДУКТОВОГО образа.

Воспроизведено локально на `ba126e8` (тот самый коммит, на котором упал d04),
`artifacts/docs/f18-f12-fixture-build/medusa-build-before.txt`:

```
src/scripts/f12-seed-test-order.ts:55:16 - error TS2322: Type '{ id: string[]; }' is not assignable to type 'undefined'.

55     filters: { sales_channels: { id: [salesChannelId] } },
                  ~~~~~~~~~~~~~~

warn:    Backend build completed with errors (235.70s)
rc=1
```

Причина самой ошибки: у сгенерированных query entry points (`apps/backend/.medusa/types/query-entry-points.d.ts`)
у `Product.sales_channels` нет формы фильтра вообще, а у `SalesChannel` нет поля `products` —
только `products_link`. То есть фильтр был написан по форме, которой в схеме нет.

## Что изменено

Фикстуры (все три, а не только f12 — класс, а не место):

| было | стало |
|---|---|
| `apps/backend/src/scripts/f12-seed-test-order.ts` | `apps/backend/scripts/fixtures/f12-seed-test-order.ts` |
| `apps/backend/src/scripts/t13-seed-test-tenant.ts` | `apps/backend/scripts/fixtures/t13-seed-test-tenant.ts` |
| `apps/backend/src/scripts/t17-seed-test-tenant.ts` | `apps/backend/scripts/fixtures/t17-seed-test-tenant.ts` |

t13 и t17 переехали потому, что они той же природы (в их шапках: «throwaway … never against a real
one») и потому, что гейт из п. «в» без них был бы красным на самой ветке.

- `apps/backend/tsconfig.json` — в `exclude` добавлен `scripts/fixtures`. Это и есть то, что убирает
  каталог из `medusa build` (проверено: см. «Как измерено», п. 4). `ts-node`, которым `medusa exec`
  требует файл, `include`/`exclude` игнорирует и компилирует что попросили, вне `node_modules`, —
  поэтому запуск фикстур не сломался.
- `apps/backend/scripts/fixtures/tsconfig.json` — отдельный конфиг (`extends ../../tsconfig.json`,
  `noEmit`), чтобы каталог, выпавший из сборки, всё же проверялся типами по требованию.
- `apps/backend/scripts/fixtures/README.md` — что здесь лежит, как запускать, почему каталог есть.
- `apps/backend/scripts/fixtures/f12-seed-test-order.ts` — исправлен сам тип: вместо фильтра по
  `sales_channels` (формы которой в схеме нет) товар для строки заказа берётся из `tenant.products`,
  то есть через линк `src/links/tenant-product.ts` — ровно тот путь, которым скоупится
  `GET /tenants/products`. Поля `products.id`/`products.title` добавлены в уже существовавший
  graph-запрос тенанта, второго запроса не появилось.
- `apps/backend/src/scripts/__tests__/fixtures-outside-src.unit.spec.ts` — юнит-гейт: падает, если
  под `apps/backend/src/` появляется файл с маркером `fixture ONLY` или `seed-test`, и в сообщении
  говорит, куда его класть. Три теста: (1) скан действительно прочитал дерево (>100 файлов — иначе
  «чисто» означало бы «ничего не прочитано», правило 20a), (2) под `src/` таких файлов нет,
  (3) детектор ловит подкинутую фикстуру во временном каталоге (и не трогает обычный файл рядом).
- `package.json` (корень) — `pnpm check:backend-build` = `cd apps/backend && npx medusa build --lint false`
  (ровно шаг из `apps/backend/Dockerfile`) и `pnpm check:backend-fixtures` = `npx tsc -p scripts/fixtures/tsconfig.json`.
- `AGENTS.md` — правило в четырёх местах, где его будут искать: дерево каталогов, таблица команд,
  «Verifying Your Work» (почему `npx tsc --noEmit` не заменяет сборку), «Backend» в Conventions и
  новый абзац в «Things That Break Silently» с механикой и ссылкой на гейт.

## Как измерено

Всё ниже — локальные прогоны в `apps/backend` этого worktree, логи лежат в
`artifacts/docs/f18-f12-fixture-build/`.

### 1. `npx medusa build --lint false` на ветке — rc=0

```
$ cd apps/backend && npx medusa build --lint false
info:    Compiling backend source...
info:    Removing existing ".medusa/server" folder
info:    Compiling frontend source...
info:    Backend build completed successfully (53.77s)
info:    Frontend build completed successfully (843.60s)
medusa build rc=0
```

Та же команда через новый корневой скрипт (проверено, что скрипт работает, а не только его содержимое):

```
$ corepack pnpm run check:backend-fixtures
> cd apps/backend && npx tsc -p scripts/fixtures/tsconfig.json
rc=0
```

Полный лог: `artifacts/docs/f18-f12-fixture-build/medusa-build.txt`
(для сравнения «до»: `medusa-build-before.txt`, rc=1 на `ba126e8`).

### 2. Юнит-гейт красный там, где он должен быть красным

Файлы `ba126e8` возвращены в `src/scripts/` (`git show ba126e8:… > …`), прогон, затем удалены.
Лог: `unit-gate-red-on-ba126e8.txt`.

```
FAIL src/scripts/__tests__/fixtures-outside-src.unit.spec.ts
  ✓ reads the whole src tree, so a clean result means something
  ✕ finds no acceptance fixture or one-off seed script under src/
  ✓ detects a fixture the moment one appears under src/

+   "apps/backend/src/scripts/f12-seed-test-order.ts carries the marker \"fixture ONLY\". medusa build
+    compiles every file tsconfig.json includes, so a type error here fails the production image build.
+    Move it to apps/backend/scripts/fixtures/ (excluded in apps/backend/tsconfig.json) and run it
+    with npx medusa exec ./scripts/fixtures/<file>.ts.",
+   … ещё 3 строки: t13, t17 и второй маркер f12

Tests:       1 failed, 2 passed, 3 total
rc=1
```

### 3. Юнит-гейт зелёный на ветке

Лог: `unit-gate-green-on-branch.txt`.

```
PASS src/scripts/__tests__/fixtures-outside-src.unit.spec.ts
Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
rc=0
```

### 4. Фикстуры действительно вышли из компилируемого дерева

Лог: `emitted-tree.txt` (после сборки из п.1).

```
$ ls .medusa/server/scripts
ls: .medusa/server/scripts: No such file or directory
rc=1
$ ls .medusa/server/src/scripts | grep -E "f12|t13|t17"
grep rc=1
$ ls .medusa/server/src/scripts | wc -l
      16
```

То есть `scripts/fixtures` не эмитится вовсе, а в эмитированном `src/scripts` ни одного из трёх
файлов нет. В образ они не попадали бы и раньше (runtime-стадия Dockerfile копирует только
`.medusa/server`) — ломали они именно СБОРКУ.

### 5. Типы фикстур проверяются и ловят ту самую ошибку

`npx tsc -p scripts/fixtures/tsconfig.json` → rc=0, и `--listFiles` подтверждает, что проверены все
три файла (иначе «rc=0» значило бы «ничего не проверено»):

```
$ npx tsc -p scripts/fixtures/tsconfig.json --listFiles | grep -c 'scripts/fixtures'
3
$ npx tsc -p scripts/fixtures/tsconfig.json; echo rc=$?
rc=0
```

Обратная проверка: копия f12 со СТАРЫМ фильтром, положенная в тот же каталог, даёт ту же TS2322,
то есть новый конфиг — не заглушка:

```
scripts/fixtures/zz-probe-ba126e8.ts(73,16): error TS2322: Type '{ id: string[]; }' is not assignable to type 'undefined'.
rc=2
```

(пробный файл удалён, в коммит не уехал)

### 6. Остальные проверки бэкенда

```
$ npx tsc --noEmit            → tsc rc=0            (tsc-src.txt)
$ npx medusa lint             → 61 problems (0 errors, 61 warnings), lint rc=0   (medusa-lint.txt)
$ TEST_TYPE=unit npx jest     → Test Suites: 1 failed, 23 passed, 24 total
                                Tests: 1 failed, 242 passed, 243 total   (unit-all-green.txt)
```

Предупреждения линта — прежний класс `use-medusa-error-not-generic-error`, мой диф их не добавил
(новый спек в выводе линта не упомянут ни разу). Про единственный красный юнит — ниже.

## Что НЕ сделано и почему

1. **Один юнит-тест в сьюте красный, и он не мой**: `src/migration-scripts/__tests__/profile-data.unit.spec.ts`,
   тест «i18n merge › leaves a locale the profile never translated identical to the base» —
   в профильном `fr` появился лишний ключ `productOptions: {}`. Замер, что это не моя правка:

   ```
   $ git diff --stat ba126e8..HEAD -- apps/backend/src/migration-scripts
   (пусто)
   $ git log --oneline -1 -S'productOptions' -- apps/backend/src/migration-scripts/data/profiles
   7e4ad3f feat(catalog): один абстрактный стартовый набор abstract … (t-2026-09-12-catalog-taxonomy)
   ```

   То есть ключ приехал чужой, более ранней задачей, и на `ba126e8`/`dev` этот тест такой же красный.
   Чинить его в этом PR я не стал — это отдельная задача (паритет seed-каталогов i18n), и трогать
   данные каталога в PR про сборку значит смешать два дифа. Флажок приёмщику: это стоит завести
   отдельным пунктом.

2. **`docker build` не запускался** — по прямому указанию в задании (локальный Docker Desktop сломан);
   сборку образа проверит деплой d05. Ровно тот шаг, который делает Dockerfile
   (`npx medusa build --lint false`), прогнан локально и зелёный — см. п.1 «Как измерено».

3. **Сама фикстура f12 не прогонялась против БД.** Локального Postgres нет (замер:
   `for p in 5432 5433; do (echo > /dev/tcp/127.0.0.1/$p) …` → `5432 closed`, `5433 closed`), а
   базы `upready_store_f12` с миграционным каталогом клиентки локально не существует. Поэтому
   изменённый поиск товара проверен типами и происхождением пути, а не запуском: `tenant.products`
   — это тот же линк, которым живёт `GET /tenants/products` (`listTenantProductIds` в
   `src/api/tenants/tenant-scope.ts:74-92`), то есть путь, который на стенде уже работает на
   продуктовых экранах панели. Если у тенанта товаров нет, фикстура, как и раньше, создаёт заказ
   без строки товара (эта ветка в коде была и до правки). Задание требовало от фикстуры «хотя бы
   проходить tsc» — это сделано и измерено.

4. **Скриншотов нет**: задача целиком про сборку и гейты, видимой поверхности у неё нет.

## Как приёмщику проверить за 10 минут

```bash
cd <worktree>/apps/backend

# 1. гейт зелёный (≈1 c)
TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/scripts --runInBand --forceExit

# 2. гейт ловит нарушение: положить фикстуру назад и прогнать снова (≈1 c)
git show ba126e8:apps/backend/src/scripts/f12-seed-test-order.ts > src/scripts/f12-seed-test-order.ts
TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/scripts --runInBand --forceExit   # FAIL
rm src/scripts/f12-seed-test-order.ts

# 3. типы фикстур (≈15 c)
npx tsc -p scripts/fixtures/tsconfig.json; echo "rc=$?"

# 4. тот самый шаг образа (backend-часть ≈1 мин, admin-часть ≈10 мин)
cd <worktree> && pnpm check:backend-build; echo "rc=$?"
```

Если времени на п.4 нет: достаточно строки `Backend build completed successfully` в
`artifacts/docs/f18-f12-fixture-build/medusa-build.txt` — фикстура ломала именно backend-часть
компиляции, admin-часть к ней отношения не имеет.

---

**Раунд 2** (PR #55 отклонён по конфликту мержа): что сделано и как измерено — `artifacts/docs/f18-f12-fixture-build/round-2-comment.md`, он же опубликован комментарием к PR. Коротко: merge `origin/dev` с разрешением `HANDOFF.json` (merge-коммит `187fd600`), и гейт фикстур расширен со `src/` на весь компилируемый `apps/backend` (`e8ec359b`) — нит приёмки подтверждён замером `tsc --listFiles`, а не принят на слово.
