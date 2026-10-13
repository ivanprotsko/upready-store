import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import type { IFileModuleService } from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../../../../../modules/course";
import { lessonFileKeys } from "../../../../../../modules/course/content";
import type CourseModuleService from "../../../../../../modules/course/service";
import type { LessonRow } from "../../../../../tenants/courses/course-helpers";
import { resolveTenantFromPublishableKey } from "../../../resolve-tenant";
import { accessStartOf, lessonLock } from "../../lesson-schedule";
import { assertCourseAccess, getOwnedCourse, sendLessonLocked } from "../../store-course-helpers";

/**
 * `GET /store/tenant/courses/:id/media?key=<file key>` — the one way a video
 * or a file of a course reaches a buyer (t-2026-10-13-29 stage 2). The Store
 * API writes this address into a lesson's `videos[].url`,
 * `attachments[].url` and its body; the file's own address never leaves the
 * backend.
 *
 * Access is checked the way the lesson player checks it
 * (`assertCourseAccess`: 404 for another shop's course, 403 without a live
 * grant). Then the key has to be one a lesson of this very course names in its
 * `videos` or `attachments`: any other key is a 404, so a buyer of one course
 * cannot fetch another course's file by its key. A key whose every lesson
 * opens on a later day of the buyer's access is a 403 `lesson_locked`, the
 * same as the lesson itself.
 *
 * The answer is a 302 to the file module's download address
 * (`retrieveFile`): an S3 address signed for an hour (`file-s3`'s own
 * `download_file_duration` default), or the plain `/static` address of the
 * local provider in development. `no-store`, so no cache keeps a signed
 * address past its hour.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req as unknown as MedusaStoreRequest);
  const customerId = req.auth_context?.actor_id;

  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "You must be logged in.");
  }

  const key = typeof req.query.key === "string" ? req.query.key : "";
  if (!key) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid request: 'key' is required");
  }

  const course = await getOwnedCourse(req, tenant.id, req.params.id);
  const entitlement = await assertCourseAccess(req, tenant.id, customerId, course);

  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const lessons = (await courseService.listLessons({
    tenant_id: tenant.id,
    course_id: course.id,
  })) as LessonRow[];
  const owners = lessons.filter((lesson) => lessonFileKeys(lesson).has(key));

  if (!owners.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "File was not found");
  }

  const start = accessStartOf(entitlement, course);
  const now = new Date();
  const locks = owners.map((lesson) => lessonLock(lesson, start, now));

  if (locks.every((lock) => lock.locked)) {
    const earliest = locks
      .map((lock) => lock.opens_at)
      .filter((opensAt): opensAt is string => Boolean(opensAt))
      .sort()[0];
    sendLessonLocked(res, earliest ?? null);
    return;
  }

  const fileService: IFileModuleService = req.scope.resolve(Modules.FILE);
  const file = await fileService.retrieveFile(key);

  res.setHeader("Cache-Control", "private, no-store");
  res.redirect(302, file.url);
};
