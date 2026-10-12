import type { BlockEntry } from "../../types"

import TestimonialsCards from "."
import {
  LIST_LABEL,
  NEXT_LABEL,
  PREVIOUS_LABEL,
  RATING_LABEL,
  parseTestimonialsCardsProps,
  type TestimonialsCardsProps,
} from "./props"

const labels = {
  ratingLabel: RATING_LABEL,
  listLabel: LIST_LABEL,
  previousLabel: PREVIOUS_LABEL,
  nextLabel: NEXT_LABEL,
}

/**
 * The registry entry of `testimonials/cards`: `docs/templates/BLOCK-CONTRACT.md` §1. The names in
 * the sample are invented first names; a fixture, a shot or a test never carries a real buyer's.
 */
export const testimonialsCards: BlockEntry<TestimonialsCardsProps> = {
  id: "testimonials/cards",
  category: "testimonials",
  variant: "cards",
  title: "Testimonial cards",
  roles: ["section-header", "testimonial-card", "quote-text", "author-info", "star-rating", "trigger"],
  data: ["static"],
  status: "lab",
  placement: "home",
  component: TestimonialsCards,
  parseProps: parseTestimonialsCardsProps,
  fixtures: {
    empty: { header: null, items: [], layout: "grid", showRating: true, ...labels },
    sample: {
      header: {
        eyebrow: { ru: "Отзывы", en: "Reviews" },
        heading: { ru: "Что говорят покупатели", en: "What our customers say" },
        description: {
          ru: "Что нам пишут в чат и на почту после доставки, слово в слово.",
          en: "What people write to our chat and mail after delivery, word for word.",
        },
        seeAll: null,
      },
      items: [
        {
          quote: {
            ru: "Заказала чайник в пятницу вечером, в понедельник уже пила из него чай. Упаковали так, что коробку не стыдно дарить.",
            en: "I ordered the kettle on Friday evening and was drinking tea from it on Monday. Packed so well the box could be a gift.",
          },
          name: { ru: "Марина", en: "Marina" },
          city: { ru: "Казань", en: "Kazan" },
          rating: 5,
        },
        {
          quote: {
            ru: "Перепутал размер, написал в чат — через десять минут ответили и оформили обмен без лишних вопросов.",
            en: "I picked the wrong size, wrote to the chat, and ten minutes later they had arranged the exchange, no questions asked.",
          },
          name: { ru: "Тимур", en: "Timur" },
          city: { ru: "Пермь", en: "Perm" },
          rating: 5,
        },
        {
          quote: {
            ru: "Чашки как на фото, глазурь ровная. Одна звезда долой за доставку: курьер приехал на день позже.",
            en: "The cups look just like the photos, the glaze is even. One star off for delivery: the courier came a day late.",
          },
          name: { ru: "Вера", en: "Vera" },
          city: { ru: "Тверь", en: "Tver" },
          rating: 4,
        },
        {
          quote: {
            ru: "Беру здесь третий раз. Всё приходит в срок, а к заказу кладут записку от руки — мелочь, а приятно.",
            en: "My third order here. Everything arrives on time, and there is a handwritten note in the box — a small thing, but nice.",
          },
          name: { ru: "Арсений", en: "Arseny" },
          city: { ru: "Екатеринбург", en: "Yekaterinburg" },
          rating: 5,
        },
        {
          quote: {
            ru: "Турка греется равномерно, кофе не убегает. Ручка не нагревается даже на газу.",
            en: "The coffee pot heats evenly and nothing boils over. The handle stays cool even on gas.",
          },
          name: { ru: "Олеся", en: "Olesya" },
          city: { ru: "Новосибирск", en: "Novosibirsk" },
          rating: 5,
        },
      ],
      layout: "carousel",
      showRating: true,
      ...labels,
    },
  },
}
