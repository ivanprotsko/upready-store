import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { notifyStorefrontRevalidate } from "../storefront-revalidate";

export default async function productUpdatedHandler({
  event,
}: SubscriberArgs<{ id: string }>) {
  // The address lives in ../storefront-revalidate: it is STOREFRONT_REVALIDATE_URL
  // on the multi-tenant stack (the storefront container) and STOREFRONT_URL on a
  // single-shop stand, where the two are the same host. Posting to the engine's
  // own domain answered 404 and cleared nothing.
  await notifyStorefrontRevalidate({ type: event.name, id: event.data.id });
}

export const config: SubscriberConfig = {
  event: [
    "product.updated",
    "product.created",
    "product.deleted",
    "product-type.updated",
    "product-type.created",
    "product-type.deleted",
    "product-option.updated",
    "product-option.created",
    "product-option.deleted",
    "product-tag.updated",
    "product-tag.created",
    "product-tag.deleted",
    "product-variant.updated",
    "product-variant.created",
    "product-variant.deleted",
    "product-collection.updated",
    "product-collection.created",
    "product-collection.deleted",
    "product-category.updated",
    "product-category.created",
    "product-category.deleted",
    "translation.created",
    "translation.updated",
    "translation.deleted",
  ],
};
