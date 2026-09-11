import {
  createBrowserRouter,
  Outlet,
  RouteObject,
  RouterProvider,
  UIMatch,
} from "react-router-dom"
import { HttpTypes } from "@medusajs/types"
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
                // tenant-panel wave 2, piece 1 (product detail). Same shape as
                // the Admin's get-route.map.tsx `/products/:id` subtree: the id
                // level renders an Outlet and owns the breadcrumb and the
                // loader, the empty child is the detail screen, and each
                // drawer/modal is a child of it, `seo` included so the
                // document title carries the product name.
                path: ":id",
                errorElement: <ErrorBoundary />,
                lazy: async () => {
                  const { Breadcrumb, loader, seo } = await import(
                    "./routes/products/product-detail"
                  )

                  return {
                    Component: Outlet,
                    loader,
                    handle: {
                      breadcrumb: (
                        match: UIMatch<HttpTypes.AdminProductResponse>
                      ) => <Breadcrumb {...match} />,
                      seo,
                    },
                  }
                },
                children: [
                  {
                    path: "",
                    lazy: () => import("./routes/products/product-detail"),
                    children: [
                      {
                        path: "edit",
                        lazy: () => import("./routes/products/product-edit"),
                      },
                      {
                        path: "edit-variant",
                        lazy: () =>
                          import(
                            "./routes/product-variants/product-variant-edit"
                          ),
                      },
                      {
                        path: "sales-channels",
                        lazy: () =>
                          import("./routes/products/product-sales-channels"),
                      },
                      {
                        path: "attributes",
                        lazy: () =>
                          import("./routes/products/product-attributes"),
                      },
                      {
                        path: "organization",
                        lazy: () =>
                          import("./routes/products/product-organization"),
                      },
                      {
                        path: "shipping-profile",
                        lazy: () =>
                          import("./routes/products/product-shipping-profile"),
                      },
                      {
                        path: "media",
                        lazy: () => import("./routes/products/product-media"),
                      },
                      {
                        path: "images/:image_id/variants",
                        lazy: () =>
                          import(
                            "./routes/products/product-image-variants-edit"
                          ),
                      },
                      {
                        path: "prices",
                        lazy: () => import("./routes/products/product-prices"),
                      },
                      {
                        path: "variants/create",
                        lazy: () =>
                          import("./routes/products/product-create-variant"),
                      },
                      {
                        path: "stock",
                        lazy: () => import("./routes/products/product-stock"),
                      },
                      {
                        path: "metadata/edit",
                        lazy: () =>
                          import("./routes/products/product-metadata"),
                      },
                      {
                        path: "options/manage",
                        lazy: () =>
                          import("./routes/products/product-options-manage"),
                      },
                    ],
                  },
                  {
                    path: "variants/:variant_id",
                    lazy: async () => {
                      const { Component, Breadcrumb, loader, seo } =
                        await import(
                          "./routes/product-variants/product-variant-detail"
                        )

                      return {
                        Component,
                        loader,
                        handle: {
                          breadcrumb: (
                            match: UIMatch<HttpTypes.AdminProductVariantResponse>
                          ) => <Breadcrumb {...match} />,
                          seo,
                        },
                      }
                    },
                    children: [
                      {
                        path: "edit",
                        lazy: () =>
                          import(
                            "./routes/product-variants/product-variant-edit"
                          ),
                      },
                      {
                        path: "prices",
                        lazy: () => import("./routes/products/product-prices"),
                      },
                      {
                        path: "manage-items",
                        lazy: () =>
                          import(
                            "./routes/product-variants/product-variant-manage-inventory-items"
                          ),
                      },
                      {
                        path: "media",
                        lazy: () =>
                          import(
                            "./routes/product-variants/product-variant-media"
                          ),
                      },
                      {
                        path: "metadata/edit",
                        lazy: () =>
                          import(
                            "./routes/product-variants/product-variant-metadata"
                          ),
                      },
                    ],
                  },
                ],
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
            // tenant-panel wave 2, piece 5 (categories). Same shape as the
            // Admin's get-route.map.tsx `/categories` subtree: the list owns
            // `create` and `organize` as children (both are modals over it), the
            // `:id` level is the detail screen with the breadcrumb, loader and
            // seo from its own module, and edit/products/organize/metadata hang
            // off it as drawers and modals.
            path: "/categories",
            handle: { breadcrumb: () => t("categories.domain") },
            errorElement: <ErrorBoundary />,
            children: [
              {
                path: "",
                lazy: () => import("./routes/categories/category-list"),
                children: [
                  {
                    path: "create",
                    lazy: () => import("./routes/categories/category-create"),
                  },
                  {
                    path: "organize",
                    lazy: () => import("./routes/categories/category-organize"),
                  },
                ],
              },
              {
                path: ":id",
                lazy: async () => {
                  const { Component, Breadcrumb, loader, seo } = await import(
                    "./routes/categories/category-detail"
                  )

                  return {
                    Component,
                    loader,
                    handle: {
                      breadcrumb: (
                        match: UIMatch<HttpTypes.AdminProductCategoryResponse>
                      ) => <Breadcrumb {...match} />,
                      seo,
                    },
                  }
                },
                children: [
                  {
                    path: "edit",
                    lazy: () => import("./routes/categories/category-edit"),
                  },
                  {
                    path: "products",
                    lazy: () => import("./routes/categories/category-products"),
                  },
                  {
                    path: "organize",
                    lazy: () => import("./routes/categories/category-organize"),
                  },
                  {
                    path: "metadata/edit",
                    lazy: () =>
                      import("./routes/categories/categories-metadata"),
                  },
                ],
              },
            ],
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
