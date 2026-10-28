import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * `agent_changeset` (t-2026-10-27-04): the owner's agent's proposed changes,
 * their snapshot of the main site and the hashes a rollback checks
 * (`models/agent-changeset.ts`). Hand-written the way `telegram_bot_update`'s
 * migration is: no model generator ran.
 */
export class Migration20261027120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "agent_changeset" ("id" text not null, "tenant_id" text not null, "stage_tenant_id" text null, "author_admin_id" text not null, "author_email" text null, "source" text check ("source" in ('owner-voice', 'telegram', 'panel')) not null, "summary" text null, "ops" jsonb not null, "status" text check ("status" in ('draft', 'staged', 'published', 'rolled_back', 'discarded')) not null default 'draft', "snapshot" jsonb null, "published_hashes" jsonb null, "result" jsonb null, "staged_at" timestamptz null, "published_at" timestamptz null, "rolled_back_at" timestamptz null, "discarded_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "agent_changeset_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_changeset_deleted_at" ON "agent_changeset" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_changeset_tenant_id_status" ON "agent_changeset" ("tenant_id", "status") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_changeset_published_at" ON "agent_changeset" ("published_at") WHERE deleted_at IS NULL;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "agent_changeset" cascade;`);
  }
}
