import { type MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http";
import {
  PostTenantArticleSchema,
  PostTenantPageSchema,
  PutTenantArticleSchema,
  PutTenantPageSchema,
} from "../tenants/validators";
// ---- piece 8: the home-page document body schema (zod for theme/content;
// `settings` is checked by store/storefront-settings/validation.ts inside it).
import { PutTenantHomeBody } from "../tenants/home/validators";
import {
  PostTenantProductAttributeSchema,
  PostTenantProductAttributeUpdateSchema,
  PostTenantProductAttributeValuesSchema,
} from "../tenants/product-attributes/validators";
import { PutTenantProductTranslationBody } from "../tenants/products/translations-validators";
import { PutTenantLocaleSettingsBody } from "../tenants/locale-settings/validators";
import { PostAgentChangesetSchema } from "../tenants/agent-changesets/validators";

/**
 * The shop's content. It covers pages, journal articles, the home page
 * document, product attributes and translations, and the locale settings.
 *
 * `../middlewares.ts` composes this array with the other files of this folder in
 * a fixed order (t-2026-10-14-55).
 */
export const contentRoutes: MiddlewareRoute[] = [
  // ---- piece 7: content pages (/tenants/pages/**, /store/tenant/pages/**)
  // Only the write verbs need a middleware here: the two tenant reads take no
  // body, and their one query parameter (`locale`) is parsed in the route —
  // this resource has no Admin counterpart whose validator and query config
  // could be reused, and the contract's shape for the list is the reserved
  // five plus the tenant's own custom pages, not an Admin `count/offset/limit`
  // page. The public `/store/tenant/pages/**` reads sit behind the
  // framework's own global publishable-key gate and take neither body nor
  // query. `POST` (t05-page-keys) creates a custom page; `DELETE` removes one.
  {
    matcher: "/tenants/pages",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantPageSchema)],
  },
  {
    matcher: "/tenants/pages/:key",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantPageSchema)],
  },

  // ---- t10-blog / b18-blog-full: journal articles
  // (/tenants/articles/**, /tenants/article-categories,
  //  /store/tenant/articles/**, /store/tenant/article-categories)
  // The two category reads take no body and no parameter at all, so they are
  // not listed here: the owner's one rides the "/tenants/*" authenticate
  // in `gates.ts`, the visitor's one the framework's publishable-key gate on
  // "/store/*". They are their own paths rather than
  // "/tenants/articles/categories" because that sits inside the ":slug"
  // route's space, and a rubric is not an article.
  // Same reasoning as the pages block above: only the write verbs take a
  // body. The two tenant reads parse their one optional `?locale=` in the
  // route (this resource has no Admin counterpart to borrow a query config
  // from), and the public `/store/tenant/articles/**` reads ride the
  // framework's own publishable-key gate on `/store/*`.
  {
    matcher: "/tenants/articles",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantArticleSchema)],
  },
  {
    matcher: "/tenants/articles/:slug",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantArticleSchema)],
  },

  // ---- piece 8: home page document (/tenants/home, /store/tenant/home)
  // The document is one row per tenant, addressed by the token, so there is no
  // id to validate in the URL. `GET` takes no parameters (the whole document is
  // the answer, and the panel needs every field of it), which is why only the
  // write verb is wired here. `GET /store/tenant/home` needs nothing either: it
  // rides the framework's own publishable-key gate on `/store/*` and resolves
  // the tenant from that key.
  {
    matcher: "/tenants/home",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantHomeBody)],
  },

  // ---- t15-product-attributes: the shop's own product characteristics
  // (/tenants/product-attributes/**, /tenants/products/:id/attributes,
  // /store/tenant/product-attributes/**).
  //
  // Only the write verbs take a body. The reads parse their own one or two
  // query parameters in the route (this resource has no Admin counterpart to
  // borrow a query config from), and the public `/store/tenant/*` reads ride
  // the framework's own publishable-key gate on `/store/*`.
  {
    matcher: "/tenants/product-attributes",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantProductAttributeSchema)],
  },
  {
    matcher: "/tenants/product-attributes/:id",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantProductAttributeUpdateSchema)],
  },
  {
    matcher: "/tenants/products/:id/attributes",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantProductAttributeValuesSchema)],
  },

  // t-cherk-37: one locale of a product's own title/subtitle/description,
  // option titles and variant titles.
  {
    matcher: "/tenants/products/:id/translations",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantProductTranslationBody)],
  },

  // t06-locale-currency: the tenant's default storefront locale, its enabled
  // subset of the 36 shipped locales, and the country its default prices in.
  {
    matcher: "/tenants/locale-settings",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantLocaleSettingsBody)],
  },

  // ---- t-2026-10-27-04: the owner's agent's changesets. Only the create
  // takes a body; the steps take none and act on the id in the path.
  {
    matcher: "/tenants/agent-changesets",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostAgentChangesetSchema)],
  },
];
