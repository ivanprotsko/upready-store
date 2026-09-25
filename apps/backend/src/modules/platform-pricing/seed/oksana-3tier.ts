import type { PricingDocument } from "../schema";

/**
 * The pricing page Ivan sent on 2026-09-25 (`oksana-3tier-pricing.html`,
 * order o-20260921-01 4.1: «забей в тарифы точно такие же данные как и в html
 * файле»), as the document `PricingDocumentSchema` describes.
 *
 * Tiers, sections, rows, chips and tooltips come from the file's
 * `window.PRICING`, word for word; each tooltip sits on the card feature or row
 * whose text was its key there. The page texts come from its markup, with its
 * non-breaking spaces kept (`\u00a0`), `<br>` as `\n` and `<b>` as `**`. Every
 * button keeps the file's `href`. The tier ids and the final block's
 * `tier_id` are this document's own: the file has neither.
 *
 * `__tests__/seed-matches-html.unit.spec.ts` compares this constant with the
 * file field by field. The file itself is not in the repository; the seed
 * script is `scripts/fixtures/p01-platform-pricing-seed.ts`.
 */
export const OKSANA_3TIER_PRICING: PricingDocument = {
  schema_version: 1,
  page: {
    meta_title: "Тарифы — интернет-магазин под ключ",
    eyebrow: "Тарифы",
    title: "Что входит\nв\u00a0каждый тариф",
    note: "**Магазин остаётся вашим** — без\u00a0аренды и\u00a0ежемесячной платы за\u00a0платформу."
  },
  highlights: [
    {
      icon: "guard",
      label: "Магазин остаётся вашим",
      text: "Сделан под\u00a0вас и\u00a0запущен на\u00a0вашем домене. Без\u00a0аренды чужой платформы и\u00a0ежемесячной платы за\u00a0движок."
    },
    {
      icon: "card",
      label: "Приём оплаты — рубли и\u00a0зарубеж",
      text: "Покупатель платит из\u00a0России или\u00a0из-за\u00a0рубежа, а\u00a0деньги за\u00a0заказы приходят напрямую вам."
    },
    {
      icon: "check",
      label: "Гарантия результата",
      text: "За\u00a0результат отвечаю лично: «доведу или\u00a0верну аванс». Оплата рублями или\u00a0USDT."
    }
  ],
  features_label: "Возможности",
  tiers: [
    {
      id: "start",
      name: "Старт",
      short_name: "",
      price: "300 000 ₽",
      price_note: "",
      recommended: true,
      description: "Рабочий интернет-магазин под ключ с приёмом оплаты.",
      plus: "Входит в «Старт»:",
      features: [
        {
          text: "Каталог, карточки, корзина, оформление",
          tip: "Витрина с категориями и страницами товаров плюс корзина и оформление заказа — всё, чтобы покупатель выбрал и купил."
        },
        {
          text: "Приём оплаты: рубли и из-за рубежа",
          tip: "Оплата картой в рублях, а также приём платежей из-за рубежа. Деньги за заказы приходят вам."
        },
        {
          text: "Деньги за заказы приходят вам",
          tip: "Выручка поступает напрямую вам, без платформы-посредника между вами и деньгами покупателя."
        },
        {
          text: "Данные покупателя для доставки",
          tip: "На оформлении собираются имя, телефон и адрес — всё, что нужно, чтобы отправить заказ."
        },
        {
          text: "Заказ без регистрации",
          tip: "Купить можно сразу, без создания аккаунта — меньше шагов и меньше брошенных корзин."
        },
        {
          text: "Панель: заказы, оплаты, товары, цены",
          tip: "Админка, где вы видите заказы и оплаты, добавляете товары и меняете цены сами, без программиста."
        },
        {
          text: "Онлайн-школа: курсы и доступ к урокам",
          tip: "Простая школа на вашем сайте: курсы, оплата и доступ к урокам в личном кабинете — базовая версия взамен аренды GetCourse."
        },
        {
          text: "Запуск на вашем домене",
          tip: "Магазин публикуется на вашем домене, а не на чужом поддомене платформы."
        },
        {
          text: "Магазин — ваш, без ежемесячной платы",
          tip: "Это ваш магазин, а не аренда: за сам движок нет ежемесячной платы платформе."
        }
      ],
      button: {
        label: "Ответить «да»",
        style: "solid",
        action: {
          type: "link",
          href: "#final"
        }
      }
    },
    {
      id: "growth",
      name: "Рост",
      short_name: "",
      price: "600 000 ₽",
      price_note: "",
      recommended: false,
      description: "Больше продаж — меньшими руками.",
      plus: "Всё из «Старта», плюс:",
      features: [
        {
          text: "ИИ-консультант: подбор по симптомам",
          tip: "Чат-помощник на сайте: расспрашивает покупателя и подбирает подходящие товары, помогает дойти до заказа."
        },
        {
          text: "Telegram-бот + Mini App",
          tip: "Магазин внутри Telegram: каталог и оформление заказа прямо в боте и мини-приложении."
        },
        {
          text: "Вход в магазин из Telegram",
          tip: "Покупатель заходит в магазин одним касанием из Telegram, без отдельной регистрации."
        },
        {
          text: "Журнал статей для SEO",
          tip: "Блог на сайте: статьи приводят бесплатный трафик из поиска и прогревают покупателей."
        }
      ],
      button: {
        label: "Спросить про «Рост»",
        style: "outline",
        action: {
          type: "link",
          href: "#final"
        }
      }
    },
    {
      id: "scale",
      name: "Масштаб",
      short_name: "",
      price: "900 000 ₽",
      price_note: "",
      recommended: false,
      description: "Продажи на автопилоте.",
      plus: "Всё из «Роста», плюс:",
      features: [
        {
          text: "Автопродажи из Instagram",
          tip: "Из Instagram — постов и сообщений — покупатель попадает прямо к оформлению заказа."
        },
        {
          text: "Школа взамен GetCourse — полностью",
          tip: "Полноценная онлайн-школа: тарифы, рассрочка, авто-доступ после оплаты и прогресс по урокам — полностью взамен GetCourse."
        },
        {
          text: "Два контура: Россия + зарубеж",
          tip: "Две настройки витрины — под Россию и под зарубеж: свои способы оплаты, валюты и доставка."
        }
      ],
      button: {
        label: "Спросить про «Масштаб»",
        style: "outline",
        action: {
          type: "link",
          href: "#final"
        }
      }
    },
    {
      id: "global",
      name: "Глобализация",
      short_name: "Глобал.",
      price: "по запросу",
      price_note: "",
      recommended: false,
      description: "Один товар — десятки витрин. Выход на маркетплейсы через их API.",
      plus: "Всё из «Масштаба», плюс:",
      features: [
        {
          text: "Выгрузка каталога на маркетплейсы по API",
          tip: "Товары, фото и цены автоматически уходят на подключённые площадки через их API — без ручного заполнения каждой витрины."
        },
        {
          text: "Синхронизация остатков, цен и заказов",
          tip: "Остатки и цены держатся в актуальном состоянии на всех площадках, а заказы с них подтягиваются автоматически."
        },
        {
          text: "Заказы с площадок — в одной панели",
          tip: "Заказы со всех маркетплейсов собираются в одной админке вместе с заказами вашего сайта."
        },
        {
          text: "Площадки на выбор: Lazada, Shopee и др.",
          tip: "Подключаем нужные вам маркетплейсы из тех, что дают API: Lazada, Shopee, Tokopedia, Amazon, eBay, Etsy, Ozon, Яндекс Маркет, TikTok Shop и другие."
        }
      ],
      button: {
        label: "Спросить про «Глобализацию»",
        style: "outline",
        action: {
          type: "link",
          href: "#final"
        }
      }
    }
  ],
  sections: [
    {
      icon: "box",
      eyebrow: "Магазин — основа",
      heading: "Рабочий магазин, который принимает оплату: покупатель кладёт товар в корзину, оплачивает — вы получаете заказ с адресом.",
      chips: [],
      more_chip: "",
      rows: [
        {
          feature: "Каталог, карточки товаров",
          tip: "Витрина с категориями и страницами товаров: фото, описание, цена, характеристики и варианты.",
          values: {
            start: {
              type: "yes"
            },
            growth: {
              type: "yes"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Корзина и оформление заказа",
          tip: "Покупатель добавляет товары в корзину и оформляет заказ в несколько шагов с вводом адреса доставки.",
          values: {
            start: {
              type: "yes"
            },
            growth: {
              type: "yes"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Мобильная и десктоп-версия",
          tip: "Магазин одинаково удобен на телефоне и на компьютере — вёрстка подстраивается под экран.",
          values: {
            start: {
              type: "yes"
            },
            growth: {
              type: "yes"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Приём оплаты: рубли + из-за рубежа",
          tip: "Оплата картой в рублях, а также приём платежей из-за рубежа. Деньги за заказы приходят вам.",
          values: {
            start: {
              type: "yes"
            },
            growth: {
              type: "yes"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Деньги за заказы приходят вам",
          tip: "Выручка поступает напрямую вам, без платформы-посредника между вами и деньгами покупателя.",
          values: {
            start: {
              type: "yes"
            },
            growth: {
              type: "yes"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Заказ без регистрации",
          tip: "Купить можно сразу, без создания аккаунта — меньше шагов и меньше брошенных корзин.",
          values: {
            start: {
              type: "yes"
            },
            growth: {
              type: "yes"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Сбор данных покупателя для доставки",
          tip: "На оформлении собираются имя, телефон и адрес — всё, что нужно, чтобы отправить заказ.",
          values: {
            start: {
              type: "yes"
            },
            growth: {
              type: "yes"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Панель: заказы, оплаты, товары, цены",
          tip: "Админка, где вы видите заказы и оплаты, добавляете товары и меняете цены сами, без программиста.",
          values: {
            start: {
              type: "yes"
            },
            growth: {
              type: "yes"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Запуск на вашем домене",
          tip: "Магазин публикуется на вашем домене, а не на чужом поддомене платформы.",
          values: {
            start: {
              type: "yes"
            },
            growth: {
              type: "yes"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Магазин ваш — без ежемесячной платы",
          tip: "Это ваш магазин, а не аренда: за сам движок нет ежемесячной платы платформе.",
          values: {
            start: {
              type: "yes"
            },
            growth: {
              type: "yes"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        }
      ]
    },
    {
      icon: "gear",
      eyebrow: "Продажи и автоматизация",
      heading: "Магазин начинает продавать сам. Онлайн-школа в базовой версии — уже в «Старте». ИИ-консультант, Telegram и журнал статей включаются на «Росте», автопродажи из Instagram и второй контур — на «Масштабе».",
      chips: [],
      more_chip: "",
      rows: [
        {
          feature: "Онлайн-школа на вашем сайте",
          tip: "Курсы и доступ к урокам на вашем сайте: базовая версия — уже в «Старте»; полная (тарифы, рассрочка, авто-доступ) — на «Масштабе».",
          values: {
            start: {
              type: "text",
              text: "базовая"
            },
            growth: {
              type: "text",
              text: "базовая"
            },
            scale: {
              type: "text",
              text: "полная"
            },
            global: {
              type: "text",
              text: "полная"
            }
          }
        },
        {
          feature: "ИИ-консультант (подбор по симптомам)",
          tip: "Чат-помощник на сайте: расспрашивает покупателя и подбирает подходящие товары, помогает дойти до заказа.",
          values: {
            start: {
              type: "no"
            },
            growth: {
              type: "yes"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Telegram-бот + Mini App",
          tip: "Магазин внутри Telegram: каталог и оформление заказа прямо в боте и мини-приложении.",
          values: {
            start: {
              type: "no"
            },
            growth: {
              type: "yes"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Вход в магазин из Telegram",
          tip: "Покупатель заходит в магазин одним касанием из Telegram, без отдельной регистрации.",
          values: {
            start: {
              type: "no"
            },
            growth: {
              type: "yes"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Раздел статей / журнал для SEO",
          tip: "Блог на сайте: статьи приводят бесплатный трафик из поиска и прогревают покупателей.",
          values: {
            start: {
              type: "no"
            },
            growth: {
              type: "yes"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Автопродажи из Instagram",
          tip: "Из Instagram — постов и сообщений — покупатель попадает прямо к оформлению заказа.",
          values: {
            start: {
              type: "no"
            },
            growth: {
              type: "no"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Два контура: Россия + зарубеж",
          tip: "Две настройки витрины — под Россию и под зарубеж: свои способы оплаты, валюты и доставка.",
          values: {
            start: {
              type: "no"
            },
            growth: {
              type: "no"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        }
      ]
    },
    {
      icon: "globe",
      eyebrow: "Глобализация — выход на маркетплейсы",
      heading: "Один каталог — много площадок: товары, остатки и цены уходят на международные маркетплейсы через их API, а заказы с них собираются в одной панели.",
      chips: [
        "Lazada",
        "Shopee",
        "Tokopedia",
        "TikTok Shop",
        "Amazon",
        "eBay",
        "Etsy",
        "Allegro",
        "Ozon",
        "Яндекс Маркет",
        "Mercado Libre",
        "Rakuten"
      ],
      more_chip: "и другие с открытым API",
      rows: [
        {
          feature: "Выгрузка каталога на маркетплейсы по API",
          tip: "Товары, фото и цены автоматически уходят на подключённые площадки через их API — без ручного заполнения каждой витрины.",
          values: {
            start: {
              type: "no"
            },
            growth: {
              type: "no"
            },
            scale: {
              type: "no"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Синхронизация остатков, цен и заказов",
          tip: "Остатки и цены держатся в актуальном состоянии на всех площадках, а заказы с них подтягиваются автоматически.",
          values: {
            start: {
              type: "no"
            },
            growth: {
              type: "no"
            },
            scale: {
              type: "no"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Заказы с площадок — в одной панели",
          tip: "Заказы со всех маркетплейсов собираются в одной админке вместе с заказами вашего сайта.",
          values: {
            start: {
              type: "no"
            },
            growth: {
              type: "no"
            },
            scale: {
              type: "no"
            },
            global: {
              type: "yes"
            }
          }
        }
      ]
    },
    {
      icon: "shield",
      eyebrow: "Условия и гарантия",
      heading: "Прозрачные сроки и оплата по приёмке, оплата рублями или USDT и личная гарантия результата на каждом тарифе.",
      chips: [],
      more_chip: "",
      rows: [
        {
          feature: "Срок",
          tip: "Ориентир по срокам: сколько займёт запуск этого тарифа от старта работ до публикации.",
          values: {
            start: {
              type: "text",
              text: "до 10 раб. дней"
            },
            growth: {
              type: "text",
              text: "по согласованию"
            },
            scale: {
              type: "text",
              text: "по согласованию"
            },
            global: {
              type: "text",
              text: "по согласованию"
            }
          }
        },
        {
          feature: "Оплата",
          tip: "Как разбит платёж по этому тарифу.",
          values: {
            start: {
              type: "text",
              text: "150к + 150к по приёмке"
            },
            growth: {
              type: "text",
              text: "поэтапно"
            },
            scale: {
              type: "text",
              text: "поэтапно"
            },
            global: {
              type: "text",
              text: "поэтапно"
            }
          }
        },
        {
          feature: "Оплата рублями или USDT",
          tip: "Оплатить работу можно в рублях или в USDT — как вам удобнее.",
          values: {
            start: {
              type: "yes"
            },
            growth: {
              type: "yes"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        },
        {
          feature: "Гарантия «доведу или верну аванс»",
          tip: "Если не доведу тариф до оговорённого результата — возвращаю аванс. Личная гарантия.",
          values: {
            start: {
              type: "yes"
            },
            growth: {
              type: "yes"
            },
            scale: {
              type: "yes"
            },
            global: {
              type: "yes"
            }
          }
        }
      ]
    }
  ],
  drawer: {
    eyebrow: "Что это значит",
    availability_label: "В каком тарифе",
    yes_label: "✓ есть",
    no_label: "— нет",
    close_label: "Закрыть"
  },
  explainers: [
    {
      title: "Чем это отличается от\u00a0Tilda или\u00a0готового движка типа магазина на\u00a0WordPress",
      text: "Там вы\u00a0арендуете чужую платформу и\u00a0платите каждый месяц. Здесь магазин — **ваш**: сделан под\u00a0вас, без\u00a0потолка по\u00a0росту, деньги за\u00a0заказы приходят напрямую вам, а\u00a0за\u00a0результат я\u00a0отвечаю лично — с\u00a0гарантией."
    },
    {
      title: "Что оплачивается отдельно от\u00a0стоимости работ",
      text: "Напрямую и\u00a0на\u00a0ваше имя: аренда сервера (на\u00a0старте — несколько тысяч\u00a0₽/мес), домен и\u00a0комиссия платёжной системы с\u00a0каждого платежа. **За\u00a0сам движок магазина платить не\u00a0нужно.**"
    }
  ],
  final: {
    title: "Начнём со\u00a0«Старта»?",
    text: "Напишите в\u00a0ответ одно слово «да» — и\u00a0я\u00a0пришлю договор и\u00a0реквизиты. Решать сейчас нужно только по\u00a0«Старту», остальное достроим позже.",
    tier_id: "start",
    button: {
      label: "Ответить «да»",
      style: "solid",
      action: {
        type: "link",
        href: "#"
      }
    }
  }
};
