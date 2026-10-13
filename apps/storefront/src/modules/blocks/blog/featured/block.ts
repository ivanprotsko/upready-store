import type { BlockEntry } from "../../types"

import BlogFeatured from "."
import { ALL_POSTS_LABEL, parseBlogFeaturedProps, type BlogFeaturedProps } from "./props"

/** The registry entry of `blog/featured`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const blogFeatured: BlockEntry<BlogFeaturedProps> = {
  id: "blog/featured",
  category: "blog",
  variant: "featured",
  title: "Featured blog posts",
  roles: ["section-header", "card", "card-image", "card-title", "description", "cta-secondary"],
  data: ["shop", "products", "categories", "static"],
  status: "lab",
  placement: "home",
  component: BlogFeatured,
  parseProps: parseBlogFeaturedProps,
  fixtures: {
    empty: {
      header: null,
      limit: 3,
      columns: 3,
      showDate: true,
      showExcerpt: true,
      showSeeAll: true,
      seeAllLabel: ALL_POSTS_LABEL,
      previewPosts: [],
    },
    sample: {
      header: {
        eyebrow: {},
        heading: { ru: "Из журнала", en: "From the journal" },
        description: {
          ru: "Как выбрать, как ухаживать и что приготовить: пишем о вещах, которые продаём.",
          en: "How to choose, how to care and what to cook: we write about the things we sell.",
        },
        seeAll: null,
      },
      limit: 3,
      columns: 3,
      showDate: true,
      showExcerpt: true,
      showSeeAll: true,
      seeAllLabel: ALL_POSTS_LABEL,
      previewPosts: [
        {
          title: {
            ru: "Чугунная сковорода: как прокалить её в первый раз",
            en: "A cast-iron skillet: seasoning it for the first time",
          },
          excerpt: {
            ru: "Масло, духовка и час времени. Почему тёмный слой на чугуне не грязь, а защита, и как его не смыть.",
            en: "Oil, an oven and an hour. Why the dark layer on cast iron is not dirt but armour, and how not to wash it off.",
          },
          date: "2026-10-06",
          cover: { product: "skillet", index: 0, alt: {} },
        },
        {
          title: {
            ru: "Вафельные полотенца: почему их стирают без кондиционера",
            en: "Waffle towels: why they are washed without softener",
          },
          excerpt: {
            ru: "Кондиционер забивает ячейки, и ткань перестаёт впитывать. Три стирки до мягкости и одна температура на всё.",
            en: "Softener clogs the weave, and the cloth stops drinking. Three washes to softness and one temperature for all.",
          },
          date: "2026-09-29",
          cover: { product: "waffle-towels", index: 0, alt: {} },
        },
        {
          title: { ru: "Глиняный горшок для фасоли: томить, а не варить", en: "A clay bean pot: braise, do not boil" },
          excerpt: {
            ru: "Неглазурованная глина дышит и держит влагу. Замачиваем горшок, ставим в холодную духовку и ждём четыре часа.",
            en: "Unglazed clay breathes and keeps the moisture in. Soak the pot, put it in a cold oven and wait four hours.",
          },
          date: "2026-09-22",
          cover: { product: "bean-pot", index: 0, alt: {} },
        },
        {
          title: { ru: "Как мы выбираем, что продавать", en: "How we choose what to sell" },
          excerpt: {
            ru: "Каждую вещь мы сначала месяц используем дома. Если она не прижилась на нашей кухне, на полку магазина она не попадёт.",
            en: "We use every piece at home for a month first. If it does not settle into our kitchen, it does not reach the shop.",
          },
          date: "2026-09-15",
          cover: null,
        },
      ],
    },
  },
}
