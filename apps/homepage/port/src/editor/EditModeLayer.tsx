import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type Audience, type BlockConfig, hiddenReason, isRendered, sectionLabel } from "../config/layout";
import styles from "./editor.module.css";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, EyeIcon, EyeOffIcon } from "./icons";
import type { SaveState } from "./useHomepageLayout";

/** Высота липкой шапки страницы (App.module.css .headerBar). */
const HEADER_HEIGHT = 60;
const GAP = 10;

interface Props {
  blocks: BlockConfig[];
  audience: Audience;
  save: SaveState;
  onToggle: (slug: string) => void;
  onMove: (slug: string, delta: -1 | 1) => void;
  onExit: () => void;
}

function statusText(save: SaveState): { text: string; dot: string } {
  switch (save.status) {
    case "saving":
      return { text: "сохраняю…", dot: styles.dotSaving };
    case "saved": {
      const at = save.at ? new Date(save.at) : null;
      const time = at
        ? at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
        : "";
      return { text: time ? `сохранено ${time}` : "сохранено", dot: styles.dotSaved };
    }
    case "error":
      return { text: `не сохранено: ${save.error ?? "неизвестная ошибка"}`, dot: styles.dotError };
    default:
      return { text: "public/homepage.cfg.json", dot: "" };
  }
}

/**
 * Слой режима редактирования: рамка вокруг блока под курсором, поповер с
 * контролами этого блока и нижняя панель состояния.
 *
 * Рендерится порталом в <body> и позиционируется только fixed-координатами
 * из getBoundingClientRect(), поэтому оформление предков (sticky-шапка с
 * backdrop-filter, контейнер страницы с рамками) на него не влияет.
 */
export default function EditModeLayer({ blocks, audience, save, onToggle, onMove, onExit }: Props) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const frame = useRef<number | null>(null);
  /* Блок, за которым надо доскроллить после перестановки. */
  const followRef = useRef<string | null>(null);
  /* Последняя позиция курсора — чтобы отличить движение руки от события,
     которое браузер прислал из-за перекомпоновки страницы. */
  const pointer = useRef<{ x: number; y: number } | null>(null);

  const measure = useCallback((slug: string | null) => {
    if (!slug) {
      setRect(null);
      return;
    }
    const element = document.querySelector<HTMLElement>(`[data-section="${slug}"]`);
    setRect(element ? element.getBoundingClientRect() : null);
  }, []);

  /* Выбор блока по наведению.
   *
   * Слушаем ДВИЖЕНИЕ мыши, а не mouseover: после перестановки на место
   * блока встаёт сосед, и браузер шлёт mouseover под неподвижным курсором —
   * выбор перескакивал бы на соседа, и второй клик «вниз» двигал бы уже не
   * тот блок (замер 2026-09-13: два клика подряд переставили faq вместо
   * tariffs). mousemove приходит только на реальное движение руки, и на
   * всякий случай сверяем координаты с предыдущим событием.
   *
   * Курсор на самой панели или на шапке/подвале (их slug'ов нет в
   * раскладке) выбор не меняет — иначе панель убегала бы из-под руки по
   * дороге к кнопке. */
  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const last = pointer.current;
      if (last && last.x === event.clientX && last.y === event.clientY) return;
      pointer.current = { x: event.clientX, y: event.clientY };
      const target = event.target as HTMLElement | null;
      const element = target?.closest?.("[data-section]") as HTMLElement | null;
      const slug = element?.dataset.section;
      if (!slug || !blocks.some((b) => b.slug === slug)) return;
      setActiveSlug(slug);
      setRect(element!.getBoundingClientRect());
    };
    document.addEventListener("mousemove", onMouseMove, true);
    return () => document.removeEventListener("mousemove", onMouseMove, true);
  }, [blocks]);

  /* Скролл и ресайз двигают блок под панелью — координаты пересчитываются
   * раз в кадр, а не на каждое событие. */
  useEffect(() => {
    const update = () => {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null;
        measure(activeSlug);
      });
    };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [activeSlug, measure]);

  /* После перестановки блок уезжает — панель идёт за ним, и если он вышел
   * за экран, экран доводится до него. */
  useLayoutEffect(() => {
    measure(activeSlug);
    const slug = followRef.current;
    followRef.current = null;
    if (!slug) return;
    const element = document.querySelector<HTMLElement>(`[data-section="${slug}"]`);
    if (!element) return;
    const box = element.getBoundingClientRect();
    const offscreen = box.top < HEADER_HEIGHT || box.top > window.innerHeight - 80;
    if (offscreen) element.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [blocks, activeSlug, measure]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExit();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onExit]);

  const index = activeSlug ? blocks.findIndex((b) => b.slug === activeSlug) : -1;
  const block = index === -1 ? null : blocks[index];
  const reason = block ? hiddenReason(block, audience) : null;
  const shownCount = blocks.filter((b) => isRendered(b, audience)).length;
  const status = statusText(save);

  const move = (delta: -1 | 1) => {
    if (!block) return;
    followRef.current = block.slug;
    onMove(block.slug, delta);
  };

  return createPortal(
    <div className={`${styles.root} ${styles.layer}`}>
      {rect && (
        <div
          className={styles.outline}
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}

      {block && rect && (
        <div
          className={styles.panel}
          style={{
            top: Math.min(
              Math.max(rect.top + GAP, HEADER_HEIGHT + GAP),
              window.innerHeight - 56,
            ),
            right: Math.max(window.innerWidth - rect.right + GAP, GAP),
          }}
        >
          <div className={styles.meta}>
            <span className={styles.metaLabel}>{sectionLabel(block.slug)}</span>
            <span className={`${styles.metaSub} ${reason ? styles.metaSubOff : ""}`}>
              {block.slug} · позиция {index + 1} из {blocks.length}
              {reason ? ` · ${reason}` : ""}
            </span>
          </div>

          <span className={styles.divider} />

          <button
            type="button"
            className={`${styles.btn} ${block.visible ? "" : styles.btnOff}`}
            onClick={() => onToggle(block.slug)}
            title={block.visible ? "Скрыть блок" : "Показать блок"}
            aria-label={block.visible ? "Скрыть блок" : "Показать блок"}
          >
            {block.visible ? <EyeIcon /> : <EyeOffIcon />}
          </button>

          <span className={styles.divider} />

          <button
            type="button"
            className={styles.btn}
            onClick={() => move(-1)}
            disabled={index <= 0}
            title="Поднять блок выше"
            aria-label="Поднять блок выше"
          >
            <ChevronUpIcon />
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={() => move(1)}
            disabled={index >= blocks.length - 1}
            title="Опустить блок ниже"
            aria-label="Опустить блок ниже"
          >
            <ChevronDownIcon />
          </button>
        </div>
      )}

      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Режим редактирования</span>
        <span className={styles.count}>
          на странице {shownCount} из {blocks.length}
        </span>
        <span className={styles.status}>
          <span className={`${styles.dot} ${status.dot}`} />
          <span className={save.status === "error" ? styles.statusError : undefined}>
            {status.text}
          </span>
        </span>
        <span className={styles.hint}>Esc</span>
        <button type="button" className={styles.done} onClick={onExit}>
          <CheckIcon />
          Готово
        </button>
      </div>
    </div>,
    document.body,
  );
}
