import {
  type MiddlewareRoute,
  authenticate,
  validateAndTransformBody,
} from "@medusajs/framework/http";
// ---- t09-reviews: moderation body (tenant side) and the storefront's form.
import { PostTenantReviewSchema } from "../tenants/reviews/validators";
import { PostStoreReviewSchema } from "../store/tenant/reviews/validators";
// ---- t-cherk-32: the wishlist's one write body (`DELETE` takes none).
import { PostStoreWishlistSchema } from "../store/wishlist/validators";
// ---- t-2026-10-08-36: the school's sign-in through the shop, code and exchange.
import { PostStoreSsoCodeSchema, PostStoreSsoExchangeSchema } from "../store/tenant/sso/validators";
// ---- o24-courses: course/lesson CRUD bodies (tenant side, panel editor).
import {
  PostTenantCourseSchema,
  PutTenantCourseSchema,
  PostTenantLessonSchema,
  PutTenantLessonSchema,
  PostTenantLessonsReorderSchema,
} from "../tenants/courses/validators";
import { adminUploadPostMiddlewares } from "./shared";

/**
 * What a buyer does on the storefront. That covers reviews, the wishlist,
 * online courses and the school's sign-in through the shop.
 *
 * `../middlewares.ts` composes this array with the other files of this folder in
 * a fixed order (t-2026-10-14-55).
 */
export const buyerRoutes: MiddlewareRoute[] = [
  // ---- t09-reviews: product reviews. The tenant side rides the
  // "/tenants/*" authenticate in `gates.ts` and needs a body schema for the one
  // write verb (`DELETE` takes none, the two reads take query parameters the
  // route parses itself). The storefront's read rides the framework's own
  // publishable-key gate; its POST needs a customer on top of that, so it
  // carries `authenticate("customer", …)` WITHOUT `allowUnauthenticated` —
  // an anonymous visitor gets a 401 rather than a review with no author
  // behind it.
  {
    matcher: "/tenants/reviews/:id",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantReviewSchema)],
  },
  {
    matcher: "/store/tenant/reviews",
    method: ["POST"],
    middlewares: [
      authenticate("customer", ["session", "bearer"]),
      validateAndTransformBody(PostStoreReviewSchema),
    ],
  },

  // ---- t-cherk-32: the wishlist. Every verb needs a customer behind the
  // call — there is no guest server state, only the browser's own
  // localStorage (merged in on sign-in, `lib/data/customer.ts` on the
  // storefront) — so all three carry `authenticate("customer", …)` WITHOUT
  // `allowUnauthenticated`.
  {
    matcher: "/store/wishlist",
    method: ["GET"],
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
  {
    matcher: "/store/wishlist",
    method: ["POST"],
    middlewares: [
      authenticate("customer", ["session", "bearer"]),
      validateAndTransformBody(PostStoreWishlistSchema),
    ],
  },
  {
    matcher: "/store/wishlist/:product_id",
    method: ["DELETE"],
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },

  // ---- o24-courses: online courses. The tenant side rides the
  // "/tenants/*" authenticate in `gates.ts` and needs a body schema for every write
  // verb. The storefront's course-page read allows an anonymous visitor
  // (every lesson comes back locked); every other storefront route needs a
  // customer, checked again for entitlement inside the route itself.
  {
    matcher: "/tenants/courses",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantCourseSchema)],
  },
  {
    matcher: "/tenants/courses/:id",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PutTenantCourseSchema)],
  },
  {
    matcher: "/tenants/courses/:id/lessons",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantLessonSchema)],
  },
  {
    matcher: "/tenants/courses/:id/lessons/:lessonId",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PutTenantLessonSchema)],
  },
  {
    matcher: "/tenants/courses/:id/lessons/reorder",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantLessonsReorderSchema)],
  },
  {
    matcher: "/store/tenant/courses",
    method: ["GET"],
    middlewares: [authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })],
  },
  {
    // t-cherk-com-hotfix batch 3: the buyer's receipt for a card transfer, multipart like `/tenants/uploads`.
    matcher: "/store/tenant/orders/:id/payment-receipt",
    method: ["POST"],
    middlewares: adminUploadPostMiddlewares,
  },
  {
    matcher: "/store/tenant/courses/mine",
    method: ["GET"],
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
  {
    matcher: "/store/tenant/courses/mine/:slug",
    method: ["GET"],
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
  {
    matcher: "/store/tenant/courses/:id/lessons/:lessonId",
    method: ["GET"],
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
  {
    matcher: "/store/tenant/courses/:id/lessons/:lessonId/viewed",
    method: ["POST"],
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
  {
    // t-2026-10-13-29 stage 2: a course's video or file, 302 to its download address.
    matcher: "/store/tenant/courses/:id/media",
    method: ["GET"],
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },

  // ---- t-2026-10-08-36: the school signs its buyers in through the shop.
  // The storefront asks for a code with the buyer's token; the school's
  // server trades the code for that token with nothing but the shop's
  // publishable key, which the framework's gate already checks, so the
  // exchange carries no authenticate of its own.
  {
    matcher: "/store/tenant/sso/code",
    method: ["POST"],
    middlewares: [
      authenticate("customer", ["session", "bearer"]),
      validateAndTransformBody(PostStoreSsoCodeSchema),
    ],
  },
  {
    matcher: "/store/tenant/sso/exchange",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostStoreSsoExchangeSchema)],
  },
];
