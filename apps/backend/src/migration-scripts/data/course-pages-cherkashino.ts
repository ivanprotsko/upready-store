/**
 * What `course-pages-cherkashino-ru.ts` changes, as pure functions the unit suite runs
 * (t-2026-10-13-26). Ivan 13.10: «у нас 3 курса, на каждый я давал ссылки для заполнения
 * страницы … 1.1.2. страница с курсом по лимфе не заполнена … 1.1.3. третий баннер ведет на
 * страницу каталога, хотя там написано "товары от варикоза"».
 *
 * Read on the live cherkashino.ru on 13.10 at 21:3x (Store API with the shop's public key):
 * the lymph set held its landing's text, the description repeating the first section's list;
 * no kidneys course existed in any status; the third home banner linked to `/ru/store`; no
 * collection existed, and four products named «от варикоза» sat in four categories.
 */

/** The shop the order is about. */
export const COURSE_PAGES_HOST = "cherkashino.ru";

/** The lymph set, sold under the landing https://cherkashinaoks.ru/limfa. */
export const LYMPH_HANDLE = "nabor-dlya-ochischeniya-limfy-cherkashino";

/**
 * The description `fill-course-page.ts` wrote on the lymph set on 2026-10-02 and the live
 * page still showed on 13.10: its last paragraph is the list of the first «О программе»
 * section word for word. Only this text, or none, is replaced; an owner's own is kept.
 */
export const LYMPH_DESCRIPTION_BEFORE =
  "Очищение лимфы\nonline-формат\n\nАвторский курс Оксаны Черкашиной\n\nПриведите свою лимфу в порядок за 2 дня!\n\nЗдоровая лимфатическая система — залог вашего хорошего самочувствия и бодрости. Очищение лимфы помогает:\n- Удалить токсины\n- Избавиться от аллергенов\n- Снизить избыток глюкозы\n- Удалить холестерин\n- Очистить плазму крови от продуктов клеточного обмена\n- Устранить застойную желчь";

/**
 * The kidneys course, made the way the liver course is (`course-ochishchenie-pecheni-cherkashino`):
 * no type, no collection, one option «Доступ» with «Полный курс», a variant without inventory,
 * `metadata.digital`. It is created as a DRAFT: 5 000 ₽ is the landing's current price (8 000 ₽
 * crossed out, a separate 2 000 ₽ channel offer below), and the shop's prices are Ivan's, the
 * liver and the lymph set sell at 18 900 ₽ and 6 324 ₽ against their landings' 15 000/10 000 ₽
 * and 10 000/5 000 ₽. He confirms the price, adds a picture and publishes it in the panel.
 */
export const KIDNEYS = Object.freeze({
  handle: "course-ochishchenie-pochek-cherkashino",
  title: "Очищение почек",
  option_title: "Доступ",
  option_value: "Полный курс",
  sku: "COURSE-OCHISHCHENIE-POCHEK-CHERKASHINO",
  price_rub: 5000,
});

/** The varicose products the third banner promises: the shop's four named «от варикоза». */
export const VARICOSE = Object.freeze({
  collection_handle: "tovary-ot-varikoza-cherkashino",
  collection_title: "Товары от варикоза",
  product_handles: Object.freeze([
    "kapsuly-ot-varikoza-s-kashtanom-cherkashino",
    "maz-ot-varikoza-s-kashtanom-cherkashino",
    "svechi-ot-varikoza-s-kashtanom-cherkashino",
    "tabletki-ot-varikoza-s-kashtanom-cherkashino",
  ]),
  banner_id: "tovary-ot-varikoza",
});

/** Where the banner now leads: the collection's page, written without a locale like the other banners' links. */
export const VARICOSE_HREF = `/collections/${VARICOSE.collection_handle}`;

/** The catalogue links the banner was given before; any other link is the owner's own choice. */
const CATALOGUE_HREFS = new Set(["/store", "/ru/store"]);

/** JSON with sorted keys, so content read back from jsonb compares equal to the same content written. */
export const canonical = (value: unknown): string =>
  JSON.stringify(value ?? null, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );

export type ContentEdit = "write" | "already" | "different";

/**
 * Whether a product's page content may be written: `already` when it holds exactly this
 * content, `write` when its description is empty or the one this script replaces,
 * `different` when someone wrote a description of their own since.
 */
export const pageContentEdit = (
  current: { description?: string | null; course_page?: unknown },
  wanted: { description: string; course_page: unknown },
  replaceable: readonly string[] = [],
): ContentEdit => {
  const description = current.description ?? "";
  if (description === wanted.description && canonical(current.course_page) === canonical(wanted.course_page)) {
    return "already";
  }
  if (description === wanted.description || description.trim() === "" || replaceable.includes(description)) {
    return "write";
  }
  return "different";
};

export type CollectionEdit = "set" | "already" | "other";

/** A product goes into the collection unless it already sits in another one. */
export const collectionEdit = (currentCollectionId: string | null | undefined, collectionId: string): CollectionEdit =>
  !currentCollectionId ? "set" : currentCollectionId === collectionId ? "already" : "other";

type BannerLink = { type: string; href?: string; [key: string]: unknown };
type Banner = { id: string; link?: BannerLink; [key: string]: unknown };

export type BannerEdit<T extends Banner> =
  | { outcome: "changed"; banners: T[] }
  | { outcome: "already" | "different" | "missing"; banners: T[] };

/**
 * The home document's banners with the varicose one pointed at `href`: only when it still
 * leads to the catalogue; a banner the owner pointed elsewhere, or one that is gone, is left.
 */
export const varicoseBannerEdit = <T extends Banner>(banners: readonly T[], href: string = VARICOSE_HREF): BannerEdit<T> => {
  const list = [...banners];
  const index = list.findIndex((banner) => banner.id === VARICOSE.banner_id);
  if (index < 0) {
    return { outcome: "missing", banners: list };
  }
  const link = list[index].link;
  if (link?.type === "url" && link.href === href) {
    return { outcome: "already", banners: list };
  }
  if (link?.type !== "url" || !CATALOGUE_HREFS.has(link.href ?? "")) {
    return { outcome: "different", banners: list };
  }
  list[index] = { ...list[index], link: { type: "url", href } };
  return { outcome: "changed", banners: list };
};
