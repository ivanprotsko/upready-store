import { HttpTypes } from "@medusajs/types"
import {
  createBrowserRouter,
  Outlet,
  RouteObject,
  RouterProvider,
  UIMatch,
} from "react-router-dom"
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
                    path: "export",
                    lazy: () => import("./routes/orders/order-export"),
                  },
                ],
              },
              {
                path: ":id",
                // tenant-panel: the Admin route map builds this handle inside
                // its own `lazy`, because the breadcrumb needs the loaded
                // order. Same shape here.
                lazy: async () => {
                  const { Component, Breadcrumb, loader, seo } = await import(
                    "./routes/orders/order-detail"
                  )

                  return {
                    Component,
                    loader,
                    handle: {
                      breadcrumb: (
                        match: UIMatch<HttpTypes.AdminOrderResponse>
                      ) => <Breadcrumb {...match} />,
                      seo,
                    },
                  }
                },
                children: [
                  {
                    path: "fulfillment",
                    lazy: () =>
                      import("./routes/orders/order-create-fulfillment"),
                  },
                  {
                    path: ":f_id/create-shipment",
                    lazy: () =>
                      import("./routes/orders/order-create-shipment"),
                  },
                  // tenant-panel: every child below is an action the panel does
                  // not implement (docs/tenant-panel/api-contract.md, "Piece 2":
                  // the action menu keeps Cancel, Fulfill, Ship, Mark delivered
                  // and Capture). The paths stay so a link from a copied screen
                  // lands on the placeholder instead of the 404 screen, and so
                  // the route tree still mirrors the Admin's map.
                  {
                    // RMA: receive a return. No return is ever created here.
                    path: "returns/:return_id/receive",
                    lazy: () => import("./routes/not-built"),
                  },
                  {
                    // Inventory allocation, needs the reservation write routes.
                    path: "allocate-items",
                    lazy: () => import("./routes/not-built"),
                  },
                  {
                    // RMA: request a return.
                    path: "returns",
                    lazy: () => import("./routes/not-built"),
                  },
                  {
                    // RMA: create a claim.
                    path: "claims",
                    lazy: () => import("./routes/not-built"),
                  },
                  {
                    // RMA: create an exchange.
                    path: "exchanges",
                    lazy: () => import("./routes/not-built"),
                  },
                  {
                    // Order editing.
                    path: "edits",
                    lazy: () => import("./routes/not-built"),
                  },
                  {
                    // Refund a payment; only capture is in scope.
                    path: "refund",
                    lazy: () => import("./routes/not-built"),
                  },
                  {
                    // Transfer the order to another customer.
                    path: "transfer",
                    lazy: () => import("./routes/not-built"),
                  },
                  {
                    // Edit the customer's email; no order update route.
                    path: "email",
                    lazy: () => import("./routes/not-built"),
                  },
                  {
                    // Edit the shipping address; no order update route.
                    path: "shipping-address",
                    lazy: () => import("./routes/not-built"),
                  },
                  {
                    // Edit the billing address; no order update route.
                    path: "billing-address",
                    lazy: () => import("./routes/not-built"),
                  },
                  {
                    // Edit the order's metadata; no order update route.
                    path: "metadata/edit",
                    lazy: () => import("./routes/not-built"),
                  },
                ],
              },
            ],
          },
          {
            // tenant-panel wave 2, piece 4 (profile): the copied
            // routes/profile/profile-detail tree, with profile-edit as its
            // "edit" child (RouteDrawer), same nesting the Admin uses.
            path: "/settings/profile",
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/profile/profile-detail"),
            children: [
              {
                path: "edit",
                lazy: () => import("./routes/profile/profile-edit"),
              },
            ],
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
            // tenant-panel wave 2, piece 6 (promotions + campaigns): the copied
            // routes/promotions and routes/campaigns trees, with the same child
            // paths as the Admin's get-route.map.tsx so URLs and screenshots
            // compare one for one.
            path: "/promotions",
            handle: { breadcrumb: () => t("promotions.domain") },
            errorElement: <ErrorBoundary />,
            children: [
              {
                path: "",
                lazy: () => import("./routes/promotions/promotion-list"),
              },
              {
                path: "create",
                lazy: () => import("./routes/promotions/promotion-create"),
              },
              {
                path: ":id",
                lazy: async () => {
                  const { Component, Breadcrumb, loader, seo } = await import(
                    "./routes/promotions/promotion-detail"
                  )

                  return {
                    Component,
                    loader,
                    handle: {
                      breadcrumb: (
                        match: UIMatch<HttpTypes.AdminPromotionResponse>
                      ) => <Breadcrumb {...match} />,
                      seo,
                    },
                  }
                },
                children: [
                  {
                    path: "edit",
                    lazy: () =>
                      import("./routes/promotions/promotion-edit-details"),
                  },
                  {
                    path: "add-to-campaign",
                    lazy: () =>
                      import("./routes/promotions/promotion-add-campaign"),
                  },
                  {
                    path: ":ruleType/edit",
                    lazy: () =>
                      import("./routes/promotions/common/edit-rules"),
                  },
                ],
              },
            ],
          },
          {
            path: "/campaigns",
            handle: { breadcrumb: () => t("campaigns.domain") },
            errorElement: <ErrorBoundary />,
            children: [
              {
                path: "",
                lazy: () => import("./routes/campaigns/campaign-list"),
              },
              {
                path: "create",
                lazy: () => import("./routes/campaigns/campaign-create"),
              },
              {
                path: ":id",
                lazy: async () => {
                  const { Component, Breadcrumb, loader, seo } = await import(
                    "./routes/campaigns/campaign-detail"
                  )

                  return {
                    Component,
                    loader,
                    handle: {
                      breadcrumb: (
                        match: UIMatch<HttpTypes.AdminCampaignResponse>
                      ) => <Breadcrumb {...match} />,
                      seo,
                    },
                  }
                },
                children: [
                  {
                    path: "edit",
                    lazy: () => import("./routes/campaigns/campaign-edit"),
                  },
                  {
                    path: "configuration",
                    lazy: () =>
                      import("./routes/campaigns/campaign-configuration"),
                  },
                  {
                    path: "edit-budget",
                    lazy: () =>
                      import("./routes/campaigns/campaign-budget-edit"),
                  },
                  {
                    path: "add-promotions",
                    lazy: () =>
                      import("./routes/campaigns/add-campaign-promotions"),
                  },
                ],
              },
            ],
          },
          {
            // tenant-panel wave 2, piece 7 (content pages): the panel's own
            // routes/pages tree (no Admin counterpart). Same nesting the Admin
            // uses for a list with a modal child: the list screen renders the
            // Outlet (SingleColumnPage does it), and `:key` mounts the focus
            // modal over it, so Save returns to the list with the row already
            // refreshed by the mutation's own invalidation.
            path: "/pages",
            handle: { breadcrumb: () => t("app.nav.main.pages", { defaultValue: "Страницы" }) },
            errorElement: <ErrorBoundary />,
            children: [
              {
                path: "",
                lazy: () => import("./routes/pages/page-list"),
                children: [
                  {
                    path: ":key",
                    lazy: () => import("./routes/pages/page-edit"),
                  },
                ],
              },
            ],
          },
          {
            // t10-blog: the shop's journal. Same nesting as /pages — the list
            // renders the Outlet and `:slug` mounts the focus modal over it, so
            // Save returns to the list with the row already refreshed by the
            // mutation's own invalidation.
            path: "/journal",
            handle: { breadcrumb: () => t("app.nav.main.journal", { defaultValue: "Журнал" }) },
            errorElement: <ErrorBoundary />,
            children: [
              {
                path: "",
                lazy: () => import("./routes/journal/article-list"),
                children: [
                  {
                    path: ":slug",
                    lazy: () => import("./routes/journal/article-edit"),
                  },
                ],
              },
            ],
          },
          {
            // t04-shipping-tariffs: the shop's delivery methods. Same nesting as
            // /pages: the list renders the Outlet, create/edit open as focus
            // modals over it and return to the refreshed list on save.
            path: "/shipping",
            handle: { breadcrumb: () => t("app.nav.main.shipping", { defaultValue: "Доставка" }) },
            errorElement: <ErrorBoundary />,
            children: [
              {
                path: "",
                lazy: () => import("./routes/shipping/shipping-list"),
                children: [
                  {
                    path: "create",
                    lazy: () => import("./routes/shipping/shipping-create"),
                  },
                  {
                    path: ":id/edit",
                    lazy: () => import("./routes/shipping/shipping-edit"),
                  },
                ],
              },
            ],
          },
          {
            // tenant-panel wave 2, piece 8 (home page settings): the panel's own
            // routes/home-settings screen (no Admin counterpart). One screen, no
            // children: the document is edited in place and saved with one
            // request, so there is no drawer or modal to nest under it.
            path: "/home-settings",
            handle: { breadcrumb: () => t("app.nav.main.homeSettings", { defaultValue: "Главная страница" }) },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/home-settings"),
          },
          {
            // The shop's address (t-2026-09-12-tenant-address-canonical, grown
            // out of tenant-panel wave 2 piece 9). No Admin counterpart — a
            // native Medusa install serves one storefront and never resolves a
            // tenant from the Host header. Sits under /settings next to
            // /settings/profile; the path stays `domains` so links already
            // handed out keep working, exactly the rule the screen itself
            // applies to shop addresses.
            path: "/settings/domains",
            handle: { breadcrumb: () => t("tenantAddress.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/domains"),
          },
          {
            // «Уведомления» (t08-order-notifications): who hears about a new
            // order — the customer by e-mail, the owner in Telegram. No Admin
            // counterpart: a native install notifies from medusa-config alone.
            path: "/settings/notifications",
            handle: { breadcrumb: () => t("notificationSettings.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/notifications"),
          },
          {
            // t06-locale-currency: which of the storefront's 36 locales this
            // shop offers, its default, and the currency its default prices
            // in. Same shape as /settings/domains next to it — one screen,
            // no children, the document is edited in place.
            path: "/settings/locale",
            handle: {
              breadcrumb: () =>
                t("localeSettings.title", { defaultValue: "Язык и валюта" }),
            },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/locale"),
          },
          {
            // «Приём оплат» (t03-tenant-secrets-robokassa): the shop's own
            // payment account, stored encrypted per tenant. No Admin
            // counterpart — the Admin configures providers in medusa-config
            // for the one store it serves.
            path: "/settings/payments",
            handle: { breadcrumb: () => t("paymentSettings.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/payments"),
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
