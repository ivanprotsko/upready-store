import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import type { IOrderModuleService, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows";
import { randomUUID } from "node:crypto";
import { tenantFilePrefix } from "../../../../../../tenant-files";
import { recordDelivery } from "../../../../../../tenant-notifications/delivery-status";
import { defaultOwnerLocale, ownerText, resolveOwnerLocale } from "../../../../../../tenant-notifications/owner-messages";
import { resolveShopForOrder } from "../../../../../../tenant-notifications/shop";
import { panelOrderUrl } from "../../../../../../tenant-notifications/storefront-origin";
import { botToken, sendTelegramMessage } from "../../../../../../tenant-notifications/telegram";
import { resolveTenantFromPublishableKey } from "../../../resolve-tenant";

/**
 * `POST /store/tenant/orders/:id/payment-receipt` — the buyer's «Я оплатил»
 * (batch 3 of t-cherk-com-hotfix): one receipt, a picture or a PDF, for an
 * order paid by a transfer to the shop's card. The file goes into the shop's
 * own media prefix, the order keeps it in `metadata.payment_receipt`
 * (`{ url, uploaded_at }`, the latest one wins), and the owner hears about it
 * in the shop's Telegram chat with the receipt link and the panel link.
 * Nothing is captured here: the owner confirms the payment in the panel.
 *
 * Batch 5: the owner may reject a receipt
 * (`POST /tenants/orders/:id/payment-receipt/reject` adds `status: "rejected"`,
 * `rejected_reason`, `rejected_at`). The buyer's next upload is accepted the
 * same way and writes a fresh `{ url, uploaded_at }`: Medusa merges order
 * metadata one top-level key at a time, so the whole `payment_receipt` object
 * is replaced and the rejection goes with it, and the owner gets the same
 * Telegram message again. The earlier file stays in storage. A cancelled
 * order takes no receipt.
 *
 * Multipart, field `files`, parsed by the Admin's multer array
 * (`adminUploadPostMiddlewares` in `api/middlewares.ts`). The order must sit in
 * this publishable key's sales channel, be paid through `pp_system_default`
 * and not be captured yet. The order id is the only secret, as for the order
 * confirmation page that shows this form.
 *
 * The stored name is built here from the order number, a random UUID and an
 * extension the type maps to, never from the buyer's file name: the local file
 * provider serves a file with the type its NAME asks for
 * (`tenant-files/upload-policy.ts`), and the file is public, so its URL is the
 * only thing that keeps a receipt private.
 */
const RECEIPT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

/** 10 MB, what the storefront's form says and its server action passes through. */
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

const MANUAL_PROVIDER_ID = "pp_system_default";

type UploadedFile = { originalname: string; mimetype: string; buffer: Buffer };

type ReceiptOrder = {
  id: string;
  display_id: number | null;
  status: string;
  sales_channel_id: string | null;
  metadata: Record<string, unknown> | null;
  payment_collections: { payments: { provider_id: string; captured_at: Date | string | null }[] | null }[] | null;
};

export const POST = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const tenant = await resolveTenantFromPublishableKey(req);
  const file = (req as unknown as { files?: UploadedFile[] }).files?.[0];

  if (!file) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "No receipt was uploaded");
  }
  const extension = RECEIPT_TYPES[file.mimetype];
  if (!extension) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "A receipt is a picture (JPG, PNG, WEBP, HEIC) or a PDF");
  }
  if (file.buffer.length > RECEIPT_MAX_BYTES) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "A receipt is at most 10 MB");
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "status",
      "sales_channel_id",
      "metadata",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.captured_at",
    ],
    filters: { id: req.params.id },
  });
  const order = data[0] as ReceiptOrder | undefined;

  if (!order || order.sales_channel_id !== tenant.sales_channel_id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id: ${req.params.id} was not found`);
  }

  if (order.status === "canceled") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This order is cancelled");
  }

  const payments = (order.payment_collections ?? []).flatMap((collection) => collection.payments ?? []);
  if (!payments.some((payment) => payment.provider_id === MANUAL_PROVIDER_ID)) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This order is not paid by a transfer");
  }
  if (payments.some((payment) => payment.captured_at)) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This order is already paid");
  }

  const label = String(order.display_id ?? order.id);
  const {
    result: [uploaded],
  } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: [
        {
          // The random part keeps the public URL unguessable: `file-local` only prepends `Date.now()`.
          filename: `${tenantFilePrefix(tenant.id)}receipt-${label}-${randomUUID()}.${extension}`,
          mimeType: file.mimetype,
          content: file.buffer.toString("base64"),
          access: "public" as const,
        },
      ],
    },
  });

  const receipt = { url: uploaded.url, uploaded_at: new Date().toISOString() };
  const orderService = req.scope.resolve<IOrderModuleService>(Modules.ORDER);
  await orderService.updateOrders([{ id: order.id, metadata: { ...(order.metadata ?? {}), payment_receipt: receipt } }]);

  await notifyOwner(req, order, label, receipt.url, logger);

  res.status(200).json({ payment_receipt: receipt });
};

/** The shop's Telegram chat, the channel `order-placed-telegram` uses. A failure is logged and recorded, never thrown at the buyer. */
const notifyOwner = async (
  req: MedusaStoreRequest,
  order: ReceiptOrder,
  label: string,
  receiptUrl: string,
  logger: Logger,
) => {
  const tag = "payment-receipt";
  const shop = await resolveShopForOrder(req.scope, order.id);
  const chatId = shop.settings?.telegram_chat_id ?? null;
  const token = botToken();

  if (!chatId || !token) {
    logger.warn(
      `[${tag}] Order ${label}: receipt stored, but shop ${shop.tenantId ?? "(platform)"} has ${chatId ? "no TELEGRAM_BOT_TOKEN" : "no Telegram chat linked"}`,
    );
    return;
  }

  const locale = resolveOwnerLocale(shop.defaultLocale, defaultOwnerLocale());
  const panelUrl = panelOrderUrl(order.id);
  const text = [
    ownerText(locale, "receiptTitle", { id: label }),
    `${ownerText(locale, "shop")}: ${shop.name}`,
    ownerText(locale, "receiptBody", { url: receiptUrl }),
    ...(panelUrl ? [`${ownerText(locale, "openInPanel")}: ${panelUrl}`] : []),
  ].join("\n");

  try {
    await sendTelegramMessage(token, chatId, text);
    await recordDelivery(req.scope, shop.tenantId, "telegram", { status: "ok", order: label });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(`[${tag}] Order ${label}: the receipt message to chat ${chatId} failed: ${reason}`);
    await recordDelivery(req.scope, shop.tenantId, "telegram", { status: "failed", error: reason, order: label });
  }
};
