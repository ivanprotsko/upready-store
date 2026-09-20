import fs from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { test } from "vitest"

import MarkdownContent from "@modules/content/components/markdown-content"

const PAGES = [
  { key: "contacts", title: "Контакты", src: "contact.ru.md" },
  { key: "offer", title: "Оферта", src: "terms.ru.md" },
  { key: "privacy", title: "Политика конфиденциальности", src: "privacy.ru.md" },
]

const DIR =
  "/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/x01-tenant-live-import/pages"

test("render tenant pages through the real MarkdownContent", () => {
  for (const page of PAGES) {
    const body = fs.readFileSync(`${DIR}/${page.src}`, "utf8")
    const html = renderToStaticMarkup(
      <div className="content-container flex flex-col gap-y-6 py-12 max-w-2xl">
        <h1 className="text-2xl-semi text-ui-fg-base">{page.title}</h1>
        <MarkdownContent source={body} />
      </div>
    )
    fs.writeFileSync(
      `/tmp/f07/${page.key}.html`,
      `<!doctype html><html lang="ru"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<link rel="stylesheet" href="./f07.css"></head><body>${html}</body></html>`
    )
    console.log(`WROTE ${page.key} ${html.length}`)
  }
})
