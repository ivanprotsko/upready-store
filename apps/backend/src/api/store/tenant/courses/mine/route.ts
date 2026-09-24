import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../../../../modules/course";
import type CourseModuleService from "../../../../../modules/course/service";
import type { CourseRow, LessonRow } from "../../../../tenants/courses/course-helpers";
import { resolveTenantFromPublishableKey } from "../../resolve-tenant";
import { computeCourseProgress, type EntitlementRow, type ProgressRow } from "../store-course-helpers";

type ProductCard = { id: string; title: string; handle: string; thumbnail: string | null };

/**
 * `GET /store/tenant/courses/mine` — «Мои курсы» (o24-courses): every course
 * this customer holds a live entitlement for, in the storefront's own tenant,
 * each with its progress. A course whose entitlement was revoked, or that
 * belongs to another tenant, is not in this list.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req as unknown as MedusaStoreRequest);
  const customerId = req.auth_context?.actor_id;

  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "You must be logged in.");
  }

  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const entitlements = (await courseService.listCourseEntitlements({
    tenant_id: tenant.id,
    customer_id: customerId,
    status: "active",
  })) as EntitlementRow[];

  if (!entitlements.length) {
    res.json({ courses: [] });
    return;
  }

  const courseIds = [...new Set(entitlements.map((row) => row.course_id))];
  const courses = (await courseService.listCourses({
    id: courseIds,
    tenant_id: tenant.id,
  })) as CourseRow[];

  const productIds = courses.map((course) => course.product_id);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: products } = productIds.length
    ? await query.graph({
        entity: "product",
        fields: ["id", "title", "handle", "thumbnail"],
        filters: { id: productIds },
      })
    : { data: [] as ProductCard[] };
  const productById = new Map((products as ProductCard[]).map((product) => [product.id, product]));

  const result = await Promise.all(
    courses.map(async (course) => {
      const lessons = (await courseService.listLessons({
        tenant_id: tenant.id,
        course_id: course.id,
      })) as LessonRow[];
      const progressRows = (await courseService.listCourseProgresses({
        tenant_id: tenant.id,
        customer_id: customerId,
        course_id: course.id,
      })) as ProgressRow[];
      const product = productById.get(course.product_id);

      return {
        id: course.id,
        title: course.title,
        slug: course.slug,
        product: product
          ? { id: product.id, title: product.title, handle: product.handle, thumbnail: product.thumbnail ?? null }
          : null,
        progress: computeCourseProgress(lessons, progressRows),
      };
    }),
  );

  res.json({ courses: result });
};
