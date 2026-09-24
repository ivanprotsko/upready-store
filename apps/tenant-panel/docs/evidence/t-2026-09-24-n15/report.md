# Evidence · t-2026-09-24-n15 · tenant-panel: «Баннеры на главной» editor (rule 27f)

The panel on http://localhost:5391 (own backend :9251, database `upready_store_w15_n15`, owner of tenant
`cherkashino` logged in), screen `/home-settings`, section «Баннеры на главной». Shots by Playwright/Chromium,
three widths (1440, 768, 390), two themes (`light`, `dark` via the panel's own `medusa_admin_theme`
localStorage key).

| Group | What it shows |
|---|---|
| `banners-editor/list/` | The whole section with the fixture's two banners: hint, the rows in their order (move up / move down / remove on each), «Добавить баннер». |
| `banners-editor/edit-product-link/` | Banner 1 («Чистка печени»): picture address + «Загрузить», alt, the four corner texts, «Открывает: Товар» with the product combobox («Очищение печени»), the live preview card. |
| `banners-editor/edit-url-link/` | Banner 2 («Чистка лимфы»): the same fields with «Открывает: Ссылку» and the address `/ru/store`. |
| `banners-editor/validation-error/` | Banner 2 with the address changed to `store` (neither `http(s)://` nor a site path): the row shows the error under the fields; Save is blocked with a toast until it is fixed. |

Saving goes through the screen's own Save (`PUT /tenants/home`, the whole document); the backend re-validates
(`HomeBannerSchema`: texts ≤ 60 chars, `href` rule, product must be the tenant's own, ≤ 10 banners) and then
calls the storefront's `/api/revalidate` with `{type: "tenant.home", handle}` — the same path every other
home-settings change takes. Pictures upload through `POST /tenants/uploads` (`uploadTenantFile`, the hero
image's path).
