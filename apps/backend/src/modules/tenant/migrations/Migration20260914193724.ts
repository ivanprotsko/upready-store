import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Per-tenant integration secrets (t03-tenant-secrets-robokassa): one encrypted
 * row per (tenant, provider), `models/tenant-integration-secret.ts`. The
 * payload is AES-256-GCM ciphertext under `INTEGRATION_ENCRYPTION_KEY`; a plain
 * `select` on this table shows base64, never a password.
 *
 * Hand-trimmed from `medusa db:generate tenant`: the checked-in snapshot lagged
 * behind `Migration20260912061500`, so the generator also re-emitted the
 * handle-alias table and `tenant_domain.is_primary`, and opened with a
 * `drop constraint` on a table that does not exist yet. Only the statements of
 * the new table are kept; the snapshot itself is regenerated in full.
 */
export class Migration20260914193724 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_integration_secret" ("id" text not null, "provider" text check ("provider" in ('robokassa')) not null, "payload" text not null, "is_test" boolean not null default true, "is_enabled" boolean not null default true, "tenant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_integration_secret_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_integration_secret_tenant_id" ON "tenant_integration_secret" ("tenant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_integration_secret_deleted_at" ON "tenant_integration_secret" ("deleted_at") WHERE deleted_at IS NULL;`);
    // One row per provider per shop, and only while the row is alive.
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_integration_secret_tenant_id_provider_unique" ON "tenant_integration_secret" ("tenant_id", "provider") WHERE deleted_at IS NULL;`);
    this.addSql(`alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_tenant_id_foreign" foreign key ("tenant_id") references "tenant" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_integration_secret" cascade;`);
  }

}
