import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * The shop's address becomes changeable (`t-2026-09-12-tenant-address-canonical`,
 * `specs/tenant-address/CANONICAL.md`): every handle a shop has ever answered on
 * is kept, and one of its custom domains can be marked as the main public address.
 */
export class Migration20260912061500 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_handle_alias" ("id" text not null, "handle" text not null, "tenant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_handle_alias_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_handle_alias_handle_unique" ON "tenant_handle_alias" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_handle_alias_tenant_id" ON "tenant_handle_alias" ("tenant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_handle_alias_deleted_at" ON "tenant_handle_alias" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`alter table if exists "tenant_handle_alias" add constraint "tenant_handle_alias_tenant_id_foreign" foreign key ("tenant_id") references "tenant" ("id") on update cascade;`);

    this.addSql(`alter table if exists "tenant_domain" add column if not exists "is_primary" boolean not null default false;`);
    // One main address per shop, and only while the row is alive. A partial
    // index rather than a check: two panels flipping two domains in the same
    // second must have one of them lose, not both win.
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_domain_primary_per_tenant" ON "tenant_domain" ("tenant_id") WHERE deleted_at IS NULL AND is_primary = true;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_tenant_domain_primary_per_tenant";`);
    this.addSql(`alter table if exists "tenant_domain" drop column if exists "is_primary";`);
    this.addSql(`drop table if exists "tenant_handle_alias" cascade;`);
  }

}
