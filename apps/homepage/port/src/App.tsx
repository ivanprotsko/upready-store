import { Fragment, useCallback, useEffect, useState } from "react";

import PageShell from "./PageShell";
import {
  type Audience,
  isRendered,
  layoutSections,
  numbering,
} from "./config/layout";
import EditLauncher from "./editor/EditLauncher";
import EditModeLayer from "./editor/EditModeLayer";
import editorStyles from "./editor/editor.module.css";
import { useHomepageLayout } from "./editor/useHomepageLayout";
import { Footer, Nav } from "./sections/shell/index";

/**
 * App.tsx — сборка страницы.
 *
 * Что именно собирать, в каком порядке и что из этого включено, говорит
 * файл `public/homepage.cfg.json` (см. src/config/layout.ts). Раньше эти два
 * решения были зашиты здесь: порядок — массивом реестра, включённость —
 * константой DEFAULT_BLOCKS. Теперь реестр остаётся каноном того, какие
 * блоки существуют, а раскладку держит конфиг, и режим редактирования
 * (src/editor/) пишет в него прямо со страницы.
 *
 * Аудитория осталась здесь: она не раскладка, а ветвление контента
 * (reference/dc-script.js `resolveAudience()` + `renderVals()`).
 */

export type { Audience };

export const DEFAULT_AUDIENCE: Audience = "cold";
/** `showTodoMarkers` — reference/props.json default. */
export const SHOW_TODO_MARKERS = true;

/** Режим редактирования живёт только на dev-сервере: только он умеет писать конфиг. */
const EDIT_ENABLED = import.meta.env.DEV;
const EDIT_PARAM = "edit";

const AUDIENCE_IDS: Audience[] = ["cold", "warm", "price"];

/** Порт `resolveAudience()` + `persist()` (dc-script.js строки 89-108). */
export function resolveAudience(def: Audience = DEFAULT_AUDIENCE): Audience {
  let v: string | null = null;
  try {
    const q = new URLSearchParams(window.location.search);
    v = q.get("v") || q.get("utm_content");
    if (!v) {
      const raw = window.sessionStorage.getItem("upready_v");
      if (raw) {
        const s = JSON.parse(raw) as { v?: string; t?: number };
        if (s && typeof s.t === "number" && Date.now() - s.t < 30 * 60 * 1000) {
          v = s.v ?? null;
        }
      }
    }
  } catch {
    v = null;
  }
  const a = AUDIENCE_IDS.includes(v as Audience) ? (v as Audience) : def;
  try {
    window.sessionStorage.setItem("upready_v", JSON.stringify({ v: a, t: Date.now() }));
  } catch {
    /* private mode / storage disabled — the legacy page swallows this too */
  }
  return a;
}

function editParamIsOn(): boolean {
  try {
    return new URLSearchParams(window.location.search).get(EDIT_PARAM) === "1";
  } catch {
    return false;
  }
}

export default function App() {
  const [audience, setAudience] = useState<Audience>(DEFAULT_AUDIENCE);
  const [editing, setEditing] = useState(() => EDIT_ENABLED && editParamIsOn());
  const { blocks, save, toggle, move } = useHomepageLayout();

  useEffect(() => {
    setAudience(resolveAudience());
  }, []);

  /* Режим держится в адресе, чтобы перезагрузка его не теряла. */
  const setEditMode = useCallback((on: boolean) => {
    setEditing(on);
    try {
      const url = new URL(window.location.href);
      if (on) url.searchParams.set(EDIT_PARAM, "1");
      else url.searchParams.delete(EDIT_PARAM);
      window.history.replaceState(null, "", url);
    } catch {
      /* адрес не обновился — на сам режим это не влияет */
    }
  }, []);

  const visibleOf = (slug: string): boolean =>
    blocks ? blocks.some((b) => b.slug === slug && isRendered(b, audience)) : false;

  const num = blocks ? numbering(blocks, audience) : {};

  return (
    <>
      <PageShell
        nav={
          <Nav
            showIncluded={visibleOf("included")}
            showPricing={visibleOf("pricing")}
            showFaq={visibleOf("faq")}
          />
        }
      >
        {/* blocks === null — конфиг ещё читается (обычно один кадр). Это не
            «пустая страница», а «раскладка пока неизвестна»: рисовать порядок
            по умолчанию, чтобы через миг его перетасовать, было бы хуже. */}
        {blocks?.map((block) => {
          const entry = layoutSections.find((s) => s.slug === block.slug);
          if (!entry) return null;
          const { Component } = entry;
          const rendered = isRendered(block, audience);
          if (!rendered && !editing) return null;
          /* В режиме редактирования выключенный блок остаётся на экране —
             иначе его нельзя вернуть. Номер ему не выдаётся: сквозную
             нумерацию делят только те, кто на странице. */
          return rendered ? (
            <Fragment key={block.slug}>
              <Component num={num[block.slug]} />
            </Fragment>
          ) : (
            <div key={block.slug} className={editorStyles.ghost}>
              <Component num="—" />
            </div>
          );
        })}
        <Footer />
      </PageShell>

      {EDIT_ENABLED && blocks && !editing && <EditLauncher onEnter={() => setEditMode(true)} />}
      {EDIT_ENABLED && blocks && editing && (
        <EditModeLayer
          blocks={blocks}
          audience={audience}
          save={save}
          onToggle={toggle}
          onMove={move}
          onExit={() => setEditMode(false)}
        />
      )}
    </>
  );
}
