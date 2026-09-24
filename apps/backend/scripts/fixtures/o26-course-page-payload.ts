/**
 * t-2026-09-24-n23: the pure half of `o26-seed-course-page-content.ts`. Given
 * the product as it is on file and the content of
 * `data/course-ochishchenie-pecheni.json`, it answers the update to write and
 * the list of fields that would change. An empty list means the product
 * already holds exactly this content, which is what makes a re-run a no-op.
 *
 * Kept apart from the script so it can be tested without a container or a
 * database (`o26-course-page-payload.unit.spec.ts`).
 */

export type CoverVariant = { w: number; h: number; file: string };

export type CoursePageData = {
  tenant_handle: string;
  product_handle: string;
  description: string;
  cover: {
    /** Directory under the backend's `static/`, where `make-image-variants.mjs` wrote the files. */
    dir: string;
    /** The variant that serves as `thumbnail`, `images[0]` and `cover.src`. */
    src_width: number;
    alt: string;
    variants: CoverVariant[];
  };
  course_page: {
    about: { heading: string; body: string }[];
    faq: { q: string; a: string }[];
    testimonials: { author: string; text: string; source: "image" | "text" }[];
  };
};

export type ProductOnFile = {
  id: string;
  description: string | null;
  thumbnail: string | null;
  images: { url: string }[] | null;
  metadata: Record<string, unknown> | null;
};

/** What `metadata.cover` holds: everything the storefront needs for `srcset` and `sizes`. */
export type CoverMetadata = {
  src: string;
  srcset: { w: number; url: string }[];
  width: number;
  height: number;
  alt: string;
};

export type CoursePageUpdate = {
  description: string;
  thumbnail: string;
  images: { url: string }[];
  metadata: Record<string, unknown>;
};

const trimSlash = (url: string) => url.replace(/\/+$/, "");

export function buildCoverMetadata(data: CoursePageData, fileBaseUrl: string): CoverMetadata {
  const base = `${trimSlash(fileBaseUrl)}/${data.cover.dir.replace(/^\/+|\/+$/g, "")}`;
  const variants = [...data.cover.variants].sort((a, b) => a.w - b.w);
  const main = variants.find((variant) => variant.w === data.cover.src_width);

  if (!main) {
    throw new Error(`cover: no variant of width ${data.cover.src_width} in the data file`);
  }

  return {
    src: `${base}/${main.file}`,
    srcset: variants.map((variant) => ({ w: variant.w, url: `${base}/${variant.file}` })),
    width: main.w,
    height: main.h,
    alt: data.cover.alt,
  };
}

/** JSON with sorted keys: Postgres `jsonb` hands keys back in its own order. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );

/**
 * The update for one product. The cover becomes the first image; images the
 * product already had stay after it, except earlier copies of any cover
 * variant (a re-run with another `LOCAL_FILE_BACKEND_URL` replaces them rather
 * than piling up). Metadata keys other than `cover` and `course_page` are kept.
 */
export function buildCoursePageUpdate(
  product: ProductOnFile,
  data: CoursePageData,
  fileBaseUrl: string,
): { update: CoursePageUpdate; changes: string[] } {
  const cover = buildCoverMetadata(data, fileBaseUrl);
  const coverFiles = new Set(data.cover.variants.map((variant) => `/${data.cover.dir}/${variant.file}`));
  const isCoverCopy = (url: string) => [...coverFiles].some((suffix) => url.endsWith(suffix));

  const images = [
    { url: cover.src },
    ...(product.images ?? []).filter((image) => !isCoverCopy(image.url)).map((image) => ({ url: image.url })),
  ];

  const metadata = {
    ...(product.metadata ?? {}),
    cover,
    course_page: data.course_page,
  };

  const update: CoursePageUpdate = {
    description: data.description,
    thumbnail: cover.src,
    images,
    metadata,
  };

  const changes: string[] = [];
  if ((product.description ?? "") !== update.description) changes.push("description");
  if ((product.thumbnail ?? "") !== update.thumbnail) changes.push("thumbnail");
  if (canonical((product.images ?? []).map((image) => image.url)) !== canonical(images.map((image) => image.url))) {
    changes.push("images");
  }
  if (canonical(product.metadata?.cover) !== canonical(cover)) changes.push("metadata.cover");
  if (canonical(product.metadata?.course_page) !== canonical(data.course_page)) {
    changes.push("metadata.course_page");
  }

  return { update, changes };
}
