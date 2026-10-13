import type { BlockEntry } from "../../types"

import VideoEmbed from "."
import { PLAY_LABEL, parseVideoEmbedProps, type VideoEmbedProps } from "./props"

/** The registry entry of `video/embed`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const videoEmbed: BlockEntry<VideoEmbedProps> = {
  id: "video/embed",
  category: "video",
  variant: "embed",
  title: "Video with a cover",
  roles: ["video-player", "headline", "description", "cta-primary"],
  data: ["products", "categories", "static"],
  status: "lab",
  placement: "home",
  component: VideoEmbed,
  parseProps: parseVideoEmbedProps,
  fixtures: {
    empty: {
      video: null,
      cover: null,
      heading: {},
      text: {},
      button: null,
      playLabel: PLAY_LABEL,
      textPosition: "above",
      aspect: "16/9",
      width: "container",
      loop: false,
      muted: false,
    },
    sample: {
      video: { url: "https://www.youtube.com/watch?v=y-3W2A1W7bE" },
      cover: { product: "skillet", index: 0, alt: { ru: "Чугунная сковорода", en: "A cast iron skillet" } },
      heading: { ru: "Первая неделя с чугунной сковородой", en: "Your cast iron skillet's first week" },
      text: {
        ru: "Как мыть, сушить и смазывать сковороду, чтобы слой масла рос с каждой готовкой.\nВидео производителя, Lodge Cast Iron.",
        en: "How to wash, dry and oil the skillet so its seasoning grows with every meal.\nA video by the maker, Lodge Cast Iron.",
      },
      button: { label: { ru: "Смотреть сковороду", en: "See the skillet" }, href: "/products/skillet" },
      playLabel: PLAY_LABEL,
      textPosition: "left",
      aspect: "16/9",
      width: "container",
      loop: false,
      muted: false,
    },
  },
}
