import type { ReactNode } from "react"
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router"
import { ErrorView } from "~/components/error-view"
import "./app.css"

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-dvh">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export function meta() {
  return [{ title: "Мои курсы" }]
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <ErrorView />
    </main>
  )
}
