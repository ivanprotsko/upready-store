import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * The seller's legal details (t12-legal-requisites):
 * `models/tenant-requisites.ts`. One row per tenant, holding the 15 stored
 * `{{ТОКЕН}}` values a page body may carry plus `phone_confirmed` and
 * `bank_details`; `{{ДОМЕН_САЙТА}}`, the 16th token, has no column here (it is
 * resolved from `tenant_domain` at render time).
 *
 * Hand-written in the shape `medusa db:generate tenant` emits, the way
 * `Migration20260915045704` was: the generator re-emits unrelated statements
 * whenever the checked-in snapshot lags, and only this table's statements
 * belong in this file.
 */
export class Migration20260915063900 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_requisites" ("id" text not null, "legal_name" text null, "inn" text null, "ogrn" text null, "legal_address" text null, "return_address" text null, "phone" text null, "phone_confirmed" boolean not null default false, "email" text null, "dpo_email" text null, "delivery_methods" text null, "effective_date" text null, "revision_date" text null, "document_date" text null, "rkn_notice_date" text null, "rkn_reg_number" text null, "newsletter_management_url" text null, "bank_details" text null, "tenant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_requisites_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_requisites_deleted_at" ON "tenant_requisites" ("deleted_at") WHERE deleted_at IS NULL;`);
    // One row per shop, and only while the row is alive.
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_requisites_tenant_id_unique" ON "tenant_requisites" ("tenant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`alter table if exists "tenant_requisites" add constraint "tenant_requisites_tenant_id_foreign" foreign key ("tenant_id") references "tenant" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_requisites" cascade;`);
  }

}
