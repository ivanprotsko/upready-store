# Sign in with Yandex ID

Buyers of a shop on this platform can sign in with a Yandex account instead of
an email and a password. The provider is a Medusa auth provider, so it is
reusable for any future actor type, and it is off until a deployment sets its
credentials.

## How the flow runs

The buyer's browser never talks to Medusa directly. Both legs are server to
server, and the storefront is what holds the session cookie.

```text
login page
  └─ GET /api/yandex-login?return=/ru/account
       └─ POST /auth/customer/yandex  { callback_url, tenant, locale, return_to, nonce }
            └─ { location: https://oauth.yandex.ru/authorize?… }
       ◄─ 302 to the consent screen, + httpOnly cookies _yandex_return and _yandex_nonce

Yandex consent screen
  └─ 302 to <storefront origin>/api/yandex-callback?code&state

  GET /api/yandex-callback
    1. the nonce inside `state` must equal the _yandex_nonce cookie
    2. GET  /auth/customer/yandex/callback?code&state   → Medusa JWT
    3. first login: POST /store/customers/oauth-link    → attach an existing account
                    else POST /store/customers          → create one
                    then POST /auth/token/refresh       → a JWT carrying the customer id
    4. set _medusa_jwt, move the anonymous cart onto the customer
    5. 302 back to `return_to`
```

## The pieces

| Path | What it is |
|---|---|
| [apps/backend/src/modules/auth-yandex](../apps/backend/src/modules/auth-yandex) | the provider: `services/yandex.ts`, the OAuth helpers in `lib/oauth.ts`, the signed state in `lib/state.ts` |
| [apps/backend/medusa-config.ts](../apps/backend/medusa-config.ts) | registers it next to `emailpass`, only when `YANDEX_CLIENT_ID` is set |
| [apps/backend/src/api/store/customers/oauth-link/route.ts](../apps/backend/src/api/store/customers/oauth-link/route.ts) | attaches the Yandex identity to the account that already owns its email |
| [apps/storefront/src/app/api/yandex-login](../apps/storefront/src/app/api/yandex-login) | leg 1, asks Medusa for the consent URL and redirects |
| [apps/storefront/src/app/api/yandex-callback](../apps/storefront/src/app/api/yandex-callback) | leg 2, the Redirect URI, sets the session |
| [apps/storefront/src/modules/account/components/yandex-login](../apps/storefront/src/modules/account/components/yandex-login) | the control on the login page |

## Four things that are easy to get wrong

**Declaring the auth module replaces Medusa's own.** `resolveModules` in
`@medusajs/utils/dist/common/define-config.js` adds the auth module with
`providers: [{ resolve: "@medusajs/medusa/auth-emailpass", id: "emailpass" }]`,
and `transformModules` keys modules by service name with the last entry winning.
So the provider list in `medusa-config.ts` is the whole list. Take `emailpass`
out of it and every email-and-password login dies, in the storefront and in the
owner panel at once.

**Yandex issues no `id_token`.** Unlike Google there is no JWT to verify against
a JWKS. The code is exchanged for an opaque access token and the identity is
proved by a server-to-server call to `https://login.yandex.ru/info?format=json`,
which uses the `OAuth` authorization scheme and not `Bearer`.

**The `state` is signed, not stored.** `AuthIdentityProviderService` offers
`setState`/`getState` and the Google provider uses them, but that store is the
cache module, which is in-memory without `REDIS_URL`, and it cannot carry the
tenant, the locale and the return path. Here the state is the payload, signed
with HMAC-SHA256 under `JWT_SECRET` (else `COOKIE_SECRET`) and valid for ten
minutes, which is how long a Yandex code lives. A signature alone is not a CSRF
guard, so the storefront writes the state's `nonce` into an httpOnly cookie and
the callback refuses a state carrying a different one.

**Every redirect goes to the buyer's address, not to the URL Next parsed.**
The image starts the standalone server with `HOSTNAME=0.0.0.0 PORT=8000`
([Dockerfile](../apps/storefront/Dockerfile)) behind traefik, and in a route
handler there `req.nextUrl.origin` is that bind address,
`https://0.0.0.0:8000`. A callback built on it set `_medusa_jwt` on the shop's
host and then sent the buyer to `https://0.0.0.0:8000/ru/account` (measured on
olavka.com on 2026-09-25). Both route handlers therefore build every redirect
on `requestOrigin` from
[lib/tenant/origin.ts](../apps/storefront/src/lib/tenant/origin.ts), which reads
the Host header and `x-forwarded-proto`, and the login leg builds the callback
URL it hands to Yandex on the same value. `req.nextUrl.origin` is the fallback
for a request with no Host only. The cookies' `Secure` flag follows the same
scheme (`requestScheme`), so a stand on plain http still reads its cookies back.
Keep `req.nextUrl.origin` out of any new redirect in these two files.

## What the Yandex application has to have

Register at <https://oauth.yandex.ru/client/new/id/>. Two settings decide
whether the login works at all.

**Permissions.** `login:email` and `login:info`, optionally `login:avatar`.
Without `login:email` the profile carries no address, a Medusa customer cannot
exist without one, and the login fails with «Yandex did not share an email
address» rather than creating a broken account.

**Redirect URI, one per storefront host, character for character.** Yandex
matches the value the flow sends against this list exactly, so it carries no
locale and no query string. The path is always `/api/yandex-callback`.

```text
https://cherkashino.ru/api/yandex-callback
https://www.cherkashino.ru/api/yandex-callback
https://xn--80ajkgrgj8cn.xn--p1ai/api/yandex-callback     ← черкашино.рф
https://cherkashino.shipshift.dev/api/yandex-callback     ← the platform subdomain
http://localhost:3101/api/yandex-callback                 ← a local stand, see Checking it
```

The last line matches nothing until somebody starts a storefront on that port;
it is registered so a developer can walk the whole flow on their own machine.
The fourth is the shape every other shop on the platform needs too,
`https://<handle>.shipshift.dev/api/yandex-callback`, plus each custom domain a
shop connects. That is the cost of this design, and the alternative is written
down here rather than left implied.

> **Trade-off, one callback per host against one callback for the platform.**
> The storefront owning the callback is what lets it set the httpOnly session
> cookie on its own origin, which is the thing that makes the session work. The
> price is a Redirect URI per shop host, added by hand in the Yandex
> application. The other shape is a single backend-owned callback on
> `shipshift.dev` that reads the tenant out of the signed `state` and forwards
> the buyer to that shop's own origin with a one-time ticket. It scales to any
> number of shops with one registration, and it costs an extra redirect plus a
> ticket exchange nobody has built yet. Worth taking when the platform has more
> shops than a person wants to register by hand; not worth it for the first one.

## Switching it on

Backend, `apps/backend/.env` (all of it in `.env.template`):

```bash
YANDEX_CLIENT_ID=…            # empty = the provider is never registered
YANDEX_CLIENT_SECRET=…
YANDEX_CALLBACK_URL=https://cherkashino.ru/api/yandex-callback
YANDEX_CALLBACK_ORIGINS=https://www.cherkashino.ru,https://xn--80ajkgrgj8cn.xn--p1ai
YANDEX_FORCE_CONFIRM=true     # show the account picker on a shared browser
```

Storefront, `apps/storefront/.env`:

```bash
NEXT_PUBLIC_YANDEX_LOGIN_ENABLED=true
```

Both sides or neither. With only the backend set the control never renders;
with only the storefront set the button appears and reports that the store has
not switched the feature on. With neither, the login page is exactly what it was.

A half-filled backend block (an id with no secret, or no callback URL) fails at
boot with the name of the variable that is missing, rather than at a buyer's
consent screen.

## Checking it

The two suites need no server of their own:

```bash
cd apps/backend
pnpm test:unit -- src/modules/auth-yandex          # the URL, the state, the mapping
pnpm test:integration:http -- integration-tests/http/auth-yandex.spec.ts
```

The integration suite needs the Yandex variables in the environment, because
without them the provider is not registered and there is nothing to measure. It
asserts that too, rather than passing quietly on an empty configuration.

Everything below talks to a stand you have to start first. Bring up the backend
(`cd apps/backend && corepack pnpm dev`, which reads `PORT` from its `.env`) and
the storefront (`cd apps/storefront && npx next dev -p 3101`), then:

```bash
curl -sS -X POST http://127.0.0.1:9042/auth/customer/yandex \
  -H 'content-type: application/json' \
  -d '{"callback_url":"http://localhost:3101/api/yandex-callback"}' | jq -r .location
```

The browser leg is `apps/storefront/tests/stands/yandex-login.pw.ts`: the
control is on the login page and pressing it lands on the Yandex consent screen
with this application's parameters. It stops there deliberately — completing a
sign-in needs a real Yandex account, and no automated suite should drive one.

## Open, and deliberately so

- **The buyer is a store-wide row.** There is no tenant-customer link on this
  platform: a shop owns a buyer exactly when one of the shop's own orders names
  them (`apps/backend/src/api/tenants/customers/helpers.ts`). So `oauth-link`
  matches on email across the store, which is what `emailpass` login already
  does for the same person. Narrowing either to one tenant needs that link to
  exist first.
- **The brand button.** Yandex asks for its own mark and colour on the control.
  `yandex-mark.tsx` is a stand-in in the store's shape and lives in its own file
  so the swap touches nothing else.
- **Guest rows.** A `has_account: false` customer minted by a guest checkout is
  not a link target. Those orders reach the new account through
  `/store/customers/me/claim-orders`, which the callback's own login already
  triggers on the storefront side.
