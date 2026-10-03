import { LockClosedSolid } from "@medusajs/icons"
import { Button, Text } from "@medusajs/ui"
import { getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { BUYER_STATUS_TONES } from "@lib/util/buyer-order-status"
import type { PendingCourse } from "@lib/util/pending-courses"
import StatusDot from "@modules/account/components/status-dot"

/**
 * «Мои курсы» cards for a course that is bought but not paid yet (batch 7, Ivan
 * 03.10: «Курс тоже появляется в личном кабинете но без доступа»): the title, a
 * lock, the buyer's payment status in the same words as the order, and one way
 * forward — the order to pay. No lesson links and no progress: nothing opens
 * before the shop confirms the payment (`grant-course-on-paid`).
 */
export default async function PendingCoursesList({ courses }: { courses: PendingCourse[] }) {
  const [t, tStatus, tc] = await Promise.all([
    getTranslations("CoursesPage"),
    getTranslations("OrderStatus"),
    getTranslations("Common"),
  ])

  if (courses.length === 0) {
    return null
  }

  return (
    <ul className="flex flex-col gap-y-4 w-full" data-testid="pending-courses-list">
      {courses.map((course) => (
        <li
          key={`${course.orderId}-${course.productId}`}
          className="border border-ui-border-base bg-ui-bg-subtle rounded-large p-6 flex flex-col gap-y-4"
          data-testid="pending-course-card"
          data-value={course.status}
        >
          <div className="flex items-start gap-x-3">
            <span
              className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-muted"
              aria-hidden
            >
              <LockClosedSolid />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-y-2">
              <h2 className="text-lg font-medium text-ui-fg-base">{course.title}</h2>
              <StatusDot
                tone={BUYER_STATUS_TONES[course.status]}
                label={tStatus(course.status)}
                data-testid="pending-course-status"
                data-value={course.status}
              />
              <Text size="small" className="text-ui-fg-subtle">
                {t("pendingHint")}
              </Text>
            </div>
          </div>

          <div>
            <Button asChild variant="secondary" data-testid="pending-course-order-link">
              <Link href={`/account/orders/details/${course.orderId}`}>
                {t("toOrder", { order: tc("orderNumber", { id: course.orderDisplayId }) })}
              </Link>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
