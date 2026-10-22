# Owner cabinet (t-2026-10-20-23)

One owner, several sales sources — shops on two instances and their Wildberries and Ozon accounts:
«Сводка» across them with a page per source, the «…» switch without a second sign-in, and a server
in Russia that passes on totals only, fetched when a page loads.

- [architecture.md](architecture.md) — identity in Russia, the signed ticket, the relay, threats,
  numbers, the boundary with the central platform panel, legal points.
- [contract/](contract/) — `shop-summary.v1` (what crosses between instances, one per sales source) and
  `owner-summary.v1` (what the panel reads), synthetic examples from `make-examples.mjs`, checked by
  `node --test docs/owner-cabinet/contract/contract.test.mjs`.
- [stage-2-plan.md](stage-2-plan.md) — the code split into PR-sized slices with estimates, and the
  questions for Ivan.
- Prototype: `artifacts/mockups/2026-10-20-owner-cabinet/` — JSON screens, plain components, the
  panel's own theme; `node artifacts/mockups/2026-10-20-owner-cabinet/build.mjs [--publish]`.
