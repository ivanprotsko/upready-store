import { useRef, type ReactElement } from 'react';
import styles from './styles.module.css';
import {
  EYEBROW_NUMBER,
  EYEBROW_LABEL,
  HEADING,
  FOOTER_NOTE,
  ITEMS,
  DOMAIN_CARD,
  CATALOG_CARD,
  CART_CARD,
  PAY_CARD,
  SHIP_CARD,
  ACCOUNT_CARD,
  ADMIN_CARD,
  SEO_CARD,
  type IncludedItem,
} from './data';

// Re-implementation of dc-script.js `scrollRail` / `setIncRail` / `prevInc` / `nextInc`
// (reference/dc-script.js lines ~33-42, 419-420): scroll the rail by the width of its first
// child (+1px), smoothly, in either direction. The legacy code falls back to a fixed 340px
// step when the rail has no children yet; kept here for parity.
function useRailNav() {
  const railRef = useRef<HTMLDivElement | null>(null);

  const scrollByStep = (direction: 1 | -1) => {
    const node = railRef.current;
    if (!node) return;
    const first = node.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 1 : 340;
    node.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  return { railRef, prev: () => scrollByStep(-1), next: () => scrollByStep(1) };
}

function DomainIllustration() {
  const d = DOMAIN_CARD;
  return (
    <div className={styles.illWrap}>
      <div className={styles.domainBar}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto' }}>
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span className={styles.domainUrl}>{d.url}</span>
        <span className={styles.domainDot} />
      </div>
      <div className={styles.domainWindow}>
        <div className={styles.domainWindowHead}>
          <span className={styles.domainBrand}>{d.brand}</span>
          {d.nav.map((label) => (
            <span key={label} className={styles.domainNavItem}>{label}</span>
          ))}
          <span className={styles.domainCartWrap}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3F3F46" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="20" r="1.4" />
              <circle cx="18" cy="20" r="1.4" />
              <path d="M2 3h3l2.4 11.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 7H6" />
            </svg>
            <span className={styles.domainCartCount}>{d.cartCount}</span>
          </span>
        </div>
        <div className={styles.domainProductRow}>
          <img src="/images/products/candle.png" alt="" loading="lazy" className={styles.domainThumb} />
          <div className={styles.domainInfo}>
            <span className={styles.domainName}>{d.productName}</span>
            <span className={styles.domainMeta}>{d.productMeta}</span>
            <span className={styles.domainPrice}>{d.price}</span>
          </div>
        </div>
        <div className={styles.domainCtaWrap}>
          <div className={styles.domainCta}>{d.cta}</div>
        </div>
      </div>
      <div className={styles.domainBadgesRow}>
        {d.badges.map((b) => (
          <span key={b} className={styles.domainBadge}>{b}</span>
        ))}
      </div>
    </div>
  );
}

function CatalogIllustration() {
  const c = CATALOG_CARD;
  const toneClass = { strong: styles.catalogItemStrong, muted: styles.catalogItemMuted, faint: styles.catalogItemFaint };
  return (
    <div className={styles.catalogWrap}>
      <div className={styles.catalogNav}>
        <span className={styles.catalogNavLabel}>{c.eyebrow}</span>
        <div className={styles.catalogList}>
          {c.categories.map((cat) => (
            <span
              key={cat.label}
              className={[styles.catalogItem, toneClass[cat.tone], cat.indent ? styles.catalogItemIndent : ''].join(' ')}
            >
              {cat.label}
            </span>
          ))}
        </div>
      </div>
      <div className={styles.catalogMain}>
        <div className={styles.catalogGrid}>
          {c.products.map((p) => (
            <div key={p.name} className={styles.catalogProduct}>
              <img src={p.img} alt="" loading="lazy" className={styles.catalogProductImg} />
              <span className={styles.catalogProductName}>{p.name}</span>
              <span className={styles.catalogProductPrice}>{p.price}</span>
            </div>
          ))}
        </div>
        <div className={styles.catalogDetail}>
          <div className={styles.catalogDetailRow}>
            <img src={c.detail.img} alt="" loading="lazy" className={styles.catalogDetailThumb} />
            <div className={styles.catalogDetailInfo}>
              <span className={styles.catalogDetailName}>{c.detail.name}</span>
              <span className={styles.catalogDetailMeta}>{c.detail.meta}</span>
            </div>
          </div>
          <div className={styles.catalogOptionRow}>
            <span className={styles.catalogOptionLabel}>размер</span>
            <div className={styles.catalogSizes}>
              {c.detail.sizes.map((s) => (
                <span
                  key={s.label}
                  className={[styles.catalogSize, s.selected ? styles.catalogSizeSelected : ''].join(' ')}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </div>
          <div className={styles.catalogOptionRow}>
            <span className={styles.catalogOptionLabel}>цвет</span>
            <div className={styles.catalogColors}>
              {c.detail.colors.map((col, i) => (
                <span
                  key={i}
                  className={[styles.catalogColor, col.selected ? styles.catalogColorSelected : ''].join(' ')}
                  style={{ background: col.color }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CartIllustration() {
  const c = CART_CARD;
  return (
    <div className={styles.cartWrap}>
      <div className={styles.cartProgressRow}>
        <span className={styles.cartProgressLabel}>{c.stepLabel}</span>
        <span className={styles.cartProgressTrack}>
          <span className={styles.cartProgressFill} style={{ right: c.progressRight }} />
        </span>
      </div>
      <div className={styles.cartLines}>
        {c.lines.map((line) => (
          <div key={line.name} className={styles.cartLine}>
            <img src={line.img} alt="" loading="lazy" className={styles.cartThumb} />
            <span className={styles.cartInfo}>
              <span className={styles.cartName}>{line.name}</span>
              <span className={styles.cartMeta}>{line.meta}</span>
            </span>
            <span className={styles.cartQty}>{line.qty}</span>
            <span className={styles.cartPrice}>{line.price}</span>
          </div>
        ))}
      </div>
      <div className={styles.cartSummary}>
        {c.summary.map((row) => (
          <div key={row.label} className={styles.cartSummaryRow}>
            <span className={styles.cartSummaryLabel}>{row.label}</span>
            <span className={styles.cartSummaryValue}>{row.value}</span>
          </div>
        ))}
        <div className={styles.cartDivider} />
        <div className={styles.cartSummaryRow}>
          <span className={styles.cartTotalLabel}>{c.total.label}</span>
          <span className={styles.cartTotalValue}>{c.total.value}</span>
        </div>
        <div className={styles.cartCta}>{c.cta}</div>
      </div>
    </div>
  );
}

function PayIllustration() {
  const p = PAY_CARD;
  return (
    <div className={styles.payWrap}>
      <div className={styles.payMethods}>
        {p.methods.map((m) => (
          <div key={m.label} className={styles.payMethod}>
            <span className={[styles.payRadio, m.selected ? styles.payRadioSelected : styles.payRadioDefault].join(' ')} />
            <span className={[styles.payLabel, m.selected ? styles.payLabelSelected : styles.payLabelDefault].join(' ')}>
              {m.label}
            </span>
            {/* mono meta chip copied verbatim from the legacy mock illustration */}
            <span className={styles.payMeta} style={{ color: m.metaColor }}>{m.meta}</span>
          </div>
        ))}
        <div className={styles.payMore}>
          <span className={styles.payMoreLabel}>{p.more}</span>
        </div>
      </div>
      <div className={styles.payReceipt}>
        <div className={styles.payReceiptHead}>
          <span className={styles.payReceiptLabel}>{p.receipt.label}</span>
          <span className={styles.payReceiptCheck}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span className={styles.payReceiptCheckLabel}>{p.receipt.check}</span>
          </span>
        </div>
        <div className={styles.payReceiptBody}>
          <div className={styles.payReceiptCol}>
            {p.receipt.rows.map((row) => (
              <div key={row.key} className={styles.payReceiptRow}>
                <span className={styles.payReceiptKey}>{row.key}</span>
                <span
                  className={[styles.payReceiptVal, row.key === 'итого' ? styles.payReceiptValStrong : ''].join(' ')}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
          <div className={styles.payQr} />
        </div>
      </div>
    </div>
  );
}

function ShipIllustration() {
  const s = SHIP_CARD;
  return (
    <div className={styles.shipWrap}>
      <div className={styles.shipHeadRow}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto' }}>
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <span className={styles.shipHeadLabel}>{s.header}</span>
      </div>
      <div className={styles.shipMethods}>
        {s.methods.map((m, i) => (
          <div
            key={m.label}
            className={[styles.shipMethod, i === s.methods.length - 1 ? styles.shipMethodLast : ''].join(' ')}
          >
            <span className={[styles.shipRadio, m.selected ? styles.shipRadioSelected : styles.shipRadioDefault].join(' ')} />
            <span className={[styles.shipLabel, m.strong ? styles.shipLabelStrong : styles.shipLabelMuted].join(' ')}>
              {m.label}
            </span>
            <span className={[styles.shipPrice, m.strong ? styles.shipPriceStrong : styles.shipPriceMuted].join(' ')}>
              {m.price}
            </span>
          </div>
        ))}
      </div>
      <div className={styles.shipLabelBox}>
        <div className={styles.shipLabelHead}>
          <span className={styles.shipLabelTag}>{s.label.tag}</span>
          <span className={styles.shipLabelTrack}>{s.label.track}</span>
        </div>
        <div className={styles.shipBarcode} />
        <div className={styles.shipAddress}>
          <span className={styles.shipAddressLine}>{s.address.line1}</span>
          <span className={styles.shipAddressName}>{s.address.line2}</span>
          <span className={styles.shipAddressPhone}>{s.address.phone}</span>
        </div>
      </div>
    </div>
  );
}

// Order status text below is verbatim mock copy from the legacy illustration
// (reference/dc-script.js does not enumerate a status type — the two strings are
// hard-coded Russian labels in the raw template's f.isAccount branch), not an
// internal enum, so no separate label dictionary applies.
function AccountIllustration() {
  const a = ACCOUNT_CARD;
  return (
    <div className={styles.accountWrap}>
      <span className={styles.accountEyebrow}>{a.eyebrow}</span>
      <div className={styles.accountOrders}>
        {a.orders.map((o, i) => (
          <div
            key={o.id}
            className={[styles.accountOrderRow, i === a.orders.length - 1 ? styles.accountOrderRowLast : ''].join(' ')}
          >
            <span className={styles.accountOrderId}>{o.id}</span>
            <span className={styles.accountSpacer} />
            <span className={styles.accountOrderPrice}>{o.price}</span>
            <span className={styles.accountStatus}>{o.status}</span>
          </div>
        ))}
      </div>
      <div className={styles.accountDetail}>
        <div className={styles.accountDetailHead}>
          <span className={styles.accountDetailId}>{a.detail.id}</span>
          <span className={styles.accountDetailDate}>{a.detail.date}</span>
        </div>
        <div className={styles.accountStepper}>
          <span className={styles.accountStepperTrack} />
          <span className={styles.accountStepperFill} style={{ width: a.detail.progressWidth }} />
          {a.detail.steps.map((step) => (
            <span key={step.label} className={styles.accountStep}>
              <span
                className={[styles.accountStepDot, step.done ? styles.accountStepDotDone : styles.accountStepDotPending].join(' ')}
              />
              <span
                className={[styles.accountStepLabel, step.done ? styles.accountStepLabelDone : styles.accountStepLabelPending].join(' ')}
              >
                {step.label}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminIllustration() {
  const a = ADMIN_CARD;
  return (
    <div className={styles.adminWrap}>
      <div className={styles.adminNav}>
        {a.nav.map((n) => (
          <span
            key={n.label}
            className={[styles.adminNavItem, n.active ? styles.adminNavItemActive : styles.adminNavItemDefault].join(' ')}
          >
            {n.label}
          </span>
        ))}
      </div>
      <div className={styles.adminMain}>
        <div className={styles.adminTable}>
          <div className={styles.adminTableHead}>
            <span className={[styles.adminTableHeadCell, styles.adminTableHeadCellGrow].join(' ')}>{a.tableHeader.product}</span>
            <span className={[styles.adminTableHeadCell, styles.adminTableHeadCellEnd].join(' ')}>{a.tableHeader.stock}</span>
          </div>
          {a.rows.map((row, i) => (
            <div key={row.name} className={[styles.adminRow, i === a.rows.length - 1 ? styles.adminRowLast : ''].join(' ')}>
              <img src={row.img} alt="" loading="lazy" className={styles.adminThumb} />
              <span className={styles.adminName}>{row.name}</span>
              <span className={[styles.adminQty, row.low ? styles.adminQtyLow : styles.adminQtyDefault].join(' ')}>
                {row.qty}
              </span>
            </div>
          ))}
        </div>
        <div className={styles.adminPromo}>
          <span className={styles.adminPromoCode}>{a.promo.code}</span>
          <span className={styles.adminPromoMeta}>{a.promo.meta}</span>
          <span className={styles.adminPromoBadge}>{a.promo.badge}</span>
        </div>
      </div>
    </div>
  );
}

function SeoIllustration() {
  const s = SEO_CARD;
  return (
    <div className={styles.seoWrap}>
      <div className={styles.seoSnippet}>
        <span className={styles.seoSnippetUrl}>{s.snippet.url}</span>
        <span className={styles.seoSnippetTitle}>{s.snippet.title}</span>
        <p className={styles.seoSnippetDesc}>{s.snippet.desc}</p>
      </div>
      <div className={styles.seoRow}>
        <div className={styles.seoSitemap}>
          <span className={styles.seoSitemapLabel}>{s.sitemap.label}</span>
          {s.sitemap.lines.map((line, i) => (
            <span
              key={i}
              className={[styles.seoSitemapLine, line.tone === 'link' ? styles.seoSitemapLineLink : styles.seoSitemapLineMuted].join(' ')}
            >
              {line.text}
            </span>
          ))}
        </div>
        <div className={styles.seoStats}>
          <span className={styles.seoStatsLabel}>{s.stats.label}</span>
          <svg viewBox="0 0 100 34" preserveAspectRatio="none" className={styles.seoSparkline}>
            <path
              d="M0 30 L14 26 L28 28 L42 18 L56 21 L70 12 L84 9 L100 3"
              fill="none"
              stroke="#2563EB"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className={styles.seoStatsValue}>{s.stats.value}</span>
        </div>
      </div>
      <div className={styles.seoBottomRow}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto' }}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span className={styles.seoBottomLabel}>{s.bottomNote}</span>
      </div>
    </div>
  );
}

const ILLUSTRATIONS: Record<IncludedItem['kind'], () => ReactElement> = {
  domain: DomainIllustration,
  catalog: CatalogIllustration,
  cart: CartIllustration,
  pay: PayIllustration,
  ship: ShipIllustration,
  account: AccountIllustration,
  admin: AdminIllustration,
  seo: SeoIllustration,
};

/**
 * `num` — page-wide ordinal handed down by App.tsx (dc-script.js's
 * `order`/`num` counter, lines 319-322). Omitted in the isolated
 * `?section=` preview, where the literal frozen in data.ts applies.
 */
export default function Included({ num }: { num?: string }) {
  const { railRef, prev, next } = useRailNav();

  return (
    <section data-section="included" data-testid="sec-included" id="sec-included" className={styles.section}>
      <i className={[styles.corner, styles.cornerLeft].join(' ')} />
      <i className={[styles.corner, styles.cornerRight].join(' ')} />

      <div className={styles.head}>
        <div className={styles.eyebrowRow}>
          <span className={styles.eyebrowDot} />
          <span className={styles.eyebrowText}>{num ?? EYEBROW_NUMBER} · {EYEBROW_LABEL}</span>
        </div>
        <div className={styles.titleRow}>
          <h2 className={styles.heading}>{HEADING}</h2>
          <div className={styles.navButtons}>
            <button type="button" title="Назад" className={styles.navBtn} onClick={prev}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={styles.navIconBack}>
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </button>
            <button type="button" title="Вперёд" className={styles.navBtn} onClick={next}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div id="rail-included" ref={railRef} className={styles.rail}>
        {ITEMS.map((item) => {
          const Illustration = ILLUSTRATIONS[item.kind];
          return (
            <div key={item.n} className={styles.card}>
              <div className={styles.cardMedia}>
                <div className={styles.cardMediaInner}>
                  <Illustration />
                </div>
              </div>
              <div className={styles.cardBody}>
                <span className={styles.cardIndex}>{item.n}</span>
                <p className={styles.cardText}>{item.t}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <p className={styles.footerText}>{FOOTER_NOTE}</p>
      </div>
    </section>
  );
}
