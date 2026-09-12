export interface LogoItem {
  name: string;
  tag: string;
  note: string;
  img: string;
  height: string;
}

// Verbatim from reference/dc-script.js `get logos()` (lines 45-58), which is what actually
// renders the section — props.json carries no `logos` key for this section.
export const logos: LogoItem[] = [
  {
    name: 'Eight Sleep',
    tag: 'b2c',
    note: 'Оптимизация глобального фулфилмента через 10+ 3PL-операторов',
    img: 'https://cdn.sanity.io/images/5a711ubd/production/75dee92c69345c1fef6c121d05fa2827ac718398-120x40.svg',
    height: '30px',
  },
  {
    name: 'Heineken',
    tag: 'b2b',
    note: 'От дистрибьюторов до обработки заказов конечных клиентов',
    img: 'https://cdn.sanity.io/images/5a711ubd/production/75183959297924e02f2b3046e3cc6a7555bcc8fa-117x28.svg',
    height: '30px',
  },
  {
    name: 'Inspired Pet Nutrition',
    tag: 'b2b · ai',
    note: 'Экономия 80% затрат за счёт AI-обработки заказов из email',
    img: 'https://cdn.sanity.io/images/5a711ubd/production/4541bcc390a70129406188dc963768d1de22f309-87x39.svg',
    height: '34px',
  },
  {
    name: 'Redington',
    tag: 'b2b',
    note: 'Автоматизация цифровых продаж на $4+ млрд через B2B-портал',
    img: 'https://cdn.sanity.io/images/5a711ubd/production/a55da925de95f6c7077bb3f04c43ae8e9a3b5f85-120x40.svg',
    height: '30px',
  },
  {
    name: 'Mitsubishi Motors',
    tag: 'b2c',
    note: 'Персонализированное послепродажное обслуживание покупателей новых автомобилей',
    img: 'https://cdn.sanity.io/images/5a711ubd/production/5aecaf36fe55321e848d3b0383fc5f5b0db35eb5-98x26.svg',
    height: '26px',
  },
  {
    name: 'Mandai',
    tag: 'b2c',
    note: 'Продажа билетов: более 100 тыс. заказов в месяц',
    img: 'https://cdn.sanity.io/images/5a711ubd/production/6dfb7b674f03a0b1224cf34c4047681abff53fb7-120x40.svg',
    height: '34px',
  },
  {
    name: 'SPAR',
    tag: 'b2c',
    note: 'Масштабирование quick commerce на 500+ магазинов',
    img: 'https://cdn.sanity.io/images/5a711ubd/production/a8528b03a5bbade41055a0fee528c561c8e02865-120x40.svg',
    height: '30px',
  },
  {
    name: 'Material Bank',
    tag: 'b2b',
    note: 'Единая коммерческая ОС для продаж дизайнерам текстиля',
    img: 'https://cdn.sanity.io/images/5a711ubd/production/c58ffd30583c64dc85f7bea50ad70d8238b3a1ad-103x34.svg',
    height: '32px',
  },
  {
    name: 'Makro Pro',
    tag: 'b2c · b2b',
    note: 'Обработка 5 000+ розничных заказов в вебе и приложении',
    img: 'https://cdn.sanity.io/images/5a711ubd/production/d60d23ed7e0146238ed1a77ccdeb83cb16263cf6-97x26.svg',
    height: '26px',
  },
  {
    name: 'NIO',
    tag: 'b2c',
    note: 'Онлайн-конфигуратор автомобилей для продаж электрокаров в регионе MENA',
    img: 'https://cdn.sanity.io/images/5a711ubd/production/01bcb697c14f9471aaabaee3b9678d0262974cfc-97x36.svg',
    height: '32px',
  },
];

// Verbatim text from reference/rendered/03-social-proof.html.
export const sectionLabel = 'Кто уже на этой системе';
// `{{ nLogos }}` resolves to the position of the "logos" block among the ON blocks in `order`
// (dc-script.js line 319-322) — page-level numbering, not this section's own concern (§3 item 1
// keeps this section isolated). Rendered value at default flag state is "02"; ported verbatim.
export const kickerNumber = '02';
export const kickerText = 'на этой же системе';
export const sameSystemText = 'та же система управления магазином';
