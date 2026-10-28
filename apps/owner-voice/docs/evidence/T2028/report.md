# t-2026-10-20-28 — owner voice chat fix (line opus-t28-boat, 20.10.2026)

Branch `feat/t24-voice-chat`, PR #479. Screens from the live render of `node src/server.ts` with no keys
(catalog live from cherkashino.com, orders and voice on fixtures, model off), light theme.

| Group | What it shows |
|---|---|
| `voice-off/1440-light.png`, `voice-off/390-light.png` | Voice on fixtures: the mic button is disabled, one line «Голос на этом стенде выключен, спросите текстом», the header keeps its part-by-part status in plain words |
| `typed-mumie/1440-light.png`, `typed-mumie/390-light.png` | Typed «сколько стоит мумие» answered with «Мумиё алтайское очищенное натуральное 100% — 30 $» from the live Store API |

## The four changes

1. ё and е. `fold()` in `src/shop/fixtures.ts` reads ё as е on both sides of every match (`matchesQuery`,
   `searchStem`, the keyword router). The Store API `q` does not fold ё, so `find_products`, `open_product`,
   `product_reviews` and `product_stock` read the list itself (pages of 100, up to 500 rows) and match locally
   when the API search finds nothing.
2. A model failure is not a dead end. `src/model/fallback.ts` puts any model in front of the keyword router:
   an HTTP error, no network or a 30-second timeout (new in `anthropic.ts`) and the router answers the same
   turn. The server logs the cause; `GET /api/status` has `modelFallback: { at, reason }` with keys masked,
   cleared once the model answers again.
3. What the owner sees. No variable names, HTTP codes or «fixtures» on the page: voice on fixtures disables
   the mic with one line; a real recording on such a stand answers 409 with that line; any other failure
   answers «Сейчас не получилось ответить…» and logs the cause; a failed tool says «Не удалось прочитать
   данные магазина, попробуйте чуть позже.»; the model part of the header reads «выключена» or «недоступна,
   отвечает разбор по словам»; the «Запросы: find_products» line became «Посмотрел: каталог».
4. README: «Stand on a Mac without Docker» — `node src/server.ts` with the env variables, `STAND_PASSWORD`
   required once a key is set, `MODEL_PROVIDER=rules`, the fallback and where its cause is.

## Checks (boat, Node 26.8.1)

- `node --test src/*.test.ts src/**/*.test.ts` in `apps/owner-voice`: 40 of 40 pass. New or rewritten: ё on
  fixtures and on a shop whose `q` does not fold ё, the router with «мумие», Anthropic 400 «credit balance is
  too low» through a fetch stub at provider level and through the app and its status, key masking, the 409
  voice line, the plain tool-failure sentence.
- `node scripts/fixture-run.ts`: works, sales summary answered, 38 KB reply wav.
- `tsc --noEmit` with TypeScript 5.8 and `@types/node@22` installed in a scratch folder (the worktree has no
  `node_modules`): clean. TypeScript 5.6, the floor in `package.json`, rejects `erasableSyntaxOnly` in
  tsconfig; that was so before this change.
- Live: on the running stand «сколько стоит мумие» found the мумиё product on the real cherkashino.com Store API.

## Deviations, said plainly

- `ui-task.mjs` and `run-queue.mjs` do not exist on boat (`/Users/ivanprotsko/upready/projects/devops/staff/tools/`
  holds neither), so the pack step was skipped and the short test runs (under a second) ran directly.
- Biome was not run: it is not installed in this worktree.
- No Anthropic or ElevenLabs key was used: the fallback is proven by the fetch stub, not by a live call.
