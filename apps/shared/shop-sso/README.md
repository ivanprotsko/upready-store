# @upready/shop-sso

The school's half of the shop sign-in (t-2026-10-08-36). The shop at `cherkashino.ru` signs the
buyer in, and the school at `school.cherkashina.ru` keeps no login of its own. You import this
package on the school's server. It has no runtime dependencies and ships TypeScript source.

## The Sign-In Runs in Five Steps

1. The school's `/login` redirects to `buildLoginUrl({ shopOrigin, schoolOrigin, next })`, which is
   `https://cherkashino.ru/api/school-sso?return_to=<encoded https://school.cherkashina.ru/auth/callback?next=<path>>`.
2. The shop signs the buyer in if needed and redirects to `<return_to>&code=<code>`. The code is
   single use and expires after 60 seconds.
3. The school's `/auth/callback` calls `exchangeCode({ backendUrl, publishableKey, code })` on its
   server and gets `{ token }`, the buyer's shop token. It sets the cookie with
   `serializeSchoolJwtCookie(token)` and redirects to `safeNextPath(next)`.
4. Every call to the shop's API goes from the school's server with `shopApiHeaders({ token,
   publishableKey })`. The browser never calls the shop's API.
5. Sign-out sets `clearSchoolJwtCookie()`. The shop's own session stays.

## What the Shop Has to Allow

The shop mints a code only for a callback on a host its `SCHOOL_SSO_RETURN_HOSTS` lists, on the
backend and on the storefront alike. `exchangeCode` throws a `ShopSsoError` with `status` 401 for a
code that is unknown, expired, already used or minted for another shop, 400 for a missing code and 0
when the shop does not answer.

## The Cookie

`school_jwt` is `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` and has no `Domain`, so it stays on
the school's own host. It lives seven days, as long as the shop's `_medusa_jwt`. The token inside
expires on the shop's own schedule (`jwtExpiresIn`), and a call with an expired token answers 401.
Send the buyer through `/login` again when that happens.

## Commands

```bash
pnpm --filter @upready/shop-sso typecheck
pnpm --filter @upready/shop-sso test
```
