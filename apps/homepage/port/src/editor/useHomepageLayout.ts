import { useCallback, useEffect, useRef, useState } from "react";

import {
  CONFIG_API,
  CONFIG_URL,
  CONFIG_VERSION,
  type BlockConfig,
  moveBlock,
  reconcile,
  toggleBlock,
} from "../config/layout";

export interface SaveState {
  status: "idle" | "saving" | "saved" | "error";
  /** ISO-время ответа сервера — печатаем его, а не своё предположение. */
  at?: string;
  error?: string;
}

export interface HomepageLayout {
  /** null = конфиг ещё не прочитан. Это не «пусто», это третье состояние. */
  blocks: BlockConfig[] | null;
  /** Расхождения конфига с реестром кода, если они были. */
  notes: string[];
  save: SaveState;
  toggle: (slug: string) => void;
  move: (slug: string, delta: -1 | 1) => void;
}

/**
 * Читает раскладку из `/homepage.cfg.json` и пишет её обратно через
 * dev-эндпоинт. Запись оптимистичная: состояние страницы меняется сразу,
 * ответ сервера только подтверждает (или показывает ошибку).
 */
export function useHomepageLayout(): HomepageLayout {
  const [blocks, setBlocks] = useState<BlockConfig[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  /* Правка пользователя старше пришедшего ответа — ответ её не перетирает. */
  const touched = useRef(false);
  const seq = useRef(0);
  const blocksRef = useRef<BlockConfig[] | null>(null);
  blocksRef.current = blocks;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let raw: unknown = null;
      try {
        const response = await fetch(CONFIG_URL, { cache: "no-store" });
        if (response.ok) raw = await response.json();
        else console.warn(`[homepage.cfg] ${CONFIG_URL} ответил ${response.status}`);
      } catch (error) {
        console.warn(`[homepage.cfg] ${CONFIG_URL} не прочитан:`, error);
      }
      if (cancelled || touched.current) return;
      const result = reconcile(raw);
      blocksRef.current = result.config.blocks;
      setBlocks(result.config.blocks);
      setNotes(result.notes);
      if (result.notes.length > 0) console.warn(`[homepage.cfg] ${result.notes.join("; ")}`);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: BlockConfig[]) => {
    if (!import.meta.env.DEV) {
      setSave({ status: "error", error: "запись раскладки работает только на dev-сервере" });
      return;
    }
    const ticket = (seq.current += 1);
    setSave({ status: "saving" });
    void (async () => {
      try {
        const response = await fetch(CONFIG_API, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: CONFIG_VERSION, blocks: next }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; updatedAt?: string; error?: string }
          | null;
        if (ticket !== seq.current) return; // обогнал более свежий запрос
        if (!response.ok || !payload?.ok) {
          setSave({
            status: "error",
            error: payload?.error ?? `сервер ответил ${response.status}`,
          });
          return;
        }
        setSave({ status: "saved", at: payload.updatedAt });
      } catch (error) {
        if (ticket !== seq.current) return;
        setSave({ status: "error", error: String(error) });
      }
    })();
  }, []);

  /*
   * Побочный эффект (PUT) не место внутри updater'а setState: в StrictMode
   * React зовёт updater дважды, и запрос ушёл бы на сервер два раза.
   * Поэтому следующее состояние считается снаружи, по свежему ref.
   */
  const apply = useCallback(
    (next: (current: BlockConfig[]) => BlockConfig[]) => {
      const current = blocksRef.current;
      if (!current) return;
      const updated = next(current);
      if (updated === current) return; // упёрлись в край списка — не пишем
      touched.current = true;
      blocksRef.current = updated;
      setBlocks(updated);
      persist(updated);
    },
    [persist],
  );

  const toggle = useCallback((slug: string) => apply((c) => toggleBlock(c, slug)), [apply]);
  const move = useCallback(
    (slug: string, delta: -1 | 1) => apply((c) => moveBlock(c, slug, delta)),
    [apply],
  );

  return { blocks, notes, save, toggle, move };
}
