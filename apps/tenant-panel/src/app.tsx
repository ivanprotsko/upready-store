import { createBrowserRouter, RouteObject, RouterProvider } from "react-router-dom"

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
                path: ":id",
                lazy: () => import("./routes/not-built"),
              },
            ],
          },
          {
            path: "/orders",
            errorElement: <ErrorBoundary />,
            children: [
              {
                path: "",
                lazy: () => import("./routes/orders/order-list"),
                children: [
                  {
                    path: "export",
                    lazy: () => import("./routes/not-built"),
                  },
                ],
              },
              {
                path: ":id",
                lazy: () => import("./routes/not-built"),
              },
            ],
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
