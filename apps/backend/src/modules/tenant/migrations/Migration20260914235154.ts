import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260914235154 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_product_import" ("id" text not null, "filename" text not null, "bytes" integer not null default 0, "status" text not null default 'pending', "delimiter" text not null default ';', "source" text not null default '', "report" jsonb not null, "confirmed_at" timestamptz null, "tenant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_product_import_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_product_import_tenant_id" ON "tenant_product_import" ("tenant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_product_import_deleted_at" ON "tenant_product_import" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_product_import_tenant_id_created_at" ON "tenant_product_import" ("tenant_id", "created_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "tenant_product_import" add constraint "tenant_product_import_tenant_id_foreign" foreign key ("tenant_id") references "tenant" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_product_import" cascade;`);
  }

}
