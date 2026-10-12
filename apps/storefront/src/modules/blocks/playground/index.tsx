import { Suspense, type ComponentType, type ReactNode } from "react"
import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { listCategories } from "@lib/data/categories"
import { getTenantHome } from "@lib/data/tenant-home"
import { TEMPLATE_IDS, getTemplate } from "@lib/templates/catalog"
import { categoriesWithImages, categoryImage } from "@lib/util/category-image"
import { localizedHero } from "@lib/util/localized-hero"
import { HOME_SECTION_CLASS } from "@modules/home/components/listing-section"
import type { HomeHeroProps } from "@modules/home/variants/types"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"

import { BLOCKS } from "../registry"
import BlockSection from "../shared/block-section"
import { SEE_ALL_LABEL, type SectionHeader } from "../shared/section-header"
import type { BlockEntry, BlockId } from "../types"

/** `hero/g` → `block-hero-g`; the shots script reads these anchors back off the page. */
export const blockAnchor = (id: string, state: "live" | "empty") =>
  `block-${id.replace(/\//g, "-")}${state === "empty" ? "-empty" : ""}`

/** The shop's own category tiles: its categories that carry a picture, at most six. */
async function shopTiles() {
  try {
    const categories = await listCategories({
      fields: "id,handle,name,rank,metadata,parent_category_id,*category_children",
    })
    return categoriesWithImages(categories, 6).map((category) => ({
      categoryHandle: category.handle as string,
      label: category.name,
      image: categoryImage(category).url as string,
    }))
  } catch {
    return []
  }
}

/** The section shell's header with every part filled, for its own anchor in the shots. */
const SHELL_HEADER: SectionHeader = {
  eyebrow: { ru: "Подборка недели", en: "This week's pick" },
  heading: { ru: "Всё для неспешного утра", en: "Everything for a slow morning" },
  description: {
    ru: "Чайники, турки и чашки, которые мы сами берём на кухню. Привезём завтра.",
    en: "Kettles, pots and cups we take to our own kitchen. Delivered tomorrow.",
  },
  seeAll: { href: "/store", label: SEE_ALL_LABEL },
}

/**
 * The block playground (t-2026-10-12-33): every variant of the registry on this shop's
 * real catalogue, in registry order, each under its own anchor, and the empty-state fixture
 * of every block that has one. Above them, the links to each template's preview. The shots
 * script (`scripts/template-shots.mjs`) walks the anchors at 360, 768 and 1280.
 *
 * The composition variants get what `(main)/page.tsx` gives them: the shop's hero copy, its
 * products source, its own tiles. The captions are registry data for the people checking
 * the blocks; the page exists only behind `STOREFRONT_TEMPLATE_PREVIEW=1`.
 */
export default async function BlockPlayground() {
  const [home, locale, t, tiles] = await Promise.all([
    getTenantHome(),
    getLocale(),
    getTranslations("CategoryMenu"),
    shopTiles(),
  ])
  const heroContent = localizedHero(home?.content.hero, locale)
  const heroProps: HomeHeroProps = heroContent
    ? {
        title: heroContent.title || null,
        subtitle: heroContent.subtitle || null,
        ctaLabel: heroContent.cta_label || null,
        ctaHref: heroContent.cta_href || null,
        imageUrl: heroContent.image_url || null,
        profileFallback: false,
      }
    : {}

  const live = (entry: BlockEntry): ReactNode => {
    const Block = entry.component as ComponentType<Record<string, unknown>>
    switch (entry.category) {
      case "hero":
        return <Block {...heroProps} />
      case "tiles":
        return <Block heading={t("title")} tiles={tiles} />
      case "listing":
        return (
          <ul className="flex flex-col gap-x-6">
            <Suspense
              fallback={
                <li className={HOME_SECTION_CLASS}>
                  <SkeletonProductGrid numberOfProducts={4} />
                </li>
              }
            >
              <Block products={home?.content.products} />
            </Suspense>
          </ul>
        )
      default:
        return entry.fixtures ? <Block {...entry.fixtures.sample} /> : <Block />
    }
  }

  const templates = TEMPLATE_IDS.map((id) => ({ id, template: getTemplate(id) }))

  return (
    <div className="flex flex-col gap-12 py-8" data-block-playground="">
      <nav className="content-container flex flex-wrap gap-3" aria-label="templates">
        {templates.map(({ id, template }) => (
          <Link
            key={id}
            href={`/?template=${id}`}
            data-template-id={id}
            data-template-valid={template ? "true" : "false"}
            className="rounded-rounded border border-ui-border-base px-3 py-2 text-sm text-ui-fg-base hover:bg-ui-bg-base-hover"
          >
            {template?.manifest.title ?? id}
          </Link>
        ))}
      </nav>
      <section
        id={blockAnchor("shared/block-section", "live")}
        data-block-anchor="shared/block-section"
        data-block-state="live"
        className="flex flex-col gap-3"
      >
        <p className="content-container font-mono text-xs text-ui-fg-muted">
          shared/block-section · the shell every home block wraps itself in · header only
        </p>
        <div>
          <BlockSection block={"shared/block-section" as BlockId} locale={locale} header={SHELL_HEADER} />
        </div>
      </section>
      {BLOCKS.map((entry) => {
        const Block = entry.component as ComponentType<Record<string, unknown>>
        const caption = `${entry.id} · ${entry.title} · ${entry.status} · ${entry.data.join(", ")}`
        return (
          <div key={entry.id} className="flex flex-col gap-12">
            <section
              id={blockAnchor(entry.id, "live")}
              data-block-anchor={entry.id}
              data-block-state="live"
              className="flex flex-col gap-3"
            >
              <p className="content-container font-mono text-xs text-ui-fg-muted">{caption}</p>
              <div>{live(entry)}</div>
            </section>
            {entry.fixtures ? (
              <section
                id={blockAnchor(entry.id, "empty")}
                data-block-anchor={entry.id}
                data-block-state="empty"
                className="flex flex-col gap-3"
              >
                <p className="content-container font-mono text-xs text-ui-fg-muted">{`${caption} · empty`}</p>
                <div>
                  <Block {...entry.fixtures.empty} />
                </div>
              </section>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
