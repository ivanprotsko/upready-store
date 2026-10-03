import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { pageTitle } from "@lib/util/page-title"
import { listMyCourses } from "@lib/data/courses"
import { listOrders } from "@lib/data/orders"
import { pendingCoursesFromOrders } from "@lib/util/pending-courses"
import AccountPageHeader from "@modules/account/components/account-page-header"
import MyCoursesList from "@modules/account/components/my-courses-list"
import PendingCoursesList from "@modules/account/components/pending-courses-list"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.courses")

  return {
    title: await pageTitle(t("title")),
    description: t("description"),
  }
}

/** How many of the newest orders are read for a course that is not paid yet. */
const PENDING_ORDERS_LIMIT = 50

export default async function Courses() {
  // Batch 7: the paid courses from the courses endpoint, the unpaid ones off the
  // customer's own orders (`pendingCoursesFromOrders`) — the same page, no access
  // to the second group until the shop confirms the payment.
  const [courses, orders] = await Promise.all([
    listMyCourses(),
    listOrders(PENDING_ORDERS_LIMIT).catch(() => []),
  ])
  const pending = pendingCoursesFromOrders(
    orders ?? [],
    courses.map((course) => course.product?.id).filter((id): id is string => Boolean(id))
  )
  const t = await getTranslations("CoursesPage")

  return (
    <div className="w-full flex flex-col gap-y-6" data-testid="courses-page-wrapper">
      <AccountPageHeader
        heading={t("heading")}
        description={t("description")}
      />
      {courses.length > 0 && <MyCoursesList courses={courses} />}
      {pending.length > 0 && (
        <div className="flex flex-col gap-y-3" data-testid="pending-courses">
          {courses.length > 0 && (
            <h2 className="text-large-semi text-ui-fg-base">{t("pendingHeading")}</h2>
          )}
          <PendingCoursesList courses={pending} />
        </div>
      )}
      {courses.length === 0 && pending.length === 0 && (
        <p className="text-ui-fg-subtle" data-testid="my-courses-empty">
          {t("empty")}
        </p>
      )}
    </div>
  )
}
