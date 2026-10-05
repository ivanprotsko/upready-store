import { getTranslations } from "next-intl/server"
import type { CourseProgress as CourseProgressSummary } from "@lib/data/courses"
import HydrationSlot from "@modules/common/components/hydration-slot"

/**
 * A course's progress bar with its «3/20 уроков пройдено» line, the same on
 * the course block, the «Мои курсы» cards, the course's contents and the
 * lesson page in the account.
 */
export default async function CourseProgress({
  progress,
  "data-testid": testId,
}: {
  progress: CourseProgressSummary
  "data-testid"?: string
}) {
  const t = await getTranslations("CourseBlock")

  return (
    <div className="flex flex-col gap-y-1.5" data-testid={testId}>
      {/* See HydrationSlot (46df U-06): the bar sits in the long course block. */}
      <HydrationSlot>
        <div className="h-2 w-full rounded-full bg-ui-bg-subtle overflow-hidden">
          <HydrationSlot>
            <div
              className="h-full rounded-full bg-status-success transition-[width] duration-300"
              style={{ width: `${progress.percent}%` }}
              aria-hidden="true"
            />
          </HydrationSlot>
        </div>
        <p className="text-sm text-ui-fg-subtle">
          {t("progress", {
            completed: progress.completed,
            total: progress.total,
          })}
        </p>
      </HydrationSlot>
    </div>
  )
}
