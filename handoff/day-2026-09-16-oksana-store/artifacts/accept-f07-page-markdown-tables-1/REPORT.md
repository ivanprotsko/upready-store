# Приёмка f07-page-markdown-tables (PR #43) — раунд 1, ПРИНЯТО

Приёмщик: headless `claude -p`, старт 2026-09-15 12:11 WITA (показание часов на промпте диспетчера).
Ветка `fix/day16-page-markdown` → `dev`, `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN`,
HEAD == `origin/fix/day16-page-markdown` == `6c019698fe74de574390a77e2afa9945be63cbe2`.

## Где мерил и почему не на живом тенанте

Целевые URL недоступны обоим:

- `https://cherkashino.shipshift.dev/ru/pages/contacts` → **502** (замер 12:12 WITA): MT-стенд сейчас
  передеплоивается (`d03-deploy-mt-3` в последних коммитах `dev`), и там в любом случае старый код —
  деплой только по команде Ивана (правило 21c);
- локально `http://localhost:8043/ru/pages/{contacts,offer,privacy}` → **404** на всех: у витрины нет
  `.env`, бэкенда с засеянным тенантом Черкашиной нет.

Поэтому мерил РЕАЛЬНЫЙ рендер: реальный `MarkdownContent` + реальный `parseMarkdown` из ветки,
отрисованные `renderToStaticMarkup`, со СВОИМИ стилями витрины (`tailwindcss -c tailwind.config.js -i
src/styles/globals.css`), в РЕАЛЬНОМ Chromium (playwright-core 1.62.1). Источники — те самые тексты
тенанта из `handoff/…/x01-tenant-live-import/pages/`: `contact.ru.md` → contacts, `terms.ru.md` →
offer (19 038 знаков innerText против 19 274 б тела `offer` в БД по отчёту x01), `privacy.ru.md` →
privacy (15 647 против 15 821 б). Харнесс: `render.test.tsx`, `vitest.config.ts`, `measure.mjs`
(лежат рядом), писался в `/tmp`, в дерево витрины не залезал (на 8043 живёт `next dev` того же
worktree — правило 5d).

Контроль «до»: тот же прогон с парсером из `origin/dev` (`git show origin/dev:…/markdown.ts`).

## Замеры

`measure-before.txt` (парсер `origin/dev`, 1280×900):

```
base-contacts {"pipe":true,"sep":true,"tables":0,"rows":0,"ems":3,...}
base-offer    {"pipe":true,"sep":true,"tables":0,"rows":0,"ems":4,...}
base-privacy  {"pipe":true,"sep":true,"tables":0,"rows":0,"ems":7,...}
```

`measure-after.txt` (ветка PR):

```
contacts 1280x900 {"pipe":false,"sep":false,"dashRunAsText":false,"tables":2,"rows":7,"hrs":8,"ems":0,"gluedToken":false,"tokenIntact":true,"scrollWidth":1280,"innerWidth":1280,"textLen":3372}
contacts  390x844 {... "scrollWidth":390,"innerWidth":390 ...}
offer    1280x900 {"pipe":false,"sep":false,"tables":1,"rows":5,"hrs":14,"ems":2,"tokenIntact":true,...}
offer     390x844 {... "scrollWidth":390,"innerWidth":390 ...}
privacy  1280x900 {"pipe":false,"sep":false,"tables":5,"rows":25,"hrs":18,"ems":0,"tokenIntact":true,...}
privacy   390x844 {... "scrollWidth":390,"innerWidth":390 ...}
```

Критерии задачи:

1. **contacts** — `document.body.innerText.includes('|')` → `false`, `includes('|---|')` → `false`,
   `<table>` = 2, строк `<tbody tr>` = 7. ✅ (было `true/true/0`)
2. **offer и privacy** — то же самое, измерено ОТДЕЛЬНО каждой страницей (исполнитель эти две
   экстраполировал; здесь они померены): `pipe=false`, `sep=false`, таблиц 1 и 5. ✅
3. **`---` линией, подчёркивание не курсивит** — `<hr>` 8/14/18 при нуле текстовых «---» в innerText
   (`dashRunAsText=false`); на contacts курсивов было 3, стало 0, `{{ЮР_АДРЕС}}` цел
   (`tokenIntact=true`), склейки `ЮРАДРЕС` в innerHTML нет. ✅
4. **Скриншоты и отсутствие горизонтальной прокрутки** — `contacts-1280x900.png`,
   `contacts-390x844.png` (и то же для offer/privacy); `documentElement.scrollWidth === innerWidth`
   → `390 === 390` на всех трёх. Глазами: таблицы нарисованы рамками, строки читаются, на 390 px
   ячейки переносятся, вылета за экран нет. ✅

## Прочие проверки

- `npx vitest run src/lib/util/markdown.test.ts` → rc=0, **11 passed** (`vitest-markdown.txt`).
- `npx tsc --noEmit` на ветке → одна ошибка `src/lib/tenant/request-shop.test.ts(6,53) TS2739`
  (`tsc-branch.txt`). Прогнал тот же тайпчек на `dev` в основном чекауте — **ошибка идентичная и
  предсуществующая** (`tsc-dev-baseline.txt`), файл в дифе PR не участвует. Не вина этого PR.
- `next build` НЕ запускал сознательно: на порту 8043 работает `next dev` этого же worktree, сборка
  переписала бы его `.next` под живым сервером (правило 5d, инцидент aie-20260915-080025-d004).
  Исполнитель прогнал сборку до старта своего dev-сервера и приложил вывод.
- Диф: 3 файла кода (+182/−12) + 2 скриншота + отчёт. Секретов, миграций, удалений, правок
  защищённой инфраструктуры нет; scope creep не вижу — токены `{{…}}` не трогались (это t12).

## Ниты (не причина отказа, вынесены в комментарий к PR)

1. `markdown.ts`, комментарий над `TABLE_SEPARATOR`: «Never matches a bare `---` (no pipe in it)» —
   неверно, регэксп `/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/` голому `---` соответствует (обе трубы
   необязательны). Коллизии с `<hr>` нет только потому, что `RULE` проверяется РАНЬШЕ по коду;
   побочный эффект остаётся: абзац `цена | 500 ₽`, за которым идёт строка `---`, прочитается таблицей.
2. У первой таблицы `contact.ru.md` нет заголовка (`| | |` перед разделителем) — `<thead>` рисуется
   пустой полосой (видно на `contacts-1280x900.png`). Косметика, поведение GFM; при желании —
   не рисовать `<thead>`, когда все ячейки заголовка пустые.

## Вердикт

MERGED (`gh pr merge 43 --squash`).
