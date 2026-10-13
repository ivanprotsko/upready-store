import { getLocale } from "next-intl/server"

import { resolveImageRef } from "@lib/data/block-image"

import BlockSection from "../../shared/block-section"
import { pickText, type LocalizedText } from "../../shared/localized-text"
import {
  BUTTON_LABEL,
  CLOSE_LABEL,
  NEXT_LABEL,
  PAUSE_LABEL,
  PLAY_LABEL,
  PREVIOUS_LABEL,
  REGION_LABEL,
  SLIDE_LABEL,
  type MediaStoriesProps,
  type Story,
} from "./props"
import StoriesViewer, { type ViewerSlide, type ViewerStory } from "./viewer"

/**
 * `media/stories` (t-2026-10-12-33, R2 build list item 11): a row of round covers, as the stories of VK, Ozon
 * and Wildberries, each opening its slides in a full-screen dialog. Measured against InSales Cream and Stories
 * («Истории» under the first screen: 64 px circles with a ring, the title under each).
 *
 * The server resolves every picture (`ImageRef`) and drops a slide whose picture the shop does not have, then
 * a story with no slide left. A story without a cover of its own, or whose cover is missing, shows its first
 * slide's picture. No story left: nothing is drawn. The row and the dialog: `./viewer.tsx`.
 */
export default async function MediaStories({
  header,
  stories,
  label,
  slideLabel,
  previousLabel,
  nextLabel,
  closeLabel,
  pauseLabel,
  playLabel,
}: MediaStoriesProps) {
  const locale = await getLocale()
  const words = (text: LocalizedText, fallback: LocalizedText) =>
    pickText(text, locale) ?? pickText(fallback, locale) ?? ""

  const resolveStory = async (story: Story): Promise<ViewerStory | null> => {
    const title = pickText(story.title, locale)
    if (!title) return null
    const [cover, ...slides] = await Promise.all([
      story.cover ? resolveImageRef(story.cover, locale) : null,
      ...story.slides.map(async (slide): Promise<ViewerSlide | null> => {
        const image = await resolveImageRef(slide.image, locale)
        if (!image) return null
        return {
          image: { url: image.url, alt: image.alt },
          text: pickText(slide.text, locale),
          button: slide.button ? { href: slide.button.href, label: words(slide.button.label, BUTTON_LABEL) } : null,
        }
      }),
    ])
    const shown = slides.filter((slide): slide is ViewerSlide => slide !== null)
    if (shown.length === 0) return null
    const circle = cover ? { url: cover.url, alt: cover.alt } : shown[0].image
    return { key: `${title}|${circle.url}`, title, cover: circle, slides: shown }
  }

  const drawn = (await Promise.all(stories.map(resolveStory))).filter((story): story is ViewerStory => story !== null)
  if (drawn.length === 0) {
    return null
  }

  return (
    <BlockSection block="media/stories" locale={locale} header={header}>
      <StoriesViewer
        stories={drawn}
        labels={{
          region: words(label, REGION_LABEL),
          slide: words(slideLabel, SLIDE_LABEL),
          previous: words(previousLabel, PREVIOUS_LABEL),
          next: words(nextLabel, NEXT_LABEL),
          close: words(closeLabel, CLOSE_LABEL),
          pause: words(pauseLabel, PAUSE_LABEL),
          play: words(playLabel, PLAY_LABEL),
        }}
      />
    </BlockSection>
  )
}
