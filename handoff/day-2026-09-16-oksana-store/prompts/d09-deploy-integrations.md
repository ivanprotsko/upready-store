# d09-deploy-integrations — deploy the p01 wave (settings restructure) to the live host, then accept as the owner

Ivan's order (2026-09-16 20:22 WITA): the connection screens move to `/settings/integrations/<service>` and the marketplace pages to `/settings/marketplaces/{wildberries,ozon}` (task p01-settings-integrations-restructure, merged into dev before this task starts). Ivan connected the Wildberries key on the LIVE panel himself at ~20:00 WITA — that stored key MUST survive the deploy untouched and MUST show as connected on the new pages without re-entry.

Procedure = `prompts/d08-deploy-wave6.md` — read it in full and follow it step by step (pg_dump FIRST, env by names only, build marker, migrations, nothing destructive, no INFRA_OK without Ivan). Differences from d08:
- The wave is whatever `origin/dev` holds beyond the d08 deploy marker (measure with `git log <d08-sha>..origin/dev --oneline`); list it in the report.
- New migration(s) from p01 (ApiShip slot in the `provider` CHECK) — run them; verify the `tenant_integration_secret` rows of cherkashino BEFORE and AFTER by count and provider only (never the payload).
- Acceptance on the live panel as the owner (login from `/Users/ivanprotsko/upready/.private/upready-store-day-2026-09-16/cherkashino-owner.md`, value never in the report): `/settings/integrations` shows Wildberries «подключено ••••last4» with rights/expiry, the other four with their real state; `/settings/marketplaces/wildberries` shows the loaded tables; old URLs redirect; the sidebar has no anchor items. Frames 1280×900 outside git (the d08 `.gitignore` pattern).
- Storefront unaffected — one curl of `/ru` and one product page = 200 before and after.
Report: `artifacts/docs/d09-deploy-integrations/report.md` with the same §§ as d08 (§9 what is not proven, §10 what to tell Ivan, §Экономия).
