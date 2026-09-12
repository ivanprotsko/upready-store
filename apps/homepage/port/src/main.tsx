import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles/base.css";
import App from "./App";
import styles from "./App.module.css";
import PageShell from "./PageShell";
import { sections } from "./sections";
import { Footer, Nav } from "./sections/shell/index";

/**
 * ?section=<slug> renders exactly ONE registry entry in isolation (used by
 * scripts/shot.mjs and every section agent's own acceptance run). No query
 * param renders the full assembled <App/>.
 *
 * The single-section preview puts the section inside the same shared
 * `max-width:1280px` bordered container the assembled page uses
 * (`apps/homepage/index.html` line 79) — every section's NOTES.md asked the
 * merger for it, because without that ancestor a section renders 1440px wide
 * against a 1278px-wide reference shot. `?section=shell` additionally gets
 * the real sticky header + logo, which is what sizes <nav> to its
 * reference 1088px (shell/NOTES.md "Needs from merger" item 1).
 */
function Root() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("section");

  if (slug === "shell") {
    return (
      <PageShell nav={<Nav />}>
        <Footer />
      </PageShell>
    );
  }

  if (slug) {
    const entry = sections.find((s) => s.slug === slug);
    if (!entry) {
      return <p>Unknown section slug: {slug}</p>;
    }
    const { Component } = entry;
    return (
      <div className={styles.container}>
        <Component />
      </div>
    );
  }

  return <App />;
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root element not found");
}

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
