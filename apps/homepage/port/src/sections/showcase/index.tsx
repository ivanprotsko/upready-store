import styles from "./styles.module.css";
import { CARDS, EYEBROW, HEADING, SUB, shotUrl } from "./data";

/**
 * «Примеры»: пять живых витрин, каждая открывается в новой вкладке.
 * Адреса проверены 2026-09-13 (концепция §6, строка «Пять витрин — живые»).
 *
 * `category` — не перечисление, а готовая подпись на языке читателя
 * («Электроника», «Одежда»), скопированная из прототипа: словарь подписей ей
 * не нужен.
 *
 * Снимок подставляется через `background-image`: это единственное место
 * страницы, где значение стиля приходит из данных, поэтому оно и остаётся
 * инлайном, а всё оформление карточки живёт в модуле.
 */
export default function Showcase() {
  return (
    <section
      id="sec-showcase"
      data-section="showcase"
      data-testid="sec-showcase"
      className={styles.section}
    >
      <div className="head">
        <span className="eyebrow">{EYEBROW}</span>
        <h2>{HEADING}</h2>
        <p className="sub">{SUB}</p>
      </div>

      <div className={styles.cards}>
        {CARDS.map((card) => (
          <a
            key={card.slug}
            className={styles.card}
            href={card.url}
            target="_blank"
            rel="noopener"
            data-testid={`showcase-card-${card.slug}`}
          >
            <div
              className={styles.shot}
              style={{ backgroundImage: `url(${shotUrl(card.slug)})` }}
            />
            <div className={styles.body}>
              <span className="eyebrow">{card.category}</span>
              <b>{card.title}</b>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
