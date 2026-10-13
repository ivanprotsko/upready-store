import type { PropsResult } from "../../types"
import type { LocalizedText } from "../../shared/localized-text"
import { at, parseEnum, parseHref, parseList, parseLocalizedText, parseObject, parseProps } from "../../shared/parse"

/** The networks a shop keeps a channel on: Telegram, a VK group, a MAX channel. */
export const NETWORKS = ["telegram", "vk", "max"] as const
export type Network = (typeof NETWORKS)[number]

/** Where a channel of each network lives; a link elsewhere is the template's mistake, not a channel. */
export const NETWORK_HOSTS: Record<Network, readonly string[]> = {
  telegram: ["t.me", "telegram.me"],
  vk: ["vk.com", "vk.ru"],
  max: ["max.ru"],
}

/** A button's words while the template gives none: the network's name (BLOCK-CONTRACT.md §2). */
export const NETWORK_LABEL: Record<Network, LocalizedText> = {
  telegram: { ru: "Telegram", en: "Telegram" },
  vk: { ru: "ВКонтакте", en: "VK" },
  max: { ru: "MAX", en: "MAX" },
}

/** A channel of the shop. Without `href` it is a place the shop has not filled yet, and it is not drawn. */
export type Channel = { network: Network; href: string | null; label: LocalizedText }

export type NewsletterSignupProps = {
  heading: LocalizedText
  text: LocalizedText
  /**
   * `channels` only. `email` is refused by the parser: neither the backend nor the storefront has a
   * subscribe endpoint, and a form that posts nowhere would pretend.
   */
  mode: "channels"
  /** At most three, the first one the primary button. */
  channels: Channel[]
  align: "center" | "left"
  /** `muted`: the section stands on a `--muted` panel with the template's radius. */
  tone: "muted" | "plain"
}

/** The section's own words while the block is `lab` (BLOCK-CONTRACT.md §2). */
export const HEADING: LocalizedText = { ru: "Новинки и скидки — первыми", en: "New arrivals and offers, first" }
export const TEXT: LocalizedText = {
  ru: "Подпишитесь на канал магазина: рассказываем о поступлениях и скидках раньше, чем на сайте.",
  en: "Follow the shop's channel: we post new arrivals and offers there before they reach the site.",
}

const parseMode = (value: unknown, path: string): PropsResult<"channels"> =>
  value === "email"
    ? {
        ok: false,
        errors: [`${path}: email needs a subscribe endpoint, and neither the backend nor the storefront has one yet; use channels`],
      }
    : parseEnum(value, path, ["channels"] as const, { fallback: "channels" })

/** An `https://` link to a page of the network's own host, not its front page. */
const onNetwork = (href: string, network: Network) => {
  if (!href.startsWith("https://")) return false
  const url = new URL(href)
  return NETWORK_HOSTS[network].includes(url.hostname.replace(/^www\./, "")) && url.pathname.length > 1
}

const parseChannel = (value: unknown, path: string): PropsResult<Channel> => {
  const read = parseObject<Channel>(value, path, {
    network: (network, networkPath) => parseEnum(network, networkPath, NETWORKS),
    href: (href, hrefPath) => parseHref(href, hrefPath),
    label: (label, labelPath) => parseLocalizedText(label, labelPath, { max: 30, fallback: {} }),
  })
  if (!read.ok) return read
  const { network, href, label } = read.value
  if (href !== null && !onNetwork(href, network)) {
    return {
      ok: false,
      errors: [`${at(path, "href")} must lead to a channel on ${NETWORK_HOSTS[network].join(" or ")} for ${network}`],
    }
  }
  return { ok: true, value: { network, href, label: Object.keys(label).length ? label : NETWORK_LABEL[network] } }
}

export function parseNewsletterSignupProps(input: unknown): PropsResult<NewsletterSignupProps> {
  return parseProps<NewsletterSignupProps>(input, "newsletter/signup", {
    heading: (value, path) => parseLocalizedText(value, path, { max: 90, fallback: HEADING }),
    text: (value, path) => parseLocalizedText(value, path, { max: 240, fallback: TEXT }),
    mode: parseMode,
    channels: (value, path) => parseList(value, path, parseChannel, { max: 3, fallback: [] }),
    align: (value, path) => parseEnum(value, path, ["center", "left"] as const, { fallback: "center" }),
    tone: (value, path) => parseEnum(value, path, ["muted", "plain"] as const, { fallback: "muted" }),
  })
}
