import type { MedusaContainer } from "@medusajs/framework";
import { readTranslationsByLocale, upsertTranslationFields } from "../translations-helpers";

/**
 * t-cherk-37. A fake standing in for `Modules.TRANSLATION`: enough of
 * `listTranslations`/`createTranslations`/`updateTranslations`/`listLocales`/
 * `createLocales` to prove the merge-by-locale behaviour `upsertTranslationFields`
 * promises, without a database.
 */
type Row = {
  id: string;
  reference: string;
  reference_id: string;
  locale_code: string;
  translations: Record<string, unknown>;
};

const fakeTranslationService = () => {
  const rows: Row[] = [];
  const locales = new Set<string>();
  let nextId = 1;

  const service = {
    listTranslations: async (filters: Record<string, unknown>) => {
      const referenceIds = filters.reference_id as string[] | undefined;
      const localeCode = filters.locale_code as string | undefined;
      const reference = filters.reference as string | undefined;
      return rows.filter(
        (row) =>
          (!referenceIds || referenceIds.includes(row.reference_id)) &&
          (!localeCode || row.locale_code === localeCode) &&
          (!reference || row.reference === reference),
      );
    },
    createTranslations: async (data: Omit<Row, "id">) => {
      const row = { ...data, id: `trans_${nextId++}` };
      rows.push(row);
      return row;
    },
    updateTranslations: async (data: { id: string; translations: Record<string, unknown> }) => {
      const row = rows.find((candidate) => candidate.id === data.id);
      if (row) row.translations = data.translations;
      return row;
    },
    listLocales: async (filters: Record<string, unknown>) => {
      const codes = filters.code as string[];
      return codes.filter((code) => locales.has(code)).map((code) => ({ code }));
    },
    createLocales: async (data: { code: string }[]) => {
      for (const { code } of data) locales.add(code);
      return data;
    },
  };

  return { service, rows };
};

const containerOf = (service: unknown): MedusaContainer =>
  ({ resolve: () => service }) as unknown as MedusaContainer;

describe("upsertTranslationFields", () => {
  it("creates a locale's row on the first save and the new locale with it", async () => {
    const { service, rows } = fakeTranslationService();
    const container = containerOf(service);

    await upsertTranslationFields(container, "product", "prod_1", "en", {
      title: "Blue Scarf",
    });

    expect(rows).toEqual([
      expect.objectContaining({
        reference: "product",
        reference_id: "prod_1",
        locale_code: "en",
        translations: { title: "Blue Scarf" },
      }),
    ]);
  });

  it("merges a second field into the same locale row instead of creating a second one", async () => {
    const { service, rows } = fakeTranslationService();
    const container = containerOf(service);

    await upsertTranslationFields(container, "product", "prod_1", "en", { title: "Blue Scarf" });
    await upsertTranslationFields(container, "product", "prod_1", "en", {
      subtitle: "100% wool",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].translations).toEqual({ title: "Blue Scarf", subtitle: "100% wool" });
  });

  it("is idempotent: writing the same fields twice leaves one unchanged row", async () => {
    const { service, rows } = fakeTranslationService();
    const container = containerOf(service);

    await upsertTranslationFields(container, "product", "prod_1", "en", { title: "Blue Scarf" });
    await upsertTranslationFields(container, "product", "prod_1", "en", { title: "Blue Scarf" });

    expect(rows).toHaveLength(1);
    expect(rows[0].translations).toEqual({ title: "Blue Scarf" });
  });

  it("does not touch another locale's row for the same product", async () => {
    const { service, rows } = fakeTranslationService();
    const container = containerOf(service);

    await upsertTranslationFields(container, "product", "prod_1", "en", { title: "Blue Scarf" });
    await upsertTranslationFields(container, "product", "prod_1", "fr", { title: "Écharpe bleue" });

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.locale_code === "en")?.translations).toEqual({
      title: "Blue Scarf",
    });
    expect(rows.find((row) => row.locale_code === "fr")?.translations).toEqual({
      title: "Écharpe bleue",
    });
  });

  it("clears a field when it is submitted empty, dropping the key rather than storing an empty string", async () => {
    const { service, rows } = fakeTranslationService();
    const container = containerOf(service);

    await upsertTranslationFields(container, "product", "prod_1", "en", {
      title: "Blue Scarf",
      subtitle: "100% wool",
    });
    await upsertTranslationFields(container, "product", "prod_1", "en", { subtitle: "" });

    expect(rows).toHaveLength(1);
    expect(rows[0].translations).toEqual({ title: "Blue Scarf" });
  });

  it("leaves a field untouched when it is not submitted at all", async () => {
    const { service, rows } = fakeTranslationService();
    const container = containerOf(service);

    await upsertTranslationFields(container, "product", "prod_1", "en", {
      title: "Blue Scarf",
      subtitle: "100% wool",
    });
    await upsertTranslationFields(container, "product", "prod_1", "en", { title: "Blue Scarf v2" });

    expect(rows[0].translations).toEqual({ title: "Blue Scarf v2", subtitle: "100% wool" });
  });

  it("writes nothing when every submitted field is empty and no row exists yet", async () => {
    const { service, rows } = fakeTranslationService();
    const container = containerOf(service);

    await upsertTranslationFields(container, "product", "prod_1", "en", { subtitle: "" });

    expect(rows).toHaveLength(0);
  });
});

describe("readTranslationsByLocale", () => {
  it("groups rows of several ids and locales by id then locale", async () => {
    const { service } = fakeTranslationService();
    const container = containerOf(service);

    await upsertTranslationFields(container, "product", "prod_1", "en", { title: "Blue Scarf" });
    await upsertTranslationFields(container, "product", "prod_1", "fr", { title: "Écharpe bleue" });
    await upsertTranslationFields(container, "product", "prod_2", "en", { title: "Red Hat" });

    const byId = await readTranslationsByLocale(container, ["prod_1", "prod_2"]);

    expect(byId.get("prod_1")?.get("en")).toEqual({ title: "Blue Scarf" });
    expect(byId.get("prod_1")?.get("fr")).toEqual({ title: "Écharpe bleue" });
    expect(byId.get("prod_2")?.get("en")).toEqual({ title: "Red Hat" });
  });

  it("answers an empty map for no ids without calling the service with an unbounded filter", async () => {
    const { service } = fakeTranslationService();
    const container = containerOf(service);

    const byId = await readTranslationsByLocale(container, []);

    expect(byId.size).toBe(0);
  });
});
