import { isRouteErrorResponse, Link, useRouteError } from "react-router"
import { HOME_PATH } from "~/lib/next-path"

const BY_STATUS: Record<number, { title: string; text: string }> = {
  403: {
    title: "Курс пока закрыт",
    text: "Этот курс не открыт для вашего аккаунта. Если вы только что оплатили его, обновите страницу через минуту.",
  },
  404: {
    title: "Страница не найдена",
    text: "Такого курса или урока нет. Возможно, ссылка устарела.",
  },
  502: {
    title: "Магазин не ответил",
    text: "Не получилось загрузить курсы. Обновите страницу через минуту.",
  },
}

const FALLBACK = {
  title: "Что-то пошло не так",
  text: "Обновите страницу. Если ошибка повторится, напишите в поддержку магазина.",
}

/** What a page shows when its loader failed: the reason in plain words and the way back to the courses. */
export function ErrorView() {
  const error = useRouteError()
  const status = isRouteErrorResponse(error) ? error.status : 500
  const copy = BY_STATUS[status] ?? FALLBACK

  return (
    <section className="flex flex-col items-start gap-y-3" data-testid="error-view" data-status={status}>
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="max-w-measure text-base text-muted-foreground">{copy.text}</p>
      <Link
        to={HOME_PATH}
        className="mt-2 inline-flex h-10 items-center rounded-theme border border-border px-4 text-sm font-medium hover:bg-muted"
      >
        К моим курсам
      </Link>
    </section>
  )
}
