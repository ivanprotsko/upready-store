import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router"
import { readConfig } from "~/lib/config.server"
import { safeNextPath } from "~/lib/next-path"
import { readToken } from "~/lib/session.server"
import { buildLoginUrl } from "~/lib/sso"

const ERRORS: Record<string, string> = {
  expired: "Ссылка для входа устарела. Нажмите «Войти» ещё раз.",
  missing: "Магазин не передал данные для входа. Нажмите «Войти» ещё раз.",
  failed: "Не получилось войти: магазин не ответил. Попробуйте через минуту.",
}

export function meta() {
  return [{ title: "Вход — Мои курсы" }]
}

/**
 * The school's sign-in page: one button that goes to the shop's sign-in and
 * comes back to `next`. A buyer who already holds the cookie goes straight on.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const next = safeNextPath(url.searchParams.get("next"))

  if (readToken(request)) {
    throw redirect(next)
  }

  const config = readConfig()
  const error = url.searchParams.get("error")

  return {
    loginUrl: buildLoginUrl({ shopOrigin: config.shopOrigin, schoolOrigin: config.schoolOrigin, next }),
    shopHost: new URL(config.shopOrigin).host,
    error: error ? (ERRORS[error] ?? ERRORS.failed!) : null,
  }
}

export default function Login() {
  const { loginUrl, shopHost, error } = useLoaderData<typeof loader>()

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted px-4 py-12">
      <div className="w-full max-w-sm rounded-theme bg-card p-6 shadow-float sm:p-8" data-testid="login-card">
        <h1 className="text-2xl font-semibold tracking-tight">Мои курсы</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Курсы открываются по вашему аккаунту в магазине {shopHost}. Войдите через магазин, и мы вернём вас
          к урокам.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-theme border border-destructive-border bg-destructive-bg px-3 py-2 text-sm text-destructive-text"
            data-testid="login-error"
          >
            {error}
          </p>
        )}

        <a
          href={loginUrl}
          className="mt-6 flex h-11 w-full items-center justify-center rounded-theme bg-primary px-4 text-base font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          data-testid="login-button"
        >
          Войти
        </a>
      </div>
    </main>
  )
}
