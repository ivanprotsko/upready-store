import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * t11-seo-redirects: one `tenant_redirect` row per path-for-path 301 (or other
 * status) a shop's storefront serves, whether from a handle change or an
 * imported old-shop URL table.
 */
export class Migration20260916050000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_redirect" ("id" text not null, "from_path" text not null, "to_path" text not null, "status_code" int not null default 301, "tenant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_redirect_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_redirect_tenant_id_from_path_unique" ON "tenant_redirect" ("tenant_id", "from_path") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_redirect_deleted_at" ON "tenant_redirect" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`alter table if exists "tenant_redirect" add constraint "tenant_redirect_tenant_id_foreign" foreign key ("tenant_id") references "tenant" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_redirect" cascade;`);
  }

}
