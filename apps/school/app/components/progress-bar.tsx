import type { CourseProgress } from "~/lib/types"

/** «Пройдено 3 из 10 уроков» and a strip filled to the percentage. */
export function ProgressBar({ progress }: { progress: CourseProgress }) {
  const percent = Math.max(0, Math.min(100, Math.round(progress.percent)))

  return (
    <div className="flex flex-col gap-y-1.5" data-testid="course-progress">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-accent"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Прогресс курса"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-sm text-muted-foreground">{progressText(progress)}</p>
    </div>
  )
}

export function progressText({ completed, total }: CourseProgress): string {
  if (total === 0) {
    return "Уроков пока нет"
  }

  if (completed >= total) {
    return `Курс пройден: ${total} ${lessonsWord(total)}`
  }

  return `Пройдено ${completed} из ${total} ${lessonsWord(total, "genitive")}`
}

/** «урок», «урока», «уроков» by the number. After «из» Russian always takes the genitive plural for 2+ and singular «урока» for 1. */
export function lessonsWord(count: number, form: "nominative" | "genitive" = "nominative"): string {
  if (form === "genitive") {
    return count % 10 === 1 && count % 100 !== 11 ? "урока" : "уроков"
  }

  const mod10 = count % 10
  const mod100 = count % 100

  if (mod10 === 1 && mod100 !== 11) {
    return "урок"
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "урока"
  }

  return "уроков"
}
