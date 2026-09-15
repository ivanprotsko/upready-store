# Пилот реестра методов тестирования: три детектора на трёх настоящих багах 15.09

Задача `r03-test-methods-pilot`. Ветка `feat/day16-test-methods-pilot`, база `dev`.
Замеры сняты 2026-09-15 21:53 WITA.

Идея: каждый найденный баг — повод завести МЕТОД, который ловит весь его класс в любом проекте.
Метод живёт в реестре и доказывается замером, а не обещанием: детектор обязан быть красным на том
коммите, где баг жил, и зелёным на том, где его починили.

## Что изменилось (файлы)

| Файл | Что это |
|---|---|
| `tools/test-methods/registry.json` | сам реестр: три метода — класс, симптом, ключевые слова, детектор, `scope`, `placement`, фикстуры, доказательства, `baseline` |
| `tools/test-methods/tm.mjs` | CLI: `list`, `match --symptom`, `run <id\|all> [--base <sha>] [--strict]`, `verify <id\|all>`; у всего есть `--json`, rc=1 на красном |
| `tools/test-methods/detectors/boot-dep-not-in-runtime-install.mjs` | tm-001 |
| `tools/test-methods/detectors/owner-field-not-shown.mjs` | tm-002 |
| `tools/test-methods/detectors/fixture-in-compiled-tree.mjs` | tm-003 |
| `tools/test-methods/lib/source-view.mjs` | лексер: гасит комментарии, строки, шаблоны и regex-литералы, сохраняя смещения и номера строк |
| `tools/test-methods/lib/tree.mjs` | `git archive` любого коммита во временный каталог — рабочее дерево не трогается |
| `tools/test-methods/lib/walk.mjs` | обход файлов |
| `tools/test-methods/fixtures/tm-00{1,2,3}/` | по 3 красных варианта класса и по одному зелёному отрицательному контролю на метод |
| `tools/test-methods/__tests__/` | 24 юнита: CLI, целостность реестра, разборные части детекторов |
| `tools/test-methods/README.md` | как добавить метод, как встроить в приёмку, что покрыто, чего методы не делают |
| `package.json` | скрипт `test:methods` = юниты + `verify all` + `run all` |

## Три метода

### tm-001 — модуль, который грузится на старте, не установлен в рантайм-образе

Из инцидента **f17-backend-image-sharp** (PR #44): `sharp` стоял в `devDependencies`, а
`src/api/tenants/branding/upload/route.ts` импортировал его на уровне модуля. `medusa build`
копирует `apps/backend/package.json` в `.medusa/server/package.json` дословно, рантайм-стадия
Dockerfile ставит зависимости оттуда с `--omit=dev` — пакета в образе не было, контейнер умирал на
первом старте под `restart: unless-stopped`. Компилятор, сборка и push были зелёные.

Детектор обходит boot-каталоги Medusa и `medusa-config.ts`, собирает импорты **уровня модуля** и
требует, чтобы каждый пакет стоял в `dependencies`. Вторая проверка — платформенная: пакет с
per-platform `optionalDependencies` (в локе у них `cpu:`/`os:`) плюс `--ignore-scripts` в
рантайм-установке.

### tm-002 — владелец заполняет поле в панели, а витрина его не показывает

Из **f16-category-image-not-shown** (PR #54). Две проверки:

* `written-never-read` — ключ `metadata.*`, который пишет форма панели, не читает никто: ни витрина,
  ни бэкенд, ни сама панель.
* `owner-data-loses-to-build-defaults` — витрина читает данные владельца и выбрасывает их, если их
  меньше N (N ≥ 2), подставляя вшитые в сборку. Это и есть f16: `if (own.length >= 3) return own`,
  иначе — категории чужого магазина из профиля сборки.

**Важное про доказательство.** Формулировка из постановки задачи («ключи, которые пишет панель и не
читает витрина») исходный f16 НЕ ловит: на `c60638b` и `image_url`, и `image_alt` имели читателей.
Ловит вторая проверка. Метод доказан на том баге, из которого вырос, а не на удобном соседе; первая
проверка оставлена, потому что это очевидный сосед того же класса — и она сразу нашла живую находку
(ниже).

### tm-003 — одноразовая приёмочная фикстура в компилируемом дереве

Из **f12-owner-raw-keys** (PR #50) и деплоя **d04**: `apps/backend/src/scripts/f12-seed-test-order.ts`
уронил `medusa build` на `TS2322`, живой хост остался на `a530e50` без всей волны. Детектор ищет под
`apps/*/src` файлы, которые называют себя одноразовыми, или названы как фикстура. Юнит-тесты
(`*.test.ts`, `*.spec.ts`, `__tests__/`, `integration-tests/`) исключены.

## Как это измерено

Все выводы ниже целиком лежат в `artifacts/docs/r03-test-methods-pilot/measure/`.

### 1. Доказательства методов: красный на баге, зелёный на починке, красный на вариантах

```
$ node tools/test-methods/tm.mjs verify all
...
tm-001  ok  red                                       red(1)  74d9c01 коммит перед починкой f17
tm-001  ok  green                                     green   2286d43 починка f17: sharp переехал в dependencies
tm-001  ok  green                                     green   ba126e8 голова ветки задачи
tm-001  ok  red                                       red(1)  variant-1-optional-dependency
tm-001  ok  red                                       red(1)  variant-2-undeclared
tm-001  ok  red                                       red(1)  variant-3-ignore-scripts
tm-001  ok  green                                     green   green (отрицательный контроль)
tm-002  ok  red                                       red(2)  c60638b коммит перед починкой f16
tm-002  ok  green/owner-data-loses-to-build-defaults  red(1)  a530e50 починка f16
tm-002  ok  green/owner-data-loses-to-build-defaults  red(1)  ba126e8 голова ветки задачи
tm-002  ok  red                                       red(1)  variant-1-written-never-read
tm-002  ok  red                                       red(1)  variant-2-threshold-gt
tm-002  ok  red                                       red(1)  variant-3-subscript-write
tm-002  ok  green                                     green   green (отрицательный контроль)
tm-003  ok  red                                       red(3)  ba126e8 коммит, на котором сборка образа и упала
tm-003  ok  green                                     green   5b6e9e2 коммит перед t13
tm-003  ok  red                                       red(1)  variant-1-name-only
tm-003  ok  red                                       red(1)  variant-2-storefront-fixture
tm-003  ok  red                                       red(1)  variant-3-run-once
tm-003  ok  green                                     green   green (отрицательный контроль)

20/20 evidence cases hold.
rc=0
```

Полностью — `measure/11-verify-all.txt`. Коммиты разворачиваются `git archive` во временный каталог:
ни `checkout`, ни рабочее дерево не трогаются (в воркtree это было бы прямым вредом соседу).

Точечно, как именно детектор указывает на исходный баг:

```
$ node tools/test-methods/tm.mjs run tm-001 --base 74d9c01
tm-001  RED  1  0  files=325 imports=1027 packages=6

  RED  tm-001/boot-import-not-in-runtime-deps  apps/backend/src/api/tenants/branding/upload/route.ts:4
       sharp is imported at boot but declared in devDependencies; the runtime stage installs with
       --omit=dev and the container dies on "Cannot find module 'sharp'". Move it to dependencies.
       evidence: import sharp from "sharp";
rc=1
```

```
$ node tools/test-methods/tm.mjs run tm-002 --base c60638b
  RED  tm-002/owner-data-loses-to-build-defaults  apps/storefront/src/app/[locale]/(main)/page.tsx:68
       `own` is built from the owner's own data and kept only when it holds 3 items or more; below
       that the page falls back to `profileCategoryTiles`, which is baked in at build time.
       evidence: if (own.length >= 3) {
rc=1
```

```
$ node tools/test-methods/tm.mjs run tm-003 --base a530e50   # состояние живого хоста
  RED  tm-003/fixture-marker-in-compiled-tree  apps/backend/src/scripts/t13-seed-test-tenant.ts:11
  RED  tm-003/fixture-marker-in-compiled-tree  apps/backend/src/scripts/t17-seed-test-tenant.ts:11
rc=1
```

### 2. Прогон по ветке

```
$ node tools/test-methods/tm.mjs run all
ID      STATUS  NEW  KNOWN  SCANNED
tm-001  GREEN   0    0      files=328 imports=1036 packages=6
tm-002  GREEN   0    1      panelFiles=878 storefrontFiles=420 readerFiles=1716
tm-003  GREEN   0    3      files=1705
rc=0
```

`KNOWN` — это `baseline`: поимённый список находок, которые репозиторий сегодня терпит, у каждой
обязателен `reason` и `task`. Ослаблять детектор ради зелёного нельзя, поэтому находки не спрятаны,
а названы. `--strict` обнуляет baseline:

```
$ node tools/test-methods/tm.mjs run all --strict
tm-001  GREEN   0  ...
tm-002  RED     1  ...
tm-003  RED     3  ...
rc=1
```

### 3. Юниты

```
$ node --test tools/test-methods/__tests__/
ℹ tests 24
ℹ pass 24
ℹ fail 0
rc=0
```

Среди них — проверки целостности реестра (каждый детектор существует и экспортирует `run`, каждая
фикстура лежит на диске, каждый SHA резолвится, у каждой baseline-записи есть причина и владелец,
у каждого метода не меньше двух красных вариантов и один зелёный) и проверка самой механики
baseline: запись прячет ровно ту находку, которую называет, и не прячет соседнюю.

### 4. Одной командой

```
$ pnpm test:methods      # = node --test __tests__/ && tm verify all && tm run all
```

### 5. Подбор метода по жалобе

```
$ node tools/test-methods/tm.mjs match --symptom "загрузила картинку категории, сохранилось, а на витрине её нигде нет"
tm-002  9  сохраняется~сохранилось, картинка~картинку, витрина~витрине, загрузил, нигде нет

$ node tools/test-methods/tm.mjs match --symptom "контейнер бэкенда падает при старте, Cannot find module"
tm-001  5  cannot find module, падает на старте~падает, контейнер не поднимается~контейнер

$ node tools/test-methods/tm.mjs match --symptom "кот сидит на клавиатуре"
no method matches "кот сидит на клавиатуре".
That is the signal to write one: README.md, «Как добавить метод».
rc=1
```

## Что реестр нашёл живого прямо сейчас

Четыре настоящие находки на `dev`, все в `baseline` с причиной и владельцем:

1. **`tm-003` / `apps/backend/src/scripts/f12-seed-test-order.ts`** — тот самый файл, который ломает
   сборку образа. Чинит отдельная задача **f18-f12-fixture-build**; здесь он замер, а не правка.
2. **`tm-003` / `apps/backend/src/scripts/t13-seed-test-tenant.ts`** — тот же класс, найден этой
   задачей: «throwaway data … run once with `npx medusa exec` … against a scratch database».
   Сегодня сборку не ломает только потому, что типы в нём сошлись.
3. **`tm-003` / `apps/backend/src/scripts/t17-seed-test-tenant.ts`** — то же самое: «throwaway
   fixtures for measuring … not wired into any pnpm script».
4. **`tm-002` / `metadata.language`** в `apps/tenant-panel/…/edit-profile-form.tsx:61` — форма
   профиля пишет выбор языка владелицы в `user.metadata.language`, а по умолчанию подставляет
   `i18n.language`, то есть значение из браузера. Прочитать `metadata.language` не пытается никто:
   проверено руками по всем трём приложениям — в бэкенде только комментарии
   (`api/tenants/validators.ts`, `api/tenants/me/route.ts`, `modules/tenant/models/tenant-admin.ts`),
   живого чтения нет нигде. Значит выбор языка не переживает вход с другого устройства.

Пункты 2, 3 и 4 — кандидаты в задачи для штаба. Здесь они не чинятся: это не моя задача и не мой PR.

## Снятые ложняки (каждый нашёлся только на прогоне по настоящему дереву)

1. **tm-002, поиск читателя только в витрине** краснел на `metadata.locale` (запрос восстановления
   пароля): его читает `apps/backend/src/emails/i18n/locale.ts:55`, чтобы выбрать язык письма.
   Контракт «панель → бэкенд» — не дефект. Поиск читателя расширен на все три приложения.
2. **tm-002, читатель «любой доступ `.<ключ>`»** — запись `metadata: { language: values.language }`
   подтверждала сама себя через `values.language` строкой выше. Читатель обязан быть привязан к
   объекту `metadata`: доступ, подстрочник или деструктуризация.
3. **tm-002, запись как свой же читатель** — `metadata["promo_note"] = …` удовлетворяла проверке на
   подстрочник. Теперь цель присваивания читателем не считается.
4. **tm-003, голое слово «throwaway»** краснело на
   `src/workflows/tenant/provision-tenant-warehouse/steps/resolve-default-shipping-profile.ts:11`,
   где прилагательное описывает БАЗУ интеграционных тестов, а не файл. Маркеры сужены до фраз,
   которые могут описывать только сам файл; этот файл стал зелёным отрицательным контролем в
   фикстурах.

Все четыре записаны в `evidence.falsePositives` соответствующих методов.

## Чего НЕ сделано и почему

* **`tsc` / `next lint` / `medusa lint` приложений не гонялись**: в этом Superset-воркспейсе нет
  `node_modules` (`pnpm install` не запускался), `npx tsc` отвечает «To get access to the TypeScript
  compiler…», rc=1. Ставить весь монорепозиторий, чтобы проверить типы кода, которого задача не
  касалась, я не стал. Вопрос, который это могло бы закрыть, закрыт замером напрямую
  (`measure/08-app-gates-scope.txt`): в коммите **ноль** файлов под `apps/`, всё лежит под
  `tools/test-methods/` плюс одна строка в корневом `package.json`, а `include` каждого
  `apps/*/tsconfig.json` резолвится относительно каталога своего приложения. Фикстуры под
  `tools/test-methods/fixtures/` — нарочно урезанные снимки класса (типы не определены, JSX не
  собирается), и ни один гейт репозитория до них не дотягивается.
* **Четыре живые находки не починены** — см. выше, у каждой свой владелец.
* **Детекторы статические**: читают исходники и лок, не поднимают ни сборку, ни стенд. `tm-001` не
  заменяет `apps/backend/scripts/verify-runtime-modules.mjs` (тот требует модули из уже собранного
  образа и стоит в `docker build`) — он ловит тот же класс на пять минут раньше, ещё до сборки.
* **Отдельный репозиторий** для реестра не заводился: по постановке пилот делается внутри
  `upready-store`, вынос — позже.

## Как проверить за 10 минут

```bash
git fetch origin && git checkout feat/day16-test-methods-pilot

# 1. Доказательства всех трёх методов (разворачивает коммиты во временные каталоги, ~60 с)
node tools/test-methods/tm.mjs verify all          # ждём 20/20, rc=0

# 2. Прогон по ветке и то же самое без прощения baseline
node tools/test-methods/tm.mjs run all             # GREEN GREEN GREEN, rc=0, 4 строки known
node tools/test-methods/tm.mjs run all --strict     # tm-002 RED 1, tm-003 RED 3, rc=1

# 3. Юниты
node --test tools/test-methods/__tests__/           # 24/24

# 4. Всё сразу
pnpm test:methods

# 5. Детектор указывает на исходный баг пальцем
node tools/test-methods/tm.mjs run tm-001 --base 74d9c01   # sharp, route.ts:4, rc=1
node tools/test-methods/tm.mjs run tm-002 --base c60638b   # page.tsx:68, rc=1
node tools/test-methods/tm.mjs run tm-003 --base ba126e8   # f12-seed-test-order.ts, rc=1

# 6. И молчит там, где чинено
node tools/test-methods/tm.mjs run tm-001 --base 2286d43   # GREEN, rc=0
node tools/test-methods/tm.mjs run tm-003 --base 5b6e9e2   # GREEN, rc=0
```

### Ломающая проверка — снята мной, не описана словами

Детектор, который никогда не краснел на новом коде, не проверен. Замер (`measure/12-break-probe.txt`):

```
$ printf '// acceptance fixture ONLY …' > apps/backend/src/jobs/__tm003-break-probe.ts
$ node tools/test-methods/tm.mjs run tm-003
tm-003  RED  1  3  files=1706

  RED  tm-003/fixture-marker-in-compiled-tree  apps/backend/src/jobs/__tm003-break-probe.ts:1
       … calls itself a throwaway fixture and sits in apps/backend/src, which the production build compiles.
       evidence: fixture ONLY, acceptance fixture
rc=1

$ rm apps/backend/src/jobs/__tm003-break-probe.ts
$ node tools/test-methods/tm.mjs run tm-003
tm-003  GREEN  0  3  files=1705
rc=0
```

Зонд удалён, `git status apps/` чист.

---

# Раунд 2 — правки по приёмке (2026-09-15 22:16 WITA)

Приёмка раунда 1 приняла суть задачи (все критерии перемерены приёмщиком и зелёные) и отказала
только из-за конфликта мержа.

## 1. БЛОКЕР: PR конфликтовал с `dev` — закрыт

Замер до правки: `gh pr view 56 --json mergeable,mergeStateStatus` → `{"mergeStateStatus":"DIRTY",
"mergeable":"CONFLICTING"}`.

Конфликтовала ровно шапка `HANDOFF.json`: мой `updated`/`status` против строки `c01-wave5-composer`,
приехавшей в `dev`. Мой вклад в файл был ровно две строки (`git diff --numstat ba126e8..HEAD --
HANDOFF.json` → `2 2 HANDOFF.json`), поэтому конфликт разрешён в пользу `dev` целиком
(`git checkout --theirs -- HANDOFF.json`), а своя строка статуса возвращена поверх штатным
`handoff.mjs status append` — так чужая запись сохранена без потерь, а `updated` проставлен вызовом,
а не набран руками.

```
$ git merge origin/dev            # CONFLICT (content): HANDOFF.json
$ git checkout --theirs -- HANDOFF.json
$ node ~/upready/.ai/scripts/handoff.mjs status append "$(date …): r03 — раунд 2 …"
   сегментов: 2 | updated: 2026-09-15T22:11:45+08:00     # строка c01 на месте, моя добавлена
$ git commit --no-edit            # 5cf82ca3 Merge remote-tracking branch 'origin/dev'
$ git push
$ gh pr view 56 --json mergeable,mergeStateStatus,state
{"mergeStateStatus":"CLEAN","mergeable":"MERGEABLE","state":"OPEN"}
```

Гейты после мержа `dev` перемерены: `run all` rc=0, `verify all` rc=0 (`20/20 evidence cases hold`),
юнитов 24 из 24.

## 2. Нит 1: протухшая запись baseline теперь красная — сделано

Претензия верная: две из четырёх записей baseline исчезнут после мержа PR #55, реестр останется
зелёным и об этом не скажет.

Запись baseline — это долг с владельцем. Когда долг закрыт, запись перестаёт что-либо находить и
превращается в отговорку без предмета: следующую такую же находку она простит молча. Поэтому запись,
которая ничего не нашла, теперь делает прогон **красным** отдельной строкой `STALE` с именем
владельца и лечится удалением из `registry.json`.

Проверка идёт только по СВОЕМУ рабочему дереву: `--base <sha>` разворачивает старый коммит,
`--root <dir>` показывает на фикстуру — там записи не совпадают по построению, и протуханием это не
считается; `--strict` обнуляет baseline. Границу нашёл не я, а собственный тест CLI: первая версия
исключала только `--base`, и прогон против зелёной фикстуры через `--root` покраснел на трёх
записях, живых в репозитории.

Замер — смоделировано состояние после мержа PR #55 (пути в baseline указывают на новое место
`apps/backend/scripts/fixtures/`), полный вывод в `measure/13-stale-baseline.txt`:

```
$ node tools/test-methods/tm.mjs run tm-003 --registry <копия реестра>
tm-003  RED   3   0   3   files=1705

  STALE tm-003  fixture-marker-in-compiled-tree  apps/backend/scripts/fixtures/f12-seed-test-order.ts
       эта запись baseline больше ничего не находит: долг закрыт, а запись осталась
       и теперь молча простит следующую такую же находку. Удалите её из
       registry.json (метод tm-003, baseline). Владелец записи: f18-f12-fixture-build.
  STALE tm-003  …/t13-seed-test-tenant.ts   Владелец: r03-test-methods-pilot → штабу на заведение.
  STALE tm-003  …/t17-seed-test-tenant.ts   Владелец: r03-test-methods-pilot → штабу на заведение.
rc=1

$ node tools/test-methods/tm.mjs run tm-003 --base 5b6e9e2     # история, не протухание
tm-003  GREEN  0  0  0  files=1526      rc=0
$ node tools/test-methods/tm.mjs run tm-003 --strict           # baseline обнулён
tm-003  RED    3  0  0  files=1705      rc=1
$ node tools/test-methods/tm.mjs run all                       # текущее дерево ветки
tm-001/tm-002/tm-003  GREEN,  stale=0   rc=0
```

Закреплено тремя юнит-тестами (`__tests__/tm.test.mjs`): протухшая запись красит прогон и не
считается находкой; живая запись протухшей не считается; `--strict` и `--base` протухания не
показывают. Юнитов в сюите стало 27 вместо 24, проходят все 27.

## 3. Нит 2 (порядок мержа) — принято, делать нечего

Верно: если #56 вмержат раньше #55, ничего не ломается, а `tm-003` на `dev` будет отдавать три
`known`-находки до мержа #55. После мержа #55 те же три записи станут `STALE` и прогон покраснеет —
это ровно то поведение, которое просил нит 1: кто-то обязан удалить три строки из `registry.json`.

## 4. Нит 3 (`tsc`/`lint` приложений) — принято, делать нечего

Приёмщик перепроверил и подтвердил безопасность: в коммитах ноль файлов под `apps/`, весь код ветки —
отдельные `.mjs` в `tools/`, сборкой приложений не компилируются.

---

# Раунд 3 — правки по приёмке (2026-09-15 22:35 WITA)

## 1. «Коммит `6ba5772b` не запушен» — находка НЕВЕРНА, это была гонка

Замер приёмщика шёл 22:16–22:19 WITA, мой `git push` лёг в 22:18 (строка в `logs/workers.log`).
`git fetch` приёмщика успел раньше пуша. На момент этого раунда:

```
$ git fetch origin && git rev-list --left-right --count origin/feat/day16-test-methods-pilot...HEAD
0	0
$ git rev-parse HEAD;  git rev-parse origin/feat/day16-test-methods-pilot
6ba5772b4dd8f5bd4cefdb18275b1a81fe4f7272
6ba5772b4dd8f5bd4cefdb18275b1a81fe4f7272
$ gh pr view 56 --json headRefOid
{"headRefOid":"6ba5772b4dd8f5bd4cefdb18275b1a81fe4f7272"}
```

То есть `6ba5772b` — голова PR, и проверка протухания в PR есть. Отдельной правки здесь не требуется.

## 2. НОВЫЙ БЛОКЕР, появившийся после замера приёмщика: PR #55 вмержен в `dev`, PR снова конфликтовал

```
$ gh pr view 56 --json mergeable,mergeStateStatus
{"mergeStateStatus":"DIRTY","mergeable":"CONFLICTING"}
$ git log --oneline origin/dev -1
1088507f fix(backend): Образ бэкенда не собирается после #50: фикстура f12 в компилируемом src/scripts (f18-f12-fixture-build) (#55)
```

Слито: `git merge origin/dev`. Конфликтовала снова только шапка `HANDOFF.json` (мой вклад — те же
две строки, `git diff --numstat a339acc6 HEAD -- HANDOFF.json` → `2 2`), разрешено тем же способом:
сторона `dev` целиком плюс возврат своей строки через `handoff.mjs status append`.
`package.json` слился сам, и все три скрипта на месте: мой `test:methods` и два от f18
(`check:backend-build`, `check:backend-fixtures`).

## 3. Проверка протухания baseline сработала на ЖИВОМ событии, а не на модели

Ровно то, что в раунде 2 было смоделировано копией реестра, случилось по-настоящему: f18 перенёс
все три фикстуры в `apps/backend/scripts/fixtures/`, и после мержа `dev` прогон покраснел сам:

```
$ node tools/test-methods/tm.mjs run all
tm-001  GREEN  0  0  0  files=325 imports=1024 packages=6
tm-002  GREEN  0  1  0  panelFiles=878 storefrontFiles=420 readerFiles=1713
tm-003  RED    0  0  3  files=1702

  STALE tm-003  fixture-marker-in-compiled-tree  apps/backend/src/scripts/f12-seed-test-order.ts
       … Владелец записи: f18-f12-fixture-build.
  STALE tm-003  …/t13-seed-test-tenant.ts    STALE tm-003  …/t17-seed-test-tenant.ts
rc=1
```

Находок при этом НОЛЬ: класс в репозитории закрыт, красная только сама отговорка. Три записи
удалены из `registry.json`, вместо них поле `baselineClosed` с датой, номером PR и причиной:

```
$ node tools/test-methods/tm.mjs run all
tm-001  GREEN  0  0  0
tm-002  GREEN  0  1  0
tm-003  GREEN  0  0  0
rc=0
```

Полный вывод обоих прогонов — `measure/14-stale-fired-for-real.txt`.
В baseline осталась **одна** запись: `tm-002` / `metadata.language` (владельца у неё по-прежнему нет,
задачу заводит Иван). README обновлён.

## 4. Свой тест оказался привязан к состоянию репозитория — переписан

Тест `--strict … --base …` утверждал, что `run tm-003 --strict` выходит с кодом 1. Это было верно,
пока на `dev` стояли три фикстуры, и сломалось в ту же минуту, когда их не стало: тест проверял не
поведение, а сегодняшнее содержимое репозитория. Переписан на утверждение о КОЛОНКЕ `STALE`
(она обязана быть нулевой при `--strict` и при `--base`) и на постоянную фикстуру вместо рабочего
дерева. Юнит-тестов в сюите по-прежнему 27, проходят все 27.

## 5. Ниты 1 и 2 раунда 2 — закрыты событием

* Порядок мержа: вопрос снят, #55 уже в `dev`, и метод `tm-003` на слитом дереве зелёный без
  единой записи baseline.
* `tsc`/`lint` приложений: без изменений — под `apps/` в ветке по-прежнему ноль изменённых файлов
  (мерж `dev` приносит чужие правки, своих там нет).

## Итог замеров раунда 3

| команда | результат |
|---|---|
| `node --test tools/test-methods/__tests__/` | `tests 27 / pass 27 / fail 0`, rc=0 |
| `node tools/test-methods/tm.mjs verify all` | `20/20 evidence cases hold`, rc=0 |
| `node tools/test-methods/tm.mjs run all` | tm-001/002/003 GREEN, new=0, known=1, stale=0, rc=0 |
| `node tools/test-methods/tm.mjs run all --strict` | tm-002 RED 1, остальные GREEN, rc=1 |
