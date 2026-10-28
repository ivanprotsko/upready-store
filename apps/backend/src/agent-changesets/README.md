# Agent changesets

The owner's agent (voice, Telegram, the panel) changes a shop's site through
changesets, never directly (t-2026-10-27-04). A changeset is a list of ops; an
op is the very request the panel would send: `{method, path, body}` on a
`/tenants/*` route.

```
draft ──stage──▶ staged ──publish──▶ published ──rollback──▶ rolled_back
  │                 │
  └─────discard─────┴──▶ discarded
```

| File | What it holds |
| --- | --- |
| `allow-list.ts` | Every write route of `/tenants/*` with its verdict: allowed (kind, fields, roles) or denied (reason). The one place to open or close a route to the agent. |
| `ops.ts` | Per kind: the read that finds an op's target, the fields kept for the snapshot and the hash, the write that restores it. `checkOp`. |
| `loopback.ts` | Runs an op as an HTTP request to this backend under a short token of the caller's own login, so the field guard, the role gate, the validator and the route's workflows all run. |
| `lifecycle.ts` | `createDraft`, `applyToStage`, `publish`, `rollback`, `discard`. |
| `diff.ts` | What an op leaves behind, field by field, for the panel. |
| `overlay.ts` | The stage storefront's preview of product ops, laid over Store answers read with the stage site's key only. |
| `stage.ts` | The metadata keys that tie a main site and its stage site, and the stage host. |
| `cleanup.ts` | Removes changesets published more than 90 days ago (`jobs/agent-changeset-cleanup.ts`). |

Two scopes:

- `site` ops (home, branding, pages, articles) are written to the stage site
  on `stage`, then to the live site on `publish`.
- `product` ops (product fields, prices, characteristics) touch rows the
  sites of a group share, so `stage` writes nothing: the stage storefront shows
  them through `overlay.ts`, and only `publish` writes them.

`publish` snapshots each target first and records a sha256 of what it left.
`rollback` re-reads the targets; if any hash differs, it answers 409 `drift`
with both values and changes nothing.

The stage site itself is made by the `ensure-stage-tenant` workflow
(`POST /tenants/agent-changesets/stage-site`, or
`npx medusa exec ./src/scripts/ensure-stage-site.ts <handle>`).
