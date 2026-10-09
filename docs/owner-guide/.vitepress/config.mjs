// The documentation site of the guide (t-2026-10-09-104), VitePress with its default theme. publish.mjs builds it once
// per brand and per base, so this file reads both from the environment:
//   HELP_BRAND  JSON { name, logo } of one brands.json row; the platform's default without it
//   HELP_BASE   "/" for the docs hosts, "/help/" for the panel; "/" without it
// It imports nothing from vitepress on purpose. The package is a dependency of apps/tenant-panel, and pnpm does not
// lift it to the repository root, so an import from here would not resolve. The config is a plain object.
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { GUIDE_DIR, PAGES, PAGES_DIR, REPO, pageHeadings, readBrands } from "../lib.mjs"

const brand = process.env.HELP_BRAND ? JSON.parse(process.env.HELP_BRAND) : readBrands().default
const base = process.env.HELP_BASE || "/"
// The logos sit in brands/, which is the public folder of every build, so a logo is served from the root of the site.
const logo = "/" + brand.logo.split("/").pop()

// Every page compiles to a Vue component that imports `vue` and `vue/server-renderer`. Vite looks for them from the
// page's folder up to the repository root, where pnpm does not put them, so they are pointed at the vue that vitepress
// itself uses. Without this the build passes only on a node_modules that happens to have vue at the root.
const fromPanel = createRequire(join(REPO, "apps/tenant-panel/package.json"))
const vue = dirname(createRequire(fromPanel.resolve("vitepress/package.json")).resolve("vue/package.json"))

const titleOf = (name) => readFileSync(join(PAGES_DIR, `${name}.md`), "utf8").match(/^# (.*)$/m)?.[1] ?? name
const linkOf = (name) => (name === "index" ? "/" : `/${name}`)

// Every section with its `## ` headings under it. The section of the open page unfolds by itself.
const sidebar = PAGES.map((name) =>
  name === "index"
    ? { text: "Оглавление", link: "/" }
    : {
        text: titleOf(name),
        link: linkOf(name),
        collapsed: true,
        items: pageHeadings(`${name}.md`).map((h) => ({ text: h.text, link: `${linkOf(name)}#${h.id}` })),
      }
)

export default {
  srcDir: "guide",
  base,
  lang: "ru-RU",
  title: `Справка ${brand.name}`,
  titleTemplate: `:title · ${brand.name}`,
  description: "Справка по панели магазина: где что находится и как сделать частые дела",
  cleanUrls: true,
  lastUpdated: false,
  head: [
    ["meta", { name: "robots", content: "noindex" }],
    ["link", { rel: "icon", href: base.replace(/\/$/, "") + logo }],
  ],
  vite: {
    publicDir: join(GUIDE_DIR, "brands"),
    resolve: { alias: [{ find: /^vue(?=\/|$)/, replacement: vue }] },
  },
  themeConfig: {
    logo,
    siteTitle: brand.name,
    sidebar,
    outline: { level: 2, label: "На этой странице" },
    docFooter: { prev: "Предыдущий раздел", next: "Следующий раздел" },
    sidebarMenuLabel: "Разделы",
    returnToTopLabel: "Наверх",
    darkModeSwitchLabel: "Оформление",
    lightModeSwitchTitle: "Светлая тема",
    darkModeSwitchTitle: "Тёмная тема",
    skipToContentLabel: "К тексту",
    externalLinkIcon: false,
    notFound: {
      title: "Такой страницы нет",
      quote: "Возможно, раздел переехал. Откройте оглавление или найдите нужное через поиск.",
      linkLabel: "к оглавлению справки",
      linkText: "К оглавлению",
      code: "404",
    },
    search: {
      provider: "local",
      options: {
        translations: {
          button: { buttonText: "Поиск", buttonAriaLabel: "Поиск по справке" },
          modal: {
            displayDetails: "Подробнее",
            resetButtonTitle: "Сбросить",
            backButtonTitle: "Закрыть",
            noResultsText: "Ничего не нашлось",
            footer: { selectText: "открыть", navigateText: "выбрать", closeText: "закрыть" },
          },
        },
      },
    },
  },
}
