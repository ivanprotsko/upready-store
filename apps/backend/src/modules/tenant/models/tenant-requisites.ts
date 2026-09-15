import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";

/**
 * The seller's legal details of ONE shop (t12-legal-requisites), used to fill
 * the `{{ТОКЕН}}` placeholders left in a tenant's legal pages (offer, privacy,
 * contacts — `src/tenant-legal/requisites.ts` is the resolver). Every field is
 * optional: nobody may invent a seller's registration data, and an unfilled
 * field is what drives the panel's "не заполнено" list rather than a blocked
 * save.
 *
 * `{{ДОМЕН_САЙТА}}` has no column here on purpose — it is resolved from the
 * tenant's own primary host (`primaryHostFor`, `api/storefront/by-host/hosts.ts`)
 * at render time, the same source `canonical`/`sitemap`/`og:url` already use, so
 * a stored copy could never drift from the address the shop actually answers on.
 *
 * `bank_details` carries no placeholder of its own (the 16-token list the
 * migration report carried forward has none): it is a field the step plan asks
 * for so an owner who wants bank details public has somewhere to put them: the
 * panel shows it, nothing resolves it into a page yet.
 */
const TenantRequisites = model
  .define("tenant_requisites", {
    id: model.id({ prefix: "treq" }).primaryKey(),

    /** `{{ФИО_ИП}}` — legal form and full name, e.g. "ИП Черкашина Оксана Ивановна". */
    legal_name: model.text().nullable(),
    /** `{{ИНН}}` */
    inn: model.text().nullable(),
    /** `{{ОГРНИП}}` (ОГРНИП for a sole proprietor, ОГРН for a legal entity). */
    ogrn: model.text().nullable(),
    /** `{{ЮР_АДРЕС}}` */
    legal_address: model.text().nullable(),
    /** `{{АДРЕС_ВОЗВРАТА}}` — where a returned parcel goes. */
    return_address: model.text().nullable(),

    /** `{{ТЕЛЕФОН}}` */
    phone: model.text().nullable(),
    /**
     * False by default: a phone the owner has not confirmed must not read as a
     * settled fact on a public offer (see the worker brief's cherkashino seed —
     * `+7 (911) 718-01-23` is recorded there as unconfirmed). The panel shows
     * an unconfirmed phone with its own "требует подтверждения" note, and the
     * storefront resolver (`tenant-legal/requisites.ts`, `valuesFromRequisites`)
     * withholds `{{ТЕЛЕФОН}}` entirely while this is false — the page keeps
     * showing the literal token, same as an empty phone, until the owner
     * confirms it.
     */
    phone_confirmed: model.boolean().default(false),
    /** `{{EMAIL}}` */
    email: model.text().nullable(),
    /** `{{EMAIL_ДПО}}` — the data-protection officer's e-mail. */
    dpo_email: model.text().nullable(),

    /** `{{СПОСОБЫ_ДОСТАВКИ}}` — free text, e.g. "СДЭК, Почта России". */
    delivery_methods: model.text().nullable(),

    /** `{{ДАТА_ВСТУПЛЕНИЯ}}` — when the current document took effect. */
    effective_date: model.text().nullable(),
    /** `{{ДАТА_РЕДАКЦИИ}}` — when it was last revised. */
    revision_date: model.text().nullable(),
    /** `{{ДАТА_ДОКУМЕНТА}}` — the date printed on the document itself. */
    document_date: model.text().nullable(),
    /** `{{ДАТА_УВЕДОМЛЕНИЯ_РКН}}` */
    rkn_notice_date: model.text().nullable(),
    /** `{{РКН_РЕГ_НОМЕР}}` — the shop's registration number in the RKN registry of personal-data operators. */
    rkn_reg_number: model.text().nullable(),

    /** `{{ССЫЛКА_УПРАВЛЕНИЯ_РАССЫЛКАМИ}}` */
    newsletter_management_url: model.text().nullable(),

    /** Owner-optional, no placeholder of its own; see the module doc above. */
    bank_details: model.text().nullable(),

    tenant: model.belongsTo(() => Tenant, {
      mappedBy: "requisites",
    }),
  })
  .indexes([
    {
      on: ["tenant_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default TenantRequisites;
