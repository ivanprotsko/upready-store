import { model } from "@medusajs/framework/utils";

/**
 * One product a signed-in customer saved to their wishlist, on one shop
 * (t-cherk-32). Scope is the pair `tenant_id` + `customer_id`, never a field
 * from the request: every store route takes the tenant from the publishable
 * key and the customer from `req.auth_context` (the same shape `product_review`
 * uses, rule 20a — no `src/links/tenant-wishlist-item.ts`, the column already
 * holds the fact).
 *
 * Customers are platform-wide (`docs/multitenancy`), so the same product saved
 * on two shops — or the same shop handle reused after a tenant swap — is two
 * rows, never one: the unique index below includes `tenant_id`, and a customer
 * who buys on Shop A sees an empty wishlist on Shop B.
 */
const WishlistItem = model
  .define("wishlist_item", {
    id: model.id({ prefix: "wish" }).primaryKey(),
    tenant_id: model.text(),
    customer_id: model.text(),
    product_id: model.text(),
  })
  .indexes([
    {
      on: ["tenant_id", "customer_id"],
      where: "deleted_at IS NULL",
    },
    {
      on: ["tenant_id", "customer_id", "product_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default WishlistItem;
