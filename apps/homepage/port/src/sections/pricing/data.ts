export interface ExtraItem {
  t: string;
  todo: string;
}

// Verbatim text from reference/rendered/09-pricing.html.
export const sectionLabel = 'Цены';

// `{{ nPricing }}` resolves to the position of the "pricing" block among the ON blocks in
// dc-script.js `order` (lines 319-322) — page-level numbering shared across all 12 optional
// sections (proof/frame/included/pricing/faq toggles), not this section's own concern (contract
// §3 item 1 keeps this section isolated). Rendered value at the reference's flag state is "07";
// ported verbatim — see NOTES.md "Needs from merger" if live renumbering is wanted.
export const kickerNumber = '07';
export const kickerText = 'цены';

export const heading = 'Цены';

export const guaranteeLabel = 'гарантия';
export const guaranteeText =
  '7 дней гарантии возврата. Не подошло — вернём 4 900 ₽ в течение 7 дней после запуска, без объяснения причин. Магазин при этом отключается.';
export const guaranteeNote =
  'Гарантия распространяется на установку магазина. Оформление под бренд — работа под конкретного заказчика, возврату не подлежит. Стоимость домена, если мы покупали его для вас, удерживается по факту.';

export const extraLabel = 'оплачивается отдельно';

// Verbatim from dc-script.js `extra` array (lines 391-396). `todo` is populated only when
// `showTodoMarkers` (props.json default: true) is on — ported as the always-shown reference
// state; see NOTES.md.
export const extraItems: ExtraItem[] = [
  { t: 'Перенос каталога с Wildberries (карточки, фото, описания) — от', todo: 'todo: catalog_migration_price' },
  { t: 'Хостинг и домен —', todo: 'todo: hosting_monthly' },
  { t: 'Комиссия платёжного сервиса —', todo: 'todo: payment_fee' },
  { t: 'Реклама и продвижение', todo: '' },
];

export const needsLabel = 'нужно от вас';

export const needsItems: string[] = [
  'Домен — ваш или подберём и оформим',
  'Реквизиты ИП, ООО или самозанятого для подключения приёма оплаты',
  'Логотип, фирменные цвета и тексты — для тарифа 9 900 ₽',
];

export const footerText = 'Дальше — поддержка и развитие магазина от';
export const footerBadge = 'todo: retainer_monthly';
