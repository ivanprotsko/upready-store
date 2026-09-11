import { createBrowserRouter, RouteObject, RouterProvider } from "react-router-dom"
import { t } from "i18next"

import { ProtectedRoute } from "./components/authentication/protected-route"
import { MainLayout } from "./components/layout/main-layout"
import { PublicLayout } from "./components/layout/public-layout"
import { ErrorBoundary } from "./components/utilities/error-boundary"
import { Providers } from "./providers"

import "./index.css"

// tenant-panel: own app.tsx, replacing the Admin's plugin/virtual-module
// wiring (DashboardApp, `virtual:medusa/*` modules, `getRouteMap`) with a
// flat route tree for the panel's three screens. Paths match the Admin's own
// (`/`, `/products`, `/orders`, ...) so screenshots and URLs compare, per the
// piece-1 prompt. Pieces 3/4 overwrite `routes/products/*` and
// `routes/orders/order-list` without touching this file or the hooks.
const routes: RouteObject[] = [
  {
    element: <ProtectedRoute />,
    errorElement: <ErrorBoundary />,
    children: [
      {
        element: <MainLayout />,
        children: [
          {
            path: "/",
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/home"),
          },
          {
            path: "/products",
            // tenant-panel: same breadcrumb handle as the Admin route map (get-route.map.tsx)
            handle: { breadcrumb: () => t("products.domain") },
            errorElement: <ErrorBoundary />,
            children: [
              {
                path: "",
                lazy: () => import("./routes/products/product-list"),
                children: [
                  {
                    path: "create",
                    lazy: () => import("./routes/products/product-create"),
                  },
                ],
              },
              {
                // tenant-panel wave 2, piece 1 (product detail): this stub is
                // replaced by the copied routes/products/product-detail tree.
                path: ":id",
                lazy: () => import("./routes/not-built"),
              },
            ],
          },
          {
            path: "/orders",
            // tenant-panel: same breadcrumb handle as the Admin route map (get-route.map.tsx)
            handle: { breadcrumb: () => t("orders.domain") },
            errorElement: <ErrorBoundary />,
            children: [
              {
                path: "",
                lazy: () => import("./routes/orders/order-list"),
                children: [
                  {
                    // tenant-panel wave 2, piece 3 (orders export): replaced by
                    // the copied routes/orders/order-export.
                    path: "export",
                    lazy: () => import("./routes/not-built"),
                  },
                ],
              },
              {
                // tenant-panel wave 2, piece 2 (order detail): replaced by the
                // copied routes/orders/order-detail tree.
                path: ":id",
                lazy: () => import("./routes/not-built"),
              },
            ],
          },
          {
            // tenant-panel wave 2, piece 4 (profile): replaced by the copied
            // routes/profile/profile-detail (+ profile-edit) tree.
            path: "/settings/profile",
            lazy: () => import("./routes/not-built"),
          },
          {
            // tenant-panel wave 2, piece 5 (categories): replaced by the copied
            // routes/categories tree (list, create, detail, edit, products).
            path: "/categories",
            handle: { breadcrumb: () => t("categories.domain") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/not-built"),
          },
          {
            // tenant-panel wave 2, piece 6 (promotions + campaigns): replaced by
            // the copied routes/promotions and routes/campaigns trees.
            path: "/promotions",
            handle: { breadcrumb: () => t("promotions.domain") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/not-built"),
          },
          {
            path: "/campaigns",
            handle: { breadcrumb: () => t("campaigns.domain") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/not-built"),
          },
          {
            // tenant-panel wave 2, piece 7 (content pages): the panel's own
            // routes/pages tree (no Admin counterpart).
            path: "/pages",
            handle: { breadcrumb: () => "Pages" },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/not-built"),
          },
          {
            // tenant-panel wave 2, piece 8 (home page settings): the panel's own
            // routes/home-settings tree (no Admin counterpart).
            path: "/home-settings",
            handle: { breadcrumb: () => "Home page" },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/not-built"),
          },
        ],
      },
    ],
  },
  {
    element: <PublicLayout />,
    children: [
      {
        errorElement: <ErrorBoundary />,
        children: [
          {
            path: "/login",
            lazy: () => import("./routes/login"),
          },
          {
            path: "*",
            lazy: () => import("./routes/no-match"),
          },
        ],
      },
    ],
  },
]

function App() {
  const router = createBrowserRouter(routes, {
    basename: __BASE__ || "/",
  })

  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  )
}

export default App
