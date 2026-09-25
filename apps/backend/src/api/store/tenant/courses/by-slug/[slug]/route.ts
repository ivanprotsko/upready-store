import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../../../../../modules/course";
import type CourseModuleService from "../../../../../../modules/course/service";
import type { CourseRow } from "../../../../../tenants/courses/course-helpers";
import { resolveTenantFromPublishableKey } from "../../../resolve-tenant";

type ProductHandle = { id: string; handle: string };

/**
 * `GET /store/tenant/courses/by-slug/:slug` — resolves a course's old
 * `/course-<slug>` address to the product it is sold on, for the
 * storefront's own 308 (`middleware.ts`, t-2026-09-25-17). The existing
 * `GET /store/tenant/courses` only looks a course up by `product_id`, so this
 * is the smallest read-only addition that can look one up by its own slug
 * instead; tenant-scoped the same way, and `status: "published"` for the same
 * reason that route filters on it — a `draft` course is never returned to the
 * storefront (`modules/course/models/course.ts`).
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const slug = req.params.slug;

  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const [course] = (await courseService.listCourses({
    tenant_id: tenant.id,
    slug,
    status: "published",
  })) as CourseRow[];

  if (!course) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Course with slug: ${slug} was not found`);
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { id: course.product_id },
  });
  const handle = (products as ProductHandle[])[0]?.handle;

  if (!handle) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Course with slug: ${slug} was not found`);
  }

  res.json({ product_handle: handle });
};
