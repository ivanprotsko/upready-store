// Every frame of the owner guide, one entry per screenshot. A guide page shows a frame as
// `![…](shots/<id>.png)`; `node docs/owner-guide/check.mjs` fails when a page names a frame that is not here.
//
//   id       file name of the frame, `<chapter>-<what>`
//   role     who is logged in: owner | manager | operator; null = the login screen, nobody logged in
//   path     panel address; `{name}` is filled from the stand's ids file (shoot.mjs --ids), see README.md
//   steps    what to do before the shot: { click }, { scroll }, { wait: ms }
//   mark     what to frame in red on the shot, so the reader sees where to click
//   full     shoot the whole page, not the 1440×900 window
//   sources  repo paths of the code that draws the frame; the menu (lib.mjs MENU) is added unless menu: false
//   i18n     key prefixes in ru.json whose strings the frame shows
//
// A target is { role, name } (an ARIA role and its accessible name), { text } or { css }.

const P = "apps/tenant-panel/src/"
const R = (...dirs) => dirs.map((d) => P + d)

export const SCENES = [
  // 01 — вход, меню, роли
  { id: "01-login", role: null, menu: false, path: "/login", mark: { css: "form" }, sources: R("routes/login"), i18n: ["login.", "auth."] },
  { id: "01-home-owner", role: "owner", path: "/", sources: R("routes/home"), i18n: ["home.", "overview.", "salesSummary."] },
  { id: "01-home-manager", role: "manager", path: "/", sources: R("routes/home", "components/authentication"), i18n: ["home.", "overview."] },
  { id: "01-home-operator", role: "operator", path: "/", sources: R("routes/home", "components/authentication"), i18n: ["home.", "overview."] },
  { id: "01-no-access", role: "operator", path: "/products", sources: R("components/authentication/permission-outlet"), i18n: ["noAccess."] },
  { id: "01-profile", role: "manager", path: "/settings/profile", mark: { role: "button", name: "Изменить" }, sources: R("routes/profile"), i18n: ["profile."] },

  // 02 — заказы
  { id: "02-orders", role: "manager", path: "/orders", sources: R("routes/orders/order-list", "routes/orders/common"), i18n: ["orders.", "filters."] },
  { id: "02-order-pack", role: "manager", path: "/orders/{orderPack}", mark: { role: "link", name: "Собрать" }, sources: R("routes/orders/order-detail"), i18n: ["orders."] },
  // The form is opened by «Собрать» itself: the link carries ?requires_shipping=, and the form
  // opened by its bare address lists no parcel lines («Нет товаров для сборки»).
  { id: "02-order-pack-form", role: "manager", path: "/orders/{orderPack}", steps: [{ click: { role: "link", name: "Собрать" } }, { wait: 1200 }], sources: R("routes/orders/order-create-fulfillment", "routes/orders/order-detail"), i18n: ["orders.fulfillment."] },
  { id: "02-order-packed", role: "manager", path: "/orders/{orderPacked}", mark: { role: "button", name: "Передать в доставку" }, sources: R("routes/orders/order-detail"), i18n: ["orders."] },
  { id: "02-order-ship-form", role: "manager", path: "/orders/{orderPacked}", steps: [{ click: { role: "button", name: "Передать в доставку" } }, { wait: 1200 }], sources: R("routes/orders/order-create-shipment", "routes/orders/order-detail"), i18n: ["orders.fulfillment.", "orders.shipment."] },
  { id: "02-order-delivery", role: "manager", path: "/orders/{orderShipped}", sources: R("routes/orders/order-detail"), i18n: ["orders."] },
  { id: "02-order-payment", role: "manager", path: "/orders/{orderPaymentWait}", steps: [{ scroll: { text: "Подтвердить оплату" } }], mark: { role: "button", name: "Подтвердить оплату" }, sources: R("routes/orders/order-detail/components/order-payment-section"), i18n: ["orders.payment."] },
  { id: "02-order-course", role: "manager", path: "/orders/{orderCourse}", sources: R("routes/orders/order-detail"), i18n: ["orders.nextStep."] },

  // 03 — покупатели и отзывы
  { id: "03-customers", role: "manager", path: "/customers", sources: R("routes/customers"), i18n: ["customers."] },
  { id: "03-reviews", role: "manager", path: "/reviews", mark: { role: "button", name: "Опубликовать" }, sources: R("routes/reviews") },

  // 04 — товары
  { id: "04-products", role: "manager", path: "/products", sources: R("routes/products/product-list"), i18n: ["products.", "filters."] },
  { id: "04-product", role: "manager", path: "/products/{product}", sources: R("routes/products/product-detail"), i18n: ["products."] },
  { id: "04-product-edit", role: "manager", path: "/products/{product}/edit", mark: { css: '[role="dialog"] :text-is("Отметка для закона")' }, sources: R("routes/products/product-edit"), i18n: ["products.edit.", "products.regulatedAs.", "products.fields."] },
  { id: "04-product-photos", role: "manager", path: "/products/{product}", steps: [{ scroll: { role: "heading", name: "Фотографии" } }], mark: { role: "heading", name: "Фотографии" }, sources: R("routes/products/product-detail", "routes/products/product-media"), i18n: ["products.media."] },
  { id: "04-product-prices", role: "manager", path: "/products/{product}/prices", sources: R("routes/products/product-prices"), i18n: ["products."] },
  { id: "04-product-translations", role: "manager", path: "/products/{product}/translations", sources: R("routes/products/product-translations"), i18n: ["translations.", "products."] },
  { id: "04-categories", role: "manager", path: "/categories", sources: R("routes/categories"), i18n: ["categories."] },

  // 05 — курсы
  { id: "05-courses", role: "manager", path: "/courses", sources: R("routes/courses/course-list", "routes/courses/course-labels.ts"), i18n: ["coursePage."] },
  { id: "05-course-lessons", role: "manager", path: "/courses/{course}", mark: { role: "button", name: "Добавить урок" }, sources: R("routes/courses/course-detail", "routes/courses/course-labels.ts"), i18n: ["coursePage."] },
  { id: "05-course-page", role: "manager", path: "/courses/{course}", steps: [{ scroll: { role: "heading", name: "Страница курса" } }], mark: { role: "heading", name: "Страница курса" }, sources: R("routes/courses/course-detail", "routes/courses/course-page.ts"), i18n: ["coursePage."] },
  { id: "05-lesson", role: "manager", path: "/courses/{course}/lessons/{lesson}", sources: R("routes/courses/lesson-edit", "routes/courses/lesson-form"), i18n: ["coursePage."] },
  { id: "05-lesson-new", role: "manager", path: "/courses/{course}/lessons/new", sources: R("routes/courses/lesson-new", "routes/courses/lesson-form"), i18n: ["coursePage."] },

  // 06 — витрина и маркетинг
  { id: "06-home-settings", role: "manager", path: "/home-settings", sources: R("routes/home-settings"), i18n: ["homeSettings."] },
  { id: "06-banners", role: "manager", path: "/home-settings", steps: [{ scroll: { role: "heading", name: "Баннеры на главной" } }], mark: { role: "button", name: "Добавить баннер" }, sources: R("routes/home-settings"), i18n: ["homeSettings."] },
  { id: "06-pages", role: "manager", path: "/pages", sources: R("routes/pages") },
  { id: "06-journal", role: "manager", path: "/journal", mark: { role: "button", name: "Новая статья" }, sources: R("routes/journal") },
  { id: "06-branding", role: "manager", path: "/settings/branding", sources: R("routes/settings/branding"), i18n: ["brandingSettings."] },
  { id: "06-promotions", role: "manager", path: "/promotions", sources: R("routes/promotions"), i18n: ["promotions."] },

  // 07 — настройки владелицы
  { id: "07-shipping", role: "owner", path: "/shipping", sources: R("routes/shipping"), i18n: ["shippingProfile."] },
  { id: "07-cdek", role: "owner", path: "/settings/delivery", sources: R("routes/settings/delivery"), i18n: ["deliverySettings."] },
  { id: "07-payments", role: "owner", path: "/settings/payments", sources: R("routes/settings/payments"), i18n: ["paymentSettings."] },
  { id: "07-requisites", role: "owner", path: "/settings/requisites", full: true, sources: R("routes/settings/requisites") },
  { id: "07-staff", role: "owner", path: "/settings/staff", mark: { role: "button", name: "Добавить сотрудника" }, sources: R("routes/settings/staff"), i18n: ["staff."] },
  { id: "07-staff-add", role: "owner", path: "/settings/staff", steps: [{ click: { role: "button", name: "Добавить сотрудника" } }, { wait: 800 }], sources: R("routes/settings/staff"), i18n: ["staff."] },
  { id: "07-locale", role: "owner", path: "/settings/locale", sources: R("routes/settings/locale"), i18n: ["localeSettings."] },
  { id: "07-notifications", role: "owner", path: "/settings/notifications", sources: R("routes/settings/notifications"), i18n: ["notificationSettings."] },
]
