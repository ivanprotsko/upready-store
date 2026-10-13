import type { BlockEntry } from "../../types"

import ContactsStoreMap from "."
import { MAP_LABEL, MAP_LINK_LABEL, SHOW_ON_MAP_LABEL, parseContactsStoreMapProps, type ContactsStoreMapProps } from "./props"

/**
 * The registry entry of `contacts/store-map`: `docs/templates/BLOCK-CONTRACT.md` §1. The sample is a shop with a
 * store of its own and two pick-up points. Every address is on a made-up «Примерная» street, every phone has the
 * unused code 000 and every link a demo handle, so no shot shows a real person's data; the coordinates are
 * points of central Moscow, for the map alone.
 */
export const contactsStoreMap: BlockEntry<ContactsStoreMapProps> = {
  id: "contacts/store-map",
  category: "contacts",
  variant: "store-map",
  title: "Store and pick-up map",
  roles: ["section-header", "map", "card", "description", "contacts", "social-link"],
  data: ["static"],
  status: "lab",
  placement: "home",
  component: ContactsStoreMap,
  parseProps: parseContactsStoreMapProps,
  fixtures: {
    empty: {
      header: null,
      locations: [],
      mapLinkLabel: MAP_LINK_LABEL,
      showOnMapLabel: SHOW_ON_MAP_LABEL,
      mapLabel: MAP_LABEL,
    },
    sample: {
      header: {
        eyebrow: { ru: "Магазины и пункты выдачи", en: "Shops and pick-up points" },
        heading: { ru: "Где забрать заказ", en: "Where to collect your order" },
        description: {
          ru: "Заберите заказ сами — бесплатно и в день заказа, если товар есть в магазине.",
          en: "Collect your order yourself: free, and the same day when the item is in the shop.",
        },
        seeAll: null,
      },
      locations: [
        {
          name: { ru: "Магазин на Примерной", en: "Primernaya Street shop" },
          address: { ru: "Москва, ул. Примерная, 1", en: "1 Primernaya Street, Moscow" },
          hours: { ru: "Ежедневно 10:00–21:00", en: "Daily 10:00–21:00" },
          phone: "+7 (000) 000-00-01",
          coordinates: { lat: 55.7601, lon: 37.6186 },
          note: {
            ru: "Примерочные, обмен и возврат на месте.",
            en: "Fitting rooms; exchanges and returns on the spot.",
          },
          links: [
            { label: { ru: "Telegram", en: "Telegram" }, href: "https://t.me/primer_shop_demo", icon: "send" },
            { label: { ru: "ВКонтакте", en: "VK" }, href: "https://vk.com/primer_shop_demo", icon: "message-circle" },
          ],
        },
        {
          name: { ru: "Пункт выдачи в ТЦ «Пример»", en: "Pick-up point in the Primer mall" },
          address: { ru: "Москва, Примерный проспект, 25, 2 этаж", en: "25 Primerny Avenue, 2nd floor, Moscow" },
          hours: { ru: "Пн–Пт 9:00–20:00, Сб–Вс 10:00–18:00", en: "Mon–Fri 9:00–20:00, Sat–Sun 10:00–18:00" },
          phone: "+7 (000) 000-00-02",
          coordinates: { lat: 55.7387, lon: 37.6032 },
          note: {
            ru: "Заказ хранится 7 дней. Оплата при получении картой или по СБП.",
            en: "Orders are kept for 7 days. Pay on collection by card or SBP.",
          },
          links: [],
        },
        {
          name: { ru: "Пункт выдачи у вокзала", en: "Pick-up point by the station" },
          address: { ru: "Москва, Примерный переулок, 7, вход со двора", en: "7 Primerny Lane, Moscow, entrance from the yard" },
          hours: { ru: "Ежедневно 8:00–22:00", en: "Daily 8:00–22:00" },
          phone: "+7 (000) 000-00-03",
          coordinates: { lat: 55.7765, lon: 37.6553 },
          note: {},
          links: [],
        },
      ],
      mapLinkLabel: MAP_LINK_LABEL,
      showOnMapLabel: SHOW_ON_MAP_LABEL,
      mapLabel: MAP_LABEL,
    },
  },
}
