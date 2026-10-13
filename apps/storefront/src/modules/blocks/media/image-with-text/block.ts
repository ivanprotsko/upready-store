import type { BlockEntry } from "../../types"

import ImageWithText from "."
import { parseImageWithTextProps, type ImageWithTextProps } from "./props"

/** The registry entry of `media/image-with-text`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const imageWithText: BlockEntry<ImageWithTextProps> = {
  id: "media/image-with-text",
  category: "media",
  variant: "image-with-text",
  title: "Image with text",
  roles: ["media", "label", "heading", "description", "cta-primary"],
  data: ["products", "categories", "static"],
  status: "lab",
  placement: "home",
  component: ImageWithText,
  parseProps: parseImageWithTextProps,
  fixtures: {
    empty: {
      image: null,
      eyebrow: {},
      heading: {},
      text: {},
      button: null,
      imageSide: "left",
      imageWidth: "1/2",
      imageAspect: "auto",
      verticalAlign: "center",
      tone: "plain",
    },
    sample: {
      image: { product: "braiser", index: 0, alt: {} },
      eyebrow: { ru: "Эмалированный чугун", en: "Enamelled cast iron" },
      heading: {
        ru: "Широкое дно, и курица румянится, а не тушится",
        en: "A wide base, so the chicken browns instead of stewing",
      },
      text: {
        ru: "Шесть куриных бёдер ложатся в один слой.\nЧугун держит жар ровно, а эмаль не боится кислого соуса.",
        en: "Six chicken thighs sit in one layer.\nThe iron holds its heat evenly, and the enamel does not mind an acid sauce.",
      },
      button: { label: { ru: "Смотреть жаровню", en: "See the braiser" }, href: "/products/braiser" },
      imageSide: "left",
      imageWidth: "1/2",
      imageAspect: "auto",
      verticalAlign: "center",
      tone: "plain",
    },
  },
}
