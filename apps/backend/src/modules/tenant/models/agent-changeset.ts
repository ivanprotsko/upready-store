import { model } from "@medusajs/framework/utils";

/**
 * One batch of changes the shop owner's agent proposed (t-2026-10-27-04,
 * `src/agent-changesets/README.md`).
 *
 * The agent never writes to the shop directly. It records what it wants to do
 * as `ops`, each one a `/tenants/*` write the panel itself could send, and the
 * owner moves the batch along:
 *
 *   draft → staged → published → rolled_back
 *     ↘ discarded (from draft or staged)
 *
 * `staged` means the ops ran on the stage site (`stage_tenant_id`), or are
 * overlaid on it for a product, which the group shares. `published` means they
 * ran on the main site, after `snapshot` recorded what they replaced and before
 * `published_hashes` recorded what they wrote. A rollback writes `snapshot`
 * back, and only when the sha256 of the live values still equals
 * `published_hashes`, so nobody's later edit is overwritten silently.
 *
 * `tenant_id` and `stage_tenant_id` are plain columns, the way
 * `telegram_bot_update` keeps its tenant: every reader has the tenant id in
 * hand already. Published rows are hard-deleted 90 days after publishing by
 * `src/jobs/agent-changeset-cleanup.ts`.
 */
const AgentChangeset = model
  .define("agent_changeset", {
    id: model.id({ prefix: "achg" }).primaryKey(),
    tenant_id: model.text(),
    stage_tenant_id: model.text().nullable(),
    // Who asked: the `tenant_admin` row behind the token, and which client
    // carried the request.
    author_admin_id: model.text(),
    author_email: model.text().nullable(),
    source: model.enum(["owner-voice", "telegram", "panel"]),
    summary: model.text().nullable(),
    ops: model.json(),
    status: model.enum(["draft", "staged", "published", "rolled_back", "discarded"]).default("draft"),
    // What the ops replaced on main, one entry per op, written before publish.
    snapshot: model.json().nullable(),
    // sha256 of the values the ops left on main, one entry per op.
    published_hashes: model.json().nullable(),
    // What each step answered: created ids, errors, the drift a refused
    // rollback found.
    result: model.json().nullable(),
    staged_at: model.dateTime().nullable(),
    published_at: model.dateTime().nullable(),
    rolled_back_at: model.dateTime().nullable(),
    discarded_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["tenant_id", "status"] }, { on: ["published_at"] }]);

export default AgentChangeset;
