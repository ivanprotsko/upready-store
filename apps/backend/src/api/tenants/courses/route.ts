import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../../modules/course";
import type CourseModuleService from "../../../modules/course/service";
import { firstFreeSlug, toSlug } from "../../../product-csv/slugify";
import { assertOwnedProduct, getTenantScope } from "../tenant-scope";
import type { PostTenantCourseBody } from "./validators";
import { type CourseRow, markProductAsCourse, toCourseDto } from "./course-helpers";

/**
 * `GET /tenants/courses` — every course of the tenant behind the token
 * (o24-courses). Scope is `course.tenant_id`, set from the token, never the
 * link-table walk `tenant-scope.ts` uses for a core Medusa entity: `course`
 * carries its own tenant column, the same shape as `product_review`.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);

  const rows = (await courseService.listCourses({ tenant_id: scope.id })) as CourseRow[];
  const courses = rows
    .map(toCourseDto)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  res.json({ courses, count: courses.length });
};

/**
 * `POST /tenants/courses` — a course sold under one of the tenant's own
 * products. The product must already exist and belong to this tenant
 * (`assertOwnedProduct`, the same guard `/tenants/products` writes go
 * through); a product may sell at most one course, enforced by the unique
 * index on (`tenant_id`, `product_id`) and checked here first so the caller
 * gets a clear message instead of a database error.
 *
 * The product becomes a course product (`markProductAsCourse`): marked
 * digital and taken off shipping, before the course row is written.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantCourseBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const body = req.validatedBody;

  await assertOwnedProduct(req, body.product_id);

  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);

  const [existingForProduct] = (await courseService.listCourses({
    tenant_id: scope.id,
    product_id: body.product_id,
  })) as CourseRow[];

  if (existingForProduct) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid request: product "${body.product_id}" already has a course`,
    );
  }

  const existingSlugs = new Set(
    ((await courseService.listCourses({ tenant_id: scope.id })) as CourseRow[]).map(
      (row) => row.slug,
    ),
  );
  const baseSlug = toSlug(body.slug ?? body.title) || "course";
  const slug = firstFreeSlug(baseSlug, existingSlugs);

  await markProductAsCourse(req, body.product_id);

  const created = await courseService.createCourses({
    tenant_id: scope.id,
    product_id: body.product_id,
    title: body.title,
    slug,
    description: body.description ?? null,
    status: body.status ?? "draft",
  });

  const row = (Array.isArray(created) ? created[0] : created) as CourseRow;

  res.status(201).json({ course: toCourseDto(row) });
};
