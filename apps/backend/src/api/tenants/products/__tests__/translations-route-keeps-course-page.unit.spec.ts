import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { PUT } from "../[id]/translations/route";

jest.mock("../../tenant-scope", () => ({
  getTenantScope: jest.fn(async () => ({ id: "ten_1", handle: "cherkashino-com" })),
  assertOwnedProduct: jest.fn(async () => undefined),
}));

jest.mock("../../../../storefront-revalidate", () => ({
  notifyStorefrontRevalidate: jest.fn(async () => 200),
}));

/**
 * N10 (t-2026-10-04-19): the English course landing sits in the product's
 * `metadata.course_page.i18n.en`, not in the Translation module, because the
 * module keeps only `.translatable()` text fields of a row. This pins the other
 * half of that choice: the owner's «Переводы» save (`PUT
 * /tenants/products/:id/translations`) writes translation rows and nothing
 * else, so saving an English title can never touch, let alone erase, the
 * course page's translation.
 *
 * The container answers only the two services the route is meant to use; any
 * other resolve (the product module, a workflow's dependencies) fails the test.
 */

const TRANSLATABLE = ["title", "subtitle", "description", "material"];

type Row = { id: string; reference: string; reference_id: string; locale_code: string; translations: Record<string, unknown> };

const setup = () => {
  const metadata = {
    course_page: {
      about: [{ heading: "Что входит", body: "Программа длится 7 дней." }],
      faq: [],
      testimonials: [],
      i18n: { en: { about: [{ heading: "What's included", body: "The programme lasts 7 days." }] } },
    },
  };
  const before = JSON.parse(JSON.stringify(metadata));
  const product = {
    id: "prod_course",
    title: "Очищение печени",
    subtitle: null,
    description: "Без лекарств и препаратов.",
    options: [{ id: "opopt_1", title: "Формат" }],
    variants: [{ id: "variant_1", title: "Онлайн" }],
    metadata,
  };

  const rows: Row[] = [];
  const translation = {
    // The real module drops every key a row holds that is not a translatable field.
    listTranslations: jest.fn(async (filters: Record<string, unknown>) =>
      rows
        .filter((row) => !filters.reference || row.reference === filters.reference)
        .filter((row) => !filters.locale_code || row.locale_code === filters.locale_code)
        .filter((row) => (filters.reference_id as string[]).includes(row.reference_id))
        .map((row) => ({
          ...row,
          translations: Object.fromEntries(
            Object.entries(row.translations).filter(([key]) => TRANSLATABLE.includes(key)),
          ),
        })),
    ),
    createTranslations: jest.fn(async (data: Omit<Row, "id">) => {
      rows.push({ id: `trans_${rows.length + 1}`, ...data });
    }),
    updateTranslations: jest.fn(async ({ id, translations }: { id: string; translations: Record<string, unknown> }) => {
      rows.find((row) => row.id === id)!.translations = translations;
    }),
    listLocales: jest.fn(async () => [{ code: "en" }]),
    createLocales: jest.fn(async () => undefined),
  };
  const query = {
    graph: jest.fn(async () => ({
      data: [
        {
          id: product.id,
          title: product.title,
          subtitle: product.subtitle,
          description: product.description,
          options: product.options,
          variants: product.variants,
        },
      ],
    })),
  };

  const resolved: string[] = [];
  const scope = {
    resolve: (key: string) => {
      resolved.push(key);
      if (key === ContainerRegistrationKeys.QUERY) return query;
      if (key === Modules.TRANSLATION) return translation;
      throw new Error(`the «Переводы» save resolved "${key}"`);
    },
  };

  return { product, before, rows, translation, query, resolved, scope };
};

const save = async (scope: unknown, body: Record<string, unknown>) => {
  const res = { json: jest.fn() };
  await PUT({ params: { id: "prod_course" }, scope, validatedBody: body } as never, res as never);
  return res;
};

describe("«Переводы» save and the course page translation", () => {
  it("writes the English title as a translation row and leaves metadata.course_page.i18n as it was", async () => {
    const { product, before, rows, resolved, scope } = setup();

    await save(scope, { locale: "en", title: "Liver Cleanse", description: "No medicines or drugs." });

    expect(product.metadata).toEqual(before);
    expect(rows).toEqual([
      expect.objectContaining({
        reference: "product",
        reference_id: "prod_course",
        locale_code: "en",
        translations: { title: "Liver Cleanse", description: "No medicines or drugs." },
      }),
    ]);
    expect(new Set(resolved)).toEqual(new Set([ContainerRegistrationKeys.QUERY, Modules.TRANSLATION]));
  });

  it("asks the product only for its texts, options and variants, never for its metadata", async () => {
    const { query, scope } = setup();

    await save(scope, { locale: "en", title: "Liver Cleanse", options: { opopt_1: "Format" } });

    for (const [call] of query.graph.mock.calls as unknown as [{ fields: string[] }][]) {
      expect(call.fields.some((field) => field.startsWith("metadata"))).toBe(false);
    }
  });

  it("keeps the course page through a second save of the same locale", async () => {
    const { product, before, rows, scope } = setup();

    await save(scope, { locale: "en", title: "Liver Cleanse" });
    await save(scope, { locale: "en", subtitle: "7 days" });

    expect(product.metadata).toEqual(before);
    expect(rows.filter((row) => row.reference === "product")).toHaveLength(1);
    expect(rows[0].translations).toEqual({ title: "Liver Cleanse", subtitle: "7 days" });
  });
});
