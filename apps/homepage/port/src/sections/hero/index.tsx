import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { HERO_SCENARIO, funnelUrl } from "../../lib/funnel";
import IllLog from "./IllLog";
import IllOwner from "./IllOwner";
import IllStore from "./IllStore";
import styles from "./styles.module.css";
import {
  CAPTION_SWAP_MS,
  CTA_LABEL,
  HEADLINE_JOINS,
  HEADLINE_TAIL,
  HERO_WORDS,
  LEAD,
  MICRO,
  SECONDARY_LINK,
  WORD_MS,
} from "./data";

/**
 * Первый экран: заголовок, в котором три слова подсвечиваются по очереди, и
 * панель справа, синхронная со словом. Порт скрипта прототипа
 * (`artifacts/docs/2026-09-13-homepage-prototype.html`, строки 400-475).
 *
 * Правила механики (концепция §4):
 * - 4 с на слово, кросс-фейд 250 мс, подсвечено ровно одно слово;
 * - наведение и фокус закрепляют слово и останавливают цикл, уход — отпускает;
 * - клик закрепляет до следующего клика (тач без hover);
 * - `prefers-reduced-motion` — цикла нет, стоит первое слово, hover и клик
 *   работают;
 * - высота героя не меняется при смене слова: подпись держит min-height,
 *   сцена — aspect-ratio, все три иллюстрации лежат друг на друге.
 */
export default function Hero() {
  /* matchMedia отвечает синхронно, поэтому ответ берётся сразу в инициализаторе:
     третьего состояния «ещё не знаем» здесь не возникает. */
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [active, setActive] = useState(0);
  /* Закрепление наведением/фокусом и закрепление кликом — разные вещи:
     первое снимается уходом курсора, второе живёт до следующего клика. */
  const [hoverPin, setHoverPin] = useState<number | null>(null);
  const [clickPin, setClickPin] = useState<number | null>(null);
  const [caption, setCaption] = useState(HERO_WORDS[0].caption);
  const [captionVisible, setCaptionVisible] = useState(true);
  /* Какая подпись уже показана: без этого StrictMode прогонял бы кросс-фейд
     на повторном вызове эффекта, ничего не меняя. */
  const shown = useRef(0);

  const pinned = hoverPin !== null || clickPin !== null;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced || pinned) return;
    const id = window.setInterval(
      () => setActive((current) => (current + 1) % HERO_WORDS.length),
      WORD_MS,
    );
    return () => window.clearInterval(id);
  }, [reduced, pinned]);

  useEffect(() => {
    if (shown.current === active) return;
    setCaptionVisible(false);
    const id = window.setTimeout(() => {
      shown.current = active;
      setCaption(HERO_WORDS[active].caption);
      setCaptionVisible(true);
    }, CAPTION_SWAP_MS);
    return () => window.clearTimeout(id);
  }, [active]);

  const enter = useCallback(
    (index: number) => {
      if (clickPin !== null) return;
      setHoverPin(index);
      setActive(index);
    },
    [clickPin],
  );

  const leave = useCallback(() => {
    if (clickPin !== null) return;
    setHoverPin(null);
  }, [clickPin]);

  const click = useCallback(
    (index: number) => {
      if (clickPin === index) {
        setClickPin(null);
        setHoverPin(null);
        return;
      }
      setClickPin(index);
      setHoverPin(index);
      setActive(index);
    },
    [clickPin],
  );

  const ill = HERO_WORDS[active].ill;

  return (
    <section
      id="hero"
      data-section="hero"
      data-testid="sec-hero"
      className={`${styles.hero} ${pinned ? styles.isPinned : ""}`}
    >
      <div>
        <h1 className={styles.h1}>
          {HERO_WORDS.map((word, index) => (
            <Fragment key={word.text}>
              {index > 0 ? HEADLINE_JOINS[index - 1] : null}
              <span
                className={`${styles.word} ${index === active ? styles.wordOn : ""}`}
                data-hero-word=""
                data-k={index}
                data-on={index === active}
                tabIndex={0}
                onMouseEnter={() => enter(index)}
                onMouseLeave={leave}
                onFocus={() => enter(index)}
                onBlur={leave}
                onClick={() => click(index)}
              >
                {word.text}
              </span>
            </Fragment>
          ))}
          {HEADLINE_TAIL}
        </h1>

        <p className={styles.lead}>{LEAD}</p>

        <div className={styles.ctaRow}>
          <a
            className="btn"
            href={funnelUrl(HERO_SCENARIO)}
            title={HERO_SCENARIO.title}
            data-testid="hero-cta"
          >
            {CTA_LABEL}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </a>
          <a className="textlink" href={SECONDARY_LINK.href}>
            {SECONDARY_LINK.label}
          </a>
        </div>

        <p className={styles.micro}>{MICRO}</p>
      </div>

      <div className={styles.panel} data-testid="hero-panel">
        <div
          className={`${styles.cap} ${captionVisible ? "" : styles.capHidden}`}
          data-testid="hero-caption"
          aria-live="polite"
        >
          {caption}
        </div>
        <div className={styles.stage} data-testid="hero-stage" data-ill-index={ill}>
          <div className={`${styles.ill} ${ill === 0 ? styles.illOn : ""}`} data-ill="0">
            <IllStore reduced={reduced} />
          </div>
          <div className={`${styles.ill} ${ill === 1 ? styles.illOn : ""}`} data-ill="1">
            <IllLog />
          </div>
          <div className={`${styles.ill} ${ill === 2 ? styles.illOn : ""}`} data-ill="2">
            <IllOwner />
          </div>
        </div>
      </div>
    </section>
  );
}
