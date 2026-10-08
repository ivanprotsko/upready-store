import { Form, Link, Outlet, useLoaderData, useRouteLoaderData } from "react-router"
import { ErrorView } from "~/components/error-view"
import { readConfig } from "~/lib/config.server"
import { HOME_PATH } from "~/lib/next-path"

/**
 * The frame of every `/app` page: the header with the way back to the shop and
 * «Выйти». Each page's own loader checks the cookie, because React Router runs
 * the loaders of a layout and its page side by side.
 */
export function loader() {
  return { shopOrigin: readConfig().shopOrigin }
}

function Header({ shopOrigin }: { shopOrigin: string | null }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-[color-mix(in_srgb,var(--background)_92%,transparent)] backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-x-4 px-4 sm:px-6">
        <Link to={HOME_PATH} className="text-base font-semibold tracking-tight">
          Мои курсы
        </Link>
        <nav className="flex items-center gap-x-1 sm:gap-x-2">
          {shopOrigin && (
            <a
              href={shopOrigin}
              className="inline-flex h-11 items-center rounded-theme px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              В магазин
            </a>
          )}
          <Form method="post" action="/logout">
            <button
              type="submit"
              className="inline-flex h-11 items-center rounded-theme px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              data-testid="logout-button"
            >
              Выйти
            </button>
          </Form>
        </nav>
      </div>
    </header>
  )
}

export default function AppLayout() {
  const { shopOrigin } = useLoaderData<typeof loader>()

  return (
    <div className="flex min-h-dvh flex-col">
      <Header shopOrigin={shopOrigin} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <Outlet />
      </main>
    </div>
  )
}

export function ErrorBoundary() {
  // A page's loader failed; this layout's own answer is still there when its loader passed.
  const layout = useRouteLoaderData<typeof loader>("routes/app-layout")

  return (
    <div className="flex min-h-dvh flex-col">
      <Header shopOrigin={layout?.shopOrigin ?? null} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <ErrorView />
      </main>
    </div>
  )
}
