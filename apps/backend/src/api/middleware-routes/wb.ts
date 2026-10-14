import { type MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http";
import {
  PostTenantWbFeedbackAnswerSendBody,
  PutTenantWbFeedbackAnswerBody,
} from "../tenants/wb/feedback-answers/validators";
import { PutTenantWbWriteSettingsBody } from "../tenants/wb/write-settings/validators";
import { PutTenantWbWritePreviewBody } from "../tenants/wb/write-preview/validators";
import { PostTenantWbFbsActionBody } from "../tenants/wb/fbs-orders/validators";

/**
 * The owner's Wildberries write desks. They are the write gates, the write
 * preview, feedback answers and FBS order actions.
 *
 * `../middlewares.ts` composes this array with the other files of this folder in
 * a fixed order (t-2026-10-14-55).
 */
export const wbRoutes: MiddlewareRoute[] = [
  // w20-wb-write-core: the owner's two gates (the write switch and the
  // per-class consents). GET takes no middleware — it only reads rows the
  // tenant already owns.
  {
    matcher: "/tenants/wb/write-settings",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantWbWriteSettingsBody)],
  },

  // w21-wb-write-stocks-prices: "что изменится на WB". GET takes no
  // middleware — it parses its own three query parameters (the route says
  // why) and reads only rows this tenant already owns. PUT changes one
  // thing and it is not a mutation of Wildberries: which WB seller
  // warehouse a stock location of the shop stands for.
  {
    matcher: "/tenants/wb/write-preview",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantWbWritePreviewBody)],
  },

  // w22-wb-write-feedback-answers: drafts for reviews and questions, and the
  // one dispatch of this task. GET takes no middleware — it reads rows the
  // tenant already owns. The POST body carries the per-ANSWER confirmation
  // (a sha256 of the text the dialog quoted); the route compares it against
  // the stored draft, which is a check no validator can do.
  {
    matcher: "/tenants/wb/feedback-answers",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantWbFeedbackAnswerBody)],
  },
  {
    matcher: "/tenants/wb/feedback-answers/send",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantWbFeedbackAnswerSendBody)],
  },

  // w23-wb-write-fbs-orders: «Собрать» / «Отменить» / «Передать в доставку».
  // The body names an ACTION and the orders it applies to, never a method or
  // a path; the mutations come from the write registry. GET of the desk
  // takes no middleware — it only reads this tenant's own mirror.
  {
    matcher: "/tenants/wb/fbs-orders/actions",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantWbFbsActionBody)],
  },
];
