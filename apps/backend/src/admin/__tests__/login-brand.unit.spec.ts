import { readFileSync, readdirSync } from "fs";
import path from "path";

import resources, { BRAND, DASHBOARD_LANGUAGES } from "../i18n";
import { holdDocumentTitle } from "../lib/hold-document-title";

/**
 * The platform admin's sign-in page, `/app/login` on store.upready.dev and
 * shipshift.dev, greeted a guest with «Welcome to Medusa» in the tab, the
 * heading and the hint (audit of 13.10.2026, defect D2; t-2026-10-12-32 FX3).
 *
 * @medusajs/dashboard reads the heading and the hint from `login.title` and
 * `login.hint` and deep-merges the resources of `src/admin/i18n` over its own,
 * so the merge below is the one the dashboard does. Its sources ship in the
 * package (`files: ["src", "dist"]`), which lets this test read the languages
 * the installed version really has instead of a copy of the list.
 */

type Login = { title?: string; hint?: string };
type Resources = Record<string, { translation: { login?: Login } }>;

const translations = path.join(
  path.dirname(require.resolve("@medusajs/dashboard/package.json")),
  "src/i18n/translations",
);
const shipped = readdirSync(translations)
  .filter((file) => file.endsWith(".json") && !file.startsWith("$"))
  .map((file) => file.slice(0, -".json".length))
  .sort();
const shippedLogin = (code: string): Login =>
  JSON.parse(readFileSync(path.join(translations, `${code}.json`), "utf8")).login ?? {};
const ours = resources as Resources;
const merged = (code: string): Login => ({ ...shippedLogin(code), ...ours[code]?.translation.login });

describe("the admin sign-in page says Upready Store, not Medusa", () => {
  it("lists every language the installed dashboard ships", () => {
    expect(shipped.length).toBeGreaterThan(0);
    expect([...DASHBOARD_LANGUAGES].sort()).toEqual(shipped);
  });

  it("gives the heading, and so the tab, the brand in every language", () => {
    for (const code of shipped) {
      expect([code, merged(code).title]).toEqual([code, BRAND]);
    }
  });

  it("leaves Medusa out of the hint in every language", () => {
    for (const code of shipped) {
      expect([code, merged(code).hint]).toEqual([code, expect.not.stringMatching(/medusa/i)]);
    }
  });

  it("says where the sign-in leads in English and Russian", () => {
    expect(merged("en")).toEqual({ ...shippedLogin("en"), title: BRAND, hint: "Sign in to the platform admin" });
    expect(merged("ru")).toEqual({ ...shippedLogin("ru"), title: BRAND, hint: "Войдите в админку платформы" });
  });
});

describe("holdDocumentTitle", () => {
  // The dashboard writes `document.title` itself («<login.title> - Medusa»)
  // through react-helmet-async, a frame after the page renders.
  const stand = (title: string) => {
    let onChange = () => {};
    let watching = false;
    const doc = { title, head: {} as HTMLHeadElement };
    class Observer {
      constructor(callback: () => void) {
        onChange = callback;
      }
      observe() {
        watching = true;
      }
      disconnect() {
        watching = false;
      }
    }
    const dashboardWrites = (next: string) => {
      doc.title = next;
      if (watching) onChange();
    };
    return { doc, Observer: Observer as unknown as typeof MutationObserver, dashboardWrites, watching: () => watching };
  };

  it("sets the title at once and puts it back after the dashboard writes its own", () => {
    const { doc, Observer, dashboardWrites } = stand("");
    holdDocumentTitle(BRAND, doc, Observer);
    expect(doc.title).toBe(BRAND);
    dashboardWrites(`${BRAND} - Medusa`);
    expect(doc.title).toBe(BRAND);
  });

  it("lets go when the sign-in page closes", () => {
    const { doc, Observer, dashboardWrites, watching } = stand("");
    const release = holdDocumentTitle(BRAND, doc, Observer);
    release();
    expect(watching()).toBe(false);
    dashboardWrites("Orders - Medusa");
    expect(doc.title).toBe("Orders - Medusa");
  });
});
