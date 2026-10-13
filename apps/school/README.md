# School Cabinet

`apps/school` is the buyer's cabinet of a school on the school's own host, `school.cherkashina.ru/app`
for the first one. A buyer sees the courses they bought in the shop, opens the lessons, watches the
video, reads the text, takes the test and marks a lesson done. React Router 7 renders every page on
the server. The look is the shop's own: the colours of the `supplements` theme preset and Inter.

The school has no sign-in and no database of its own:

- The shop signs the buyer in. `/login` sends them to the shop's `/api/school-sso`, and the shop
  sends them back to `/auth/callback` with a code that lives 60 seconds and works once.
- The school's server trades the code for the buyer's token (`POST /store/tenant/sso/exchange`) and
  keeps the token in the `school_jwt` cookie: httpOnly, Secure, SameSite=Lax, for the school's host
  only. `/logout` removes that cookie and nothing else, so the buyer stays signed in to the shop.
- The courses come from the Store API routes under `apps/backend/src/api/store/tenant/courses`. The
  school's server calls them with the buyer's token and the shop's publishable key. The browser
  never talks to the API.

## Pages

| Path | What it shows |
|---|---|
| `/login` | «Войти», which goes to the shop's sign-in. A buyer with the cookie goes straight on |
| `/auth/callback` | Nothing. It trades the code and redirects to `next`, or back to `/login` with the reason |
| `/logout` | Nothing. It removes `school_jwt` and redirects to `/login` |
| `/app` | My courses, with progress, and the courses whose order still waits for payment |
| `/app/<course>` | The lessons by section, with their covers and summaries, which are done, which open on a later day, and where to continue. The course's Telegram channel and the stream's chat under its title, and «Доступ до …» when the course has an access limit |
| `/app/<course>/<lesson>` | The videos in order, the text, the lesson's files and links, the test when the lesson has one, «Отметить пройденным». A lesson whose day has not come shows the date it opens instead |
| `/app/_media?src=<path>` | Nothing. It asks the backend's media route for one video or file with the buyer's token and redirects the browser to the file |

Every `/app` page without the cookie redirects to `/login?next=<the page>`. A token the API refuses
removes the cookie and does the same.

A video or a file of a lesson lives behind the backend's media route
(`apps/backend/src/api/store/tenant/courses/[id]/media`), which checks that the buyer holds the
course. Only the school's server has the buyer's token, so the lesson page points the browser at
`/app/_media`, and that route passes the media route's redirect on. It accepts nothing but paths of
the media route, so it opens no other part of the API. Its static segment wins over a course slug,
which shadows only a course whose slug is `_media`.

A video remembers where the buyer stopped it, per lesson and per video, in the browser's
`localStorage` (`app/lib/video-resume.ts`).

The proxy sends the school only `/app`, `/login`, `/auth`, `/logout` and `/assets`. The landing owns
`/` on the same host and is a separate service.

## Variables

| Variable | What it is |
|---|---|
| `SCHOOL_DOMAIN` | The school's host, `school.cherkashina.ru`. A value with a scheme is taken as the whole origin, which is how you point it at your machine for local work |
| `SCHOOL_API_BASE` | Where the school's server reaches the Store API. In `deploy/compose.mt.yml` it defaults to the backend of the same host |
| `SCHOOL_PUBLISHABLE_KEY` | The publishable key of the shop whose buyers the school serves |
| `SCHOOL_SHOP_ORIGIN` | The origin of the shop the buyer signs in on, `cherkashino.ru` with its https scheme |
| `PORT` | The port of `pnpm start`, 3000 by default |

A missing variable fails the page with its name, never with a value. The shop's side of the sign-in
has to list `SCHOOL_DOMAIN` in its `SCHOOL_SSO_RETURN_HOSTS`, or it refuses to send the buyer back.

## Fixture Stand

You can open every page without a backend. Set `SCHOOL_FIXTURE=1` and point `SCHOOL_FIXTURE_DIR`
at a folder of Store API answers, and the school reads them instead of calling the API and asks for
no cookie. The four variables above take local values when they are not set.

```bash
SCHOOL_FIXTURE=1 SCHOOL_FIXTURE_DIR=/abs/path/to/fixture pnpm dev
```

The folder holds one file per API path, each `{ "status": 200, "body": { … } }`:
`store/tenant/courses/mine.json`, `store/tenant/courses/mine/<slug>.json` and
`store/tenant/courses/<course>/lessons/<lesson>.json`. Its `media/` folder is served at
`/fixture-media/…` with byte ranges, so a video seeks. That route answers 404 whenever
`SCHOOL_FIXTURE` is not `1`, and the proxy never sends it to the school. `app/lib/fixture.server.ts`
reads both. Never set `SCHOOL_FIXTURE` on a host.

## Commands

`apps/school` installs on its own, with its own lockfile, the way `apps/homepage/port` does. The
root `pnpm-workspace.yaml` excludes it, so the school's dependencies never move a version the
backend or the storefront resolves. Run these from `apps/school`.

```bash
pnpm install
pnpm dev          # the dev server on port 5190
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint app
pnpm test         # vitest: the sign-in, the cookie and every page against a fake Store API
pnpm build        # react-router build into build/
pnpm start        # serves build/ on PORT
```

## Deployment

`apps/school/Dockerfile` builds the image from the repository root. In `deploy/compose.mt.yml` the
service is `school`, container `mt-school`, under the compose profile `school`, so it starts only
with `--profile school` or `COMPOSE_PROFILES=school`. The variables are in
`deploy/mt/ru.env.example`. `deploy/scripts/instance-check.mjs` fails a `SCHOOL_DOMAIN` the instance
profile does not list under `school.domains` and a `SCHOOL_SHOP_ORIGIN` of another instance's shop.

## Three Files Copied From the Rest of the Repo

`app/lib/vendor/markdown.ts` and `app/lib/vendor/lesson-body.ts` are the storefront's own parser of a
lesson's text, copied so a lesson reads the same in the school as in the shop's account. Change the
storefront's copy first, under `apps/storefront/src/lib/util`, and carry the change here.

`app/lib/vendor/shop-sso.ts` is the `@upready/shop-sso` package (`apps/shared/shop-sso/src/index.ts`,
t-2026-10-08-36), with the login address, the code exchange, the `next` rule, the `school_jwt`
cookie and the headers of every call to the Store API. The school's image never sees `apps/shared`,
so it is a copy too. Change the package first and carry the change here. `app/lib/next-path.ts`
narrows the package's `next` rule to a cabinet path under `/app`, `app/lib/sso.ts` turns the
exchange's `ShopSsoError` into the reason `/login` shows, `app/lib/session.server.ts` reads and
writes the cookie through the package, and `app/lib/store-api.server.ts` adds `accept` and the
Russian `x-medusa-locale` to the package's headers.

`pnpm check:shared-markdown` at the repo root fails when any of the three copies drifts.
