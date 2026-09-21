import { HttpTypes } from "@medusajs/types"
import {
  createBrowserRouter,
  Navigate,
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
                  // t14-product-import: the two buttons the product list has
                  // always rendered (`product-list-table.tsx`) had no routes
                  // behind them until now. `import/:import_id` is a separate
                  // URL on purpose — the dry-run report is read from the server
                  // by id, so a page reload does not lose it.
                  {
                    path: "export",
                    lazy: () => import("./routes/products/product-export"),
                  },
                  {
                    path: "import",
                    lazy: () => import("./routes/products/product-import"),
                  },
                  {
                    path: "import/:import_id",
                    lazy: () => import("./routes/products/product-import"),
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
                        // t15-product-attributes: the shop's own
                        // characteristics of this product, as opposed to
                        // Medusa's fixed `attributes` above.
                        path: "custom-attributes",
                        lazy: () =>
                          import("./routes/products/product-custom-attributes"),
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
                        // o21-owner-panel-ux: the record's raw fields are no job of the owner's;
                        // the address stays, and answers with the screen it belongs to.
                        path: "metadata/edit",
                        element: <Navigate to=".." replace />,
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
                        element: <Navigate to=".." replace />,
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            // w15-mp-orders-desk: «Заказы маркетплейсов» — одна лента заказов
            // магазина, Wildberries и Ozon с фильтрами по площадке, схеме,
            // статусу и периоду. Только чтение: экран показывает то, что импорт
            // положил в `mp_order`, и ничего не меняет на площадке (приказ
            // Ивана 2026-09-16 02:46 WITA). Строка магазина ведёт на обычный
            // экран заказа `/orders/:id`, строка площадки — на карточку ниже.
            path: "/marketplace-orders",
            handle: { breadcrumb: () => t("marketplaceOrders.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/marketplace-orders"),
          },
          {
            path: "/marketplace-orders/:id",
            handle: { breadcrumb: () => t("marketplaceOrders.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/marketplace-order-detail"),
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
                    path: "metadata/edit",
                    element: <Navigate to=".." replace />,
                  },
                ],
              },
            ],
          },
          {
            // t13-customers-screen: the panel's own customers tree, no Admin
            // counterpart at this path (the Admin's `/customers` is
            // store-wide; this is `/tenants/customers`, scoped to the
            // tenant). List and detail only — no create/edit, since a
            // customer is created by checking out, not by the owner.
            path: "/customers",
            handle: { breadcrumb: () => t("customers.domain") },
            errorElement: <ErrorBoundary />,
            children: [
              {
                path: "",
                lazy: () => import("./routes/customers/customer-list"),
              },
              {
                path: ":id",
                lazy: () => import("./routes/customers/customer-detail"),
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
            // t15-product-attributes: the shop's own product characteristics,
            // declared once and filled in on each product. Hangs under Products
            // in the nav, the way Campaigns hangs under Promotions.
            path: "/product-attributes",
            handle: { breadcrumb: () => "Характеристики товаров" },
            children: [
              {
                path: "",
                lazy: () =>
                  import("./routes/product-attributes/attribute-list"),
              },
              {
                path: ":id",
                lazy: () =>
                  import("./routes/product-attributes/attribute-edit"),
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
                    element: <Navigate to=".." replace />,
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
                    // b18-blog-full: «Новая статья» is a SCREEN, not a strip of
                    // inputs at the bottom of the list. Static before dynamic,
                    // and the word `new` is refused as an article address in
                    // the form itself, so the two can never collide.
                    path: "new",
                    lazy: () => import("./routes/journal/article-new"),
                  },
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
                    // b03-shipping-zones-weight: nine ready-made Russian zones,
                    // one price per kilogram each, created in a single save.
                    path: "zones",
                    lazy: () => import("./routes/shipping/shipping-zones"),
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
            // t09-reviews: the panel's own /reviews screen (no Admin
            // counterpart — a native Medusa install has no reviews). One
            // screen: publishing, hiding, answering and deleting all happen in
            // the row, so there is no drawer or modal to nest under it.
            path: "/reviews",
            handle: { breadcrumb: () => t("app.nav.main.reviews", { defaultValue: "Отзывы" }) },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/reviews/review-list"),
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
          {
            // «Доставка СДЭК» (i02-apiship-cdek-shipping): the shop's own CDEK
            // account plus the delivery kinds it offers, stored encrypted per
            // tenant. No Admin counterpart — the Admin configures fulfillment
            // providers in medusa-config for the one store it serves.
            path: "/settings/delivery",
            handle: { breadcrumb: () => t("deliverySettings.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/delivery"),
          },
          {
            // Реквизиты продавца (t12-legal-requisites): значения, которыми на
            // витрине заполняются {{ТОКЕНЫ}} в оферте, политике
            // конфиденциальности и контактах. No Admin counterpart — a native
            // install has one store and никуда не подставляет свои реквизиты
            // автоматически.
            path: "/settings/requisites",
            handle: { breadcrumb: () => "Реквизиты продавца" },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/requisites"),
          },
          {
            // b10-panel-gaps: «Старые адреса» — the shop's own redirect table.
            // The routes shipped with t11-seo-redirects and stayed API-only, so
            // the 47 rules imported with the shop were invisible to its owner.
            // Same shape as /settings/domains above: one screen, no children.
            path: "/settings/redirects",
            handle: { breadcrumb: () => t("redirects.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/redirects"),
          },
          {
            // b10-panel-gaps: the Yandex/Google ownership codes. `PUT
            // /tenants/seo-verification` shipped with t11-seo-redirects with no
            // field anywhere, so the storefront head never carried a code.
            path: "/settings/seo",
            handle: { breadcrumb: () => t("seoVerification.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/seo"),
          },
          {
            // t17-analytics step 1: the shop's own Yandex Metrica / GA4 ids.
            // No Admin counterpart — a native install has one build-time GA
            // id, set in the environment.
            path: "/settings/analytics",
            handle: { breadcrumb: () => t("analyticsSettings.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/analytics"),
          },
          {
            // w14-mp-catalog-link: «Маркетплейсы → Каталог» — товары магазина и
            // карточки площадок одним списком, сведённые по артикулу. Не под
            // /settings: это ежедневный рабочий экран, а не настройка, и он же
            // посадочная страница раздела в боковой навигации.
            path: "/marketplaces/catalog",
            handle: { breadcrumb: () => "Каталог маркетплейсов" },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/marketplaces/catalog"),
          },
          {
            // w17-mp-price-stock-table: «Маркетплейсы → Цены и остатки» — цена
            // и остаток магазина рядом с ценой и остатком каждой площадки,
            // одной строкой на артикул. Соседний ежедневный экран каталога, не
            // настройка, поэтому рядом с ним, а не под /settings.
            path: "/marketplaces/price-stock",
            handle: { breadcrumb: () => "Цены и остатки" },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/marketplaces/price-stock"),
          },
          {
            // p01-settings-integrations-restructure: старый хаб «Подключение
            // площадок» (w12) больше не экран. Реквизиты всех сервисов живут в
            // разделе «Подключение» (/settings/integrations), а у каждой
            // площадки своя страница (/settings/marketplaces/<слаг>). Адрес
            // остаётся и редиректит: он в закладках владелицы, а якоря `#wb` и
            // `#ozon` из прежнего сайдбара ведут прямо на нужную площадку.
            path: "/settings/marketplaces",
            handle: { breadcrumb: () => t("integrations.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/marketplaces"),
          },
          {
            // w16-mp-scheduler-ops: «Маркетплейсы → Синхронизация» — строка на
            // (площадка, вид): когда последний раз пришло, сколько строк и
            // запросов, когда следующий запуск, текст последней ошибки целиком
            // и предупреждение о ключе, которому осталось меньше 14 дней.
            // Вид, который НИ РАЗУ не запускался, говорит это словами, а не
            // нулём (правило 20a).
            path: "/settings/marketplaces/sync",
            handle: { breadcrumb: () => t("marketplaceSync.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/marketplace-sync"),
          },
          {
            // w18-mp-reviews-desk: «Маркетплейсы → Отзывы» — отзывы и вопросы
            // покупателей с обеих площадок, фильтр «без ответа», черновик
            // ответа в нашей базе. Кнопки отправки на площадку нет: ответ это
            // запись, а площадки у нас только на чтение.
            path: "/settings/marketplaces/reviews",
            handle: { breadcrumb: () => t("marketplaces.desk.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/marketplaces/reviews"),
          },
          {
            // w19-mp-analytics: «Маркетплейсы → Аналитика» — дашборд селлера:
            // продажи по дням и карточкам, ABC/XYZ, оборачиваемость и «дней до
            // нуля», рейтинг продавца и честно неполный P&L. Только чтение:
            // экран складывает mp_order / mp_order_line / mp_offer и к площадке
            // при открытии не обращается (приказ Ивана 2026-09-16 02:46 WITA).
            path: "/settings/marketplaces/analytics",
            handle: { breadcrumb: () => t("marketplaceAnalytics.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/marketplaces/analytics"),
          },
          {
            // p01-settings-integrations-restructure: «Подключение» — хаб всех
            // реквизитов магазина. Приказ Ивана 2026-09-16 20:22 WITA:
            // «перенесем все подключения на страницу /settings/integrations/
            // [robokassa, wildberries, ozon, apiship, cdek]». Хаб показывает
            // только состояние и ссылку; поля живут на странице сервиса.
            path: "/settings/integrations",
            handle: { breadcrumb: () => t("integrations.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/integrations"),
          },
          {
            // Реквизиты Wildberries и ничего больше. Экран площадки — на
            // /settings/marketplaces/wildberries.
            path: "/settings/integrations/wildberries",
            handle: { breadcrumb: () => "Wildberries" },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/integrations/wildberries"),
          },
          {
            path: "/settings/integrations/ozon",
            handle: { breadcrumb: () => "Ozon" },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/integrations/ozon"),
          },
          {
            // Реквизиты Robokassa. Тестовый режим и алгоритм подписи остались
            // на /settings/payments — это поведение магазина, а не его логин.
            path: "/settings/integrations/robokassa",
            handle: { breadcrumb: () => t("integrations.robokassa.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/integrations/robokassa"),
          },
          {
            // Токен ApiShip. Единственная НОВАЯ интеграция задачи: слот
            // `apiship` в tenant_integration_secret плюс проба токена. В
            // чекаут не заведена — i02 замерил ноль тарифов у калькулятора
            // ApiShip, и страница говорит это словами.
            path: "/settings/integrations/apiship",
            handle: { breadcrumb: () => t("integrations.apiship.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/integrations/apiship"),
          },
          {
            // Аккаунт СДЭК. Отправитель, виды доставки, наценка и порог
            // бесплатной доставки остались на /settings/delivery.
            path: "/settings/integrations/cdek",
            handle: { breadcrumb: () => t("integrations.cdek.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/integrations/cdek"),
          },
          {
            // Экран площадки: состояние ключа, права, что связано и что
            // загружено. Полей ключа здесь нет — они на странице подключения.
            path: "/settings/marketplaces/wildberries",
            handle: { breadcrumb: () => "Wildberries" },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/marketplaces/wildberries"),
          },
          {
            path: "/settings/marketplaces/ozon",
            handle: { breadcrumb: () => "Ozon" },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/marketplaces/ozon"),
          },
          {
            // Старый путь страницы Wildberries (w01). Остаётся и редиректит:
            // адрес у владелицы в закладках, ломать его нельзя. Цель сменилась
            // в p01 — теперь это /settings/marketplaces/wildberries, а не якорь
            // `#wb` внутри общего хаба (приказ Ивана 2026-09-16 20:22 WITA).
            path: "/settings/wildberries",
            handle: { breadcrumb: () => t("marketplaces.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/wildberries"),
          },
          {
            // «Ozon» (w24-integration-keys-self-service): адрес, по которому
            // владелица ищет, куда вписать свой Client-Id и ключ. В p01 у Ozon
            // появился собственный экран, и этот путь редиректит на него;
            // поля ключа — на /settings/integrations/ozon. Копии кода это не
            // создаёт: и экран, и форма построены из реестра адаптеров, один
            // компонент на все площадки (правило 20).
            path: "/settings/ozon",
            handle: { breadcrumb: () => t("marketplaces.title") },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/ozon"),
          },
          {
            // «Бренд владельца» (t16-owner-branding): логотип, фавикон,
            // картинка для соцсетей, основной цвет, подпись в подвале. No
            // Admin counterpart — a native install has one build-time theme
            // profile for the whole platform.
            path: "/settings/branding",
            handle: {
              breadcrumb: () => t("brandingSettings.title", { defaultValue: "Бренд" }),
            },
            errorElement: <ErrorBoundary />,
            lazy: () => import("./routes/settings/branding"),
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
            // f14-no-password-reset: request half of the flow, linked from
            // the login screen.
            path: "/forgot-password",
            lazy: () => import("./routes/forgot-password"),
          },
          {
            // f14-no-password-reset: the screen the reset email's link
            // points at (`?token=…&email=…`).
            path: "/reset-password",
            lazy: () => import("./routes/reset-password"),
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
