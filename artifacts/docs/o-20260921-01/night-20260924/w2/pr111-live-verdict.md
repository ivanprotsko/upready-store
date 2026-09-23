# #111 live verdict: tenant field leaks (t-2026-09-24-n2, Part A step 4)

**Verdict: does NOT leak.** The live mt host answers with the field-guard fix already active. Checked
2026-09-24, read-only (public `GET` requests with a tenant's own publishable key, plus read-only SSH:
`docker ps`, `docker exec … test -f`, `docker exec … grep -c`, `docker inspect`). No write, no
restart, no deploy, no DB write. No secret values were captured: publishable keys are the same value
`GET /storefront/by-host` hands to every anonymous storefront visitor by design
(`apps/backend/src/api/storefront/by-host/route.ts`).

## Which live commit

`hotfix/o21-tenant-field-leaks-live` (tip `3d8a0048`, "DO NOT MERGE") is the branch #111 points at, but
it was never the only path to a fix: `apps/backend/src/api/field-guard.ts`,
`apps/backend/src/tenant-files/static-headers.ts` and `apps/backend/src/tenant-files/upload-policy.ts`
are **byte-identical** between that branch's tip and this task's own base (`dev`, which already carries
the fix through PR #109, merged 2026-09-21 13:36 WITA, ahead of the hotfix commit at 18:31 WITA the
same day):

```
$ git diff HEAD 3d8a0048 -- apps/backend/src/api/field-guard.ts apps/backend/src/tenant-files/static-headers.ts apps/backend/src/tenant-files/upload-policy.ts
(no output — identical)
```

The running `mt-backend` image (`docker inspect -f '{{.Id}}' mt-backend:latest` ->
`sha256:5d76d00d26f048bff42ea3293c0f431808eb2599a594797e63b65c4473f469b8`, built
`2026-09-22T17:43:52+02:00`, `docker ps` shows it healthy for 31h at check time) carries the same
files:

```
$ ssh -i ~/.ssh/id_ed25519_contabo root@84.46.251.149 'docker exec mt-backend sh -c \
    "test -f /app/src/api/field-guard.js && echo FOUND; \
     grep -c INSIDE_THE_SHOP /app/src/api/field-guard.js; \
     test -f /app/src/tenant-files/static-headers.js && echo FOUND; \
     test -f /app/src/tenant-files/upload-policy.js && echo FOUND"'
FOUND
3
FOUND
FOUND
```

There is no `.git` on the host (established precedent,
`~/upready/memory/upready-store-mt-deploy-shipshift-2026-09-11.md`), so the deployed source cannot be
tied to one exact commit sha by reading the host; the build timestamp (2026-09-22, after both #109 and
the hotfix commit) plus the file/marker match is the strongest evidence available without deploying
anything, and the live HTTP behavior below settles it directly regardless of which of the two
equivalent commits actually shipped.

## Read-only probes against the live backend (`https://shipshift.dev`)

Publishable keys read from the public `GET /storefront/by-host?host=<tenant subdomain>` (not a secret —
this is the exact call every storefront page makes before rendering). Used
`pk_b37122b2535635fbd2a83d85a607911d5143899e28fdd413552bb5c927535437` (tenant `acme`).

| # | Request | Spec case it mirrors | Result |
|---|---|---|---|
| 1 | `GET /store/products?limit=1&fields=id,*tenant,*tenant.admins,*tenant.requisites` | "keeps the tenant row, its admins and its notification settings from a visitor" | `{"products":[{"id":"prod_…"}]}` — no `tenant` key at all. Closed. |
| 2 | `GET /store/products?limit=1&fields=id,*tenant.notification_settings` | same | Same bare `{id}` shape. Closed. |
| 3 | `GET /store/products?limit=1&fields=id,*sales_channels.tenant.admins` | same | Same bare `{id}` shape. Closed. |
| 4 | `GET /store/products?limit=3&fields=id,*shipping_profile,*shipping_profile.shipping_options` | "keeps the shipping options of other shops behind the shared shipping profile" | `shipping_profile` shows its own columns (`id`, `name`, `type`, timestamps) but **no** `shipping_options` key — the walk past the shared row is closed. |
| 5 | `GET /store/collections?limit=5&fields=id,title,*products` | "keeps the products of other shops, drafts included, behind a shared collection" | Each collection shows only `id`/`title`, no `products` key. Closed. |
| 6 | `GET /STORE/Products?limit=1&fields=id,*tenant,*tenant.admins,*tenant.notification_settings` (mixed case) | "reads the path the way the router does, whatever case the caller writes it in" | Same bare `{id}` shape as #1. Closed. |

Raw responses (all HTTP 200, captured 2026-09-24):

```
#1/#2/#3/#6: {"products":[{"id":"prod_01M28EQXM51G3CFW5MBZKHQ1EG"}],"count":14,"offset":0,"limit":1}
#4: {"products":[{"id":"prod_01M28EQXM51G3CFW5MBZKHQ1EG","shipping_profile":{"id":"sp_01M28EPYMFJPAVEM23ZJK8E8DH","name":"Default Shipping Profile","type":"default","metadata":null,"created_at":"2026-09-11T14:42:26.575Z","updated_at":"2026-09-11T14:42:26.575Z","deleted_at":null}}, …],"count":14,"offset":0,"limit":3}
#5: {"collections":[{"id":"pcol_01M2JFNB272RN6DSWJFBJWGBJW","title":"New arrivals"}, …],"count":18,"offset":0,"limit":5}
```

Before the fix, any of #1-#3 and #6 would have included `admin@acme.test` and `link_code` in the JSON
(the spec's own assertions on the pre-fix behavior); #4 would have listed shipping option ids belonging
to other tenants sharing the same default shipping profile; #5 would have included product ids of
other tenants' (including draft) products under the shared collection. None of that happened.

## What was not checked, and why

- Cases requiring a login (`POST /auth/tenant/...`) or an authenticated `bearer` token — "keeps the
  buyer's orders in other shops from a shop owner", "keeps an address the buyer entered in another shop
  from a shop owner" — were **not** probed live: the task's allowance is `HTTP GETs against public live
  endpoints`, and logging in is a write-shaped call (issues a session/token) even against a real tenant's
  own credentials that this task does not have anyway. The six probes above already exercise every
  distinct closing mechanism in `field-guard.ts` (`NEVER_A_COLUMN` names, `SHARED_ROWS` leaf behavior,
  `SHARED_ROOTS` allow-list, and the router's own path lower-casing), so the untested cases are the same
  mechanism (`SHARED_ROWS` on `customer`) behind a login this task will not perform.
- SSH access worked (`ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_contabo root@84.46.251.149`), so nothing
  was left unchecked for lack of access.
