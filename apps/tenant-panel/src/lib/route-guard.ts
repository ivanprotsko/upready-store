import type { LoaderFunction, RouteObject } from "react-router-dom"

/**
 * Keeps a route's loader from asking the server for a screen the login may
 * not open (t-2026-10-07-11). The router runs loaders before anything is
 * drawn, so hiding the screen is not enough: `/orders/:id` typed into the
 * address bar would still fetch the order. Every loader of the tree, the ones
 * a `lazy` module brings included, first asks `mayOpen` about the address
 * being opened and answers `null` without a request when it may not.
 *
 * `mayOpen` is passed in, so this file stays free of the SDK and
 * `src/__tests__/permissions.test.mjs` runs it as is. The screen itself is
 * replaced by `PermissionOutlet`.
 */
export type MayOpen = (pathname: string) => Promise<boolean>

type LazyFunction = Extract<NonNullable<RouteObject["lazy"]>, (...args: never[]) => unknown>

const guardLoader =
  (loader: LoaderFunction, mayOpen: MayOpen): LoaderFunction =>
  async (args, context) =>
    (await mayOpen(new URL(args.request.url).pathname)) ? loader(args, context) : null

const guardLazy =
  (lazy: LazyFunction, mayOpen: MayOpen): LazyFunction =>
  async () => {
    const module = await lazy()
    return typeof module.loader === "function"
      ? { ...module, loader: guardLoader(module.loader, mayOpen) }
      : module
  }

const guardRoute = (route: RouteObject, mayOpen: MayOpen): RouteObject => {
  const loader =
    typeof route.loader === "function" ? guardLoader(route.loader, mayOpen) : route.loader
  const lazy = typeof route.lazy === "function" ? guardLazy(route.lazy, mayOpen) : route.lazy
  if (route.index) {
    return { ...route, loader, lazy }
  }
  return {
    ...route,
    loader,
    lazy,
    children: route.children ? guardRoutes(route.children, mayOpen) : undefined,
  }
}

export const guardRoutes = (routes: RouteObject[], mayOpen: MayOpen): RouteObject[] =>
  routes.map((route) => guardRoute(route, mayOpen))
