export interface OpsSlide {
  n: string;
  title: string;
  desc: string;
  img: string;
}

// Verbatim text from reference/rendered/08-operations.html.
export const sectionLabel = 'Операции';
// `{{ nOps }}` resolves to the position of the "ops" block among the ON blocks in `order`
// (dc-script.js line 319-322) — page-level numbering, not this section's own concern (§3 item 1
// keeps this section isolated). Rendered value at default flag state is "06"; ported verbatim.
export const kickerNumber = '06';
export const kickerText = 'операции';
export const headingLine1 = 'Управляйте продажами';
export const headingLine2 = 'без сложных настроек';
export const bodyText =
  'Панель управления магазином, которую вы получаете вместе с установкой: товары, каналы продаж, склады, регионы и промоакции.';

// Verbatim from reference/dc-script.js `get opsSlides()` (lines 60-68), which is what actually
// renders the section — props.json carries no `opsSlides` key for this section.
export const opsSlides: OpsSlide[] = [
  {
    n: '01',
    title: 'Продвинутое управление товарами',
    desc: 'Создавайте насыщенные карточки товаров, собирайте бандлы и легко управляйте большими ассортиментами с помощью массового редактора.',
    img: 'https://cdn.sanity.io/images/5a711ubd/production/67d3428e87728ff87f57b95518bfcd75d841050b-2176x1960.jpg?w=800',
  },
  {
    n: '02',
    title: 'Множество каналов продаж',
    desc: 'Настраивайте каналы продаж с разными правилами и товарами: мультимагазины, POS, приложения и не только.',
    img: 'https://cdn.sanity.io/images/5a711ubd/production/ff1687455ac13ddce1156aafdb3d742aaeec67fb-2176x1960.jpg?w=800',
  },
  {
    n: '03',
    title: 'Склады и мультискладской учёт',
    desc: 'Резервируйте товар под заказы, упрощайте сложный складской учёт и держите остатки синхронными между складами.',
    img: 'https://cdn.sanity.io/images/5a711ubd/production/fa6f93d4932f3921211ccae6f3dae731fbf621d9-2176x1960.jpg?w=800',
  },
  {
    n: '04',
    title: 'Мультирегиональность по умолчанию',
    desc: 'Добавляйте валюты, применяйте локальные налоговые правила и задавайте региональные настройки доставки, оплаты, скидок и не только.',
    img: 'https://cdn.sanity.io/images/5a711ubd/production/0f115511b4cbdc2894f7bfd0ed1fc57efda4e6a8-2176x1960.jpg?w=800',
  },
  {
    n: '05',
    title: 'Продвинутый движок промоакций',
    desc: 'Настраивайте сложные правила промоакций: кампании, спеццены для клиентов и B2B, бесплатную доставку и не только.',
    img: 'https://cdn.sanity.io/images/5a711ubd/production/1d10f87a23c08d4b6dce0b7a496a2fdfdd6fe224-2176x1960.jpg?w=800',
  },
];
