// Verbatim text from reference/rendered/04-proof-full.html.

export const sectionLabel = 'Почему это про вас';

// `{{ nProof }}` (rendered as "03") is NOT this section's own counter: dc-script.js computes it
// at lines 319-322 as the position of the 'proof' block among all currently-ON top-level page
// blocks (`order.forEach(([k,on]) => { if (on) { ni++; num[k]=... } })`) — page-wide numbering
// bookkeeping, not data this section owns (§3 item 1 keeps this section isolated). Ported as the
// static string it renders to by default, verbatim from reference/rendered/04-proof-full.html.
// See "Needs from merger" in NOTES.md.
export const kickerNumber = '03';
export const kickerText = 'риск';

export const heading = 'Это уже не гипотеза';

export interface Paragraph {
  text: string;
  variant: 'lead' | 'body';
}

export const paragraphs: Paragraph[] = [
  {
    variant: 'lead',
    text: 'В июле–августе 2026 из строя вышли 16 из 26 крупнейших складов Wildberries. Потери продавцов оценивают в 215–280 млрд ₽.',
  },
  {
    variant: 'body',
    text: 'Компенсация оказалась добровольной: заявленный потолок — 10–15% от недополученной выручки, в задокументированных кейсах продавцы получали от 1,5% себестоимости товара. Взыскать её через суд нельзя: с 7 июля 2026 оферта относит такие события к обстоятельствам непреодолимой силы. Страховка тоже не закрывает вопрос — полисов, покрывающих утрату товара на складе маркетплейса, на рынке около 2%.',
  },
  {
    variant: 'body',
    text: 'В следующий раз причина будет другой: пожар, блокировка кабинета, спор с площадкой, технический сбой. Постоянна не причина, а конструкция — весь ваш бизнес стоит на инфраструктуре, которая вам не принадлежит.',
  },
];

export const sourceNote = 'Источник: разбор кейсов продавцов, vc.ru, июль 2026.';

export const docCard = {
  headerLabel: 'оферта №98 · ред. 07.07.2026',
  headerTag: 'форс-мажор',
  // heights/widths of the four filler "text" bars, in DOM order (the clause block sits between
  // the 2nd and 3rd bar — see index.tsx).
  lineWidths: ['96%', '88%', '92%', '61%'] as const,
  clauseNumber: '9.4',
  clauseText:
    'Повреждение или утрата товара на складе, в том числе в результате атаки беспилотных летательных аппаратов, относится к обстоятельствам непреодолимой силы.',
  footerText: 'макет фрагмента · перед публикацией подставить скан документа',
};

export const docCaption =
  'Пункт оферты, снимающий с площадки ответственность за ваш товар. Оферта №98, ред. от 07.07.2026.';

export const chart = {
  ariaLabel: 'Диаграмма: из 100% потерь продавцу возвращают от 2,2 до 15 процентов',
  topLabel: '100% — ВАШИ ПОТЕРИ',
  point1Value: '2,2%',
  point1Note: 'выплата в задокументированном кейсе: убыток 130 000 ₽ → 2 900 ₽',
  point2Value: '10–15%',
  point2Note: 'заявленный площадкой потолок компенсации',
  sourceLabel: 'источник: разбор кейсов продавцов, vc.ru, июль 2026',
};

export const chartCaption = 'Реальный кейс: убыток 130 000 ₽, компенсация 2 900 ₽ — 2,2%.';
