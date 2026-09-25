import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260925043608 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "platform_pricing" drop constraint if exists "platform_pricing_handle_unique";`);
    this.addSql(`create table if not exists "platform_pricing" ("id" text not null, "handle" text not null, "document" jsonb not null, "revision" integer not null default 1, "updated_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "platform_pricing_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_platform_pricing_handle_unique" ON "platform_pricing" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_platform_pricing_deleted_at" ON "platform_pricing" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "platform_pricing" cascade;`);
  }

}
