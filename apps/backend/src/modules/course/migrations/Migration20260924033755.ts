import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260924033755 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "course_progress" drop constraint if exists "course_progress_tenant_id_customer_id_lesson_id_unique";`);
    this.addSql(`alter table if exists "course_entitlement" drop constraint if exists "course_entitlement_tenant_id_order_id_course_id_unique";`);
    this.addSql(`alter table if exists "course" drop constraint if exists "course_tenant_id_slug_unique";`);
    this.addSql(`alter table if exists "course" drop constraint if exists "course_tenant_id_product_id_unique";`);
    this.addSql(`create table if not exists "course" ("id" text not null, "tenant_id" text not null, "product_id" text not null, "title" text not null, "slug" text not null, "description" text null, "status" text check ("status" in ('draft', 'published')) not null default 'draft', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "course_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_course_deleted_at" ON "course" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_course_tenant_id_product_id_unique" ON "course" ("tenant_id", "product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_course_tenant_id_slug_unique" ON "course" ("tenant_id", "slug") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_course_tenant_id_status" ON "course" ("tenant_id", "status") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "course_entitlement" ("id" text not null, "tenant_id" text not null, "customer_id" text not null, "course_id" text not null, "order_id" text null, "granted_at" timestamptz not null, "status" text check ("status" in ('active', 'revoked')) not null default 'active', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "course_entitlement_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_course_entitlement_deleted_at" ON "course_entitlement" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_course_entitlement_tenant_id_customer_id_course_id" ON "course_entitlement" ("tenant_id", "customer_id", "course_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_course_entitlement_tenant_id_order_id_course_id_unique" ON "course_entitlement" ("tenant_id", "order_id", "course_id") WHERE deleted_at IS NULL AND order_id IS NOT NULL;`);

    this.addSql(`create table if not exists "course_progress" ("id" text not null, "tenant_id" text not null, "customer_id" text not null, "course_id" text not null, "lesson_id" text not null, "viewed_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "course_progress_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_course_progress_deleted_at" ON "course_progress" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_course_progress_tenant_id_customer_id_lesson_id_unique" ON "course_progress" ("tenant_id", "customer_id", "lesson_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_course_progress_tenant_id_customer_id_course_id" ON "course_progress" ("tenant_id", "customer_id", "course_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "lesson" ("id" text not null, "tenant_id" text not null, "course_id" text not null, "title" text not null, "order" integer not null, "body" text not null, "video_url" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "lesson_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_lesson_deleted_at" ON "lesson" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_lesson_tenant_id_course_id_order" ON "lesson" ("tenant_id", "course_id", "order") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "course" cascade;`);

    this.addSql(`drop table if exists "course_entitlement" cascade;`);

    this.addSql(`drop table if exists "course_progress" cascade;`);

    this.addSql(`drop table if exists "lesson" cascade;`);
  }

}
