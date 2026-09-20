import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";

/**
 * How ONE shop notifies people about its orders (t08-order-notifications).
 *
 * Two channels live here, and neither carries a credential of the shop's own:
 *
 * - E-mail to the customer. The platform's SMTP account does the sending
 *   (`SMTP_*`, one account for every shop), and the owner only decides what the
 *   inbox shows: the sender NAME and a REPLY-TO address of their own. The
 *   `From` address stays the platform's on purpose — a shop cannot make our
 *   server claim to be `@someone-elses-domain`, which is what SPF and DMARC
 *   would reject and what an abuser would ask for first.
 * - Telegram to the owner. The platform bot `@upreadystore_bot` sends; the row
 *   holds the CHAT it sends to, bound by the owner pressing a one-time deep
 *   link (`link_code`). Where a shop's OWN bot token would live is a separate,
 *   still-open question (`q-tg-tenant-token-store`) and nothing here decides it.
 *
 * The last delivery of each channel is kept so the panel can show it. A failure
 * must surface at both ends (rule 20a): the log line carries the order id, and
 * these columns are what the owner sees without reading a log.
 */
const TenantNotificationSettings = model
  .define("tenant_notification_settings", {
    id: model.id({ prefix: "tns" }).primaryKey(),

    /** Display name of the sender, as the customer's inbox shows it. Falls back to the shop's name. */
    email_from_name: model.text().nullable(),
    /** Where a customer's reply goes. Falls back to the platform's `SMTP_REPLY_TO`. */
    email_reply_to: model.text().nullable(),

    /** The Telegram chat the owner linked, as a string: chat ids exceed 2^53 in supergroups. */
    telegram_chat_id: model.text().nullable(),
    /** What to call that chat in the panel: the owner's name, or the group's title. */
    telegram_chat_title: model.text().nullable(),
    telegram_linked_at: model.dateTime().nullable(),

    /**
     * The one-time code behind `https://t.me/<bot>?start=<code>`. Single use and
     * short-lived: cleared the moment the bot redeems it, and refused after
     * `link_code_expires_at`.
     */
    link_code: model.text().nullable(),
    link_code_expires_at: model.dateTime().nullable(),

    /** `ok` or `failed` for the last attempt of each channel, `null` while nothing has been sent. */
    email_last_status: model.text().nullable(),
    email_last_at: model.dateTime().nullable(),
    email_last_error: model.text().nullable(),
    /** The order that attempt was about, as the owner knows it (`display_id`). */
    email_last_order: model.text().nullable(),

    telegram_last_status: model.text().nullable(),
    telegram_last_at: model.dateTime().nullable(),
    telegram_last_error: model.text().nullable(),
    telegram_last_order: model.text().nullable(),

    tenant: model.belongsTo(() => Tenant, {
      mappedBy: "notification_settings",
    }),
  })
  .indexes([
    {
      on: ["tenant_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["link_code"],
      unique: true,
      where: "deleted_at IS NULL AND link_code IS NOT NULL",
    },
  ]);

export default TenantNotificationSettings;
