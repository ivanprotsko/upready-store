/**
 * Pictures on a product page, in the order that finds the product's own photo
 * first: `og:image`, JSON-LD `Product.image`, then the largest `<img>` of the
 * main content (by its width and height attributes, else by document order).
 * At most six; relative addresses are made absolute against the page.
 */

export const MAX_PAGE_PICTURES = 6;

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  const v = m ? (m[1] ?? m[2] ?? m[3]) : undefined;
  return v === undefined ? null : decode(v.trim());
};

const absolute = (raw: string | null, base: string): string | null => {
  if (!raw || raw.startsWith("data:")) return null;
  try {
    const url = new URL(raw, base);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

function jsonLdImages(html: string, base: string): string[] {
  const out: string[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
    if (isProduct) {
      const image = obj.image;
      const list = Array.isArray(image) ? image : [image];
      for (const item of list) {
        const raw = typeof item === "string" ? item : item && typeof item === "object" ? ((item as Record<string, unknown>).url as unknown) : null;
        const abs = typeof raw === "string" ? absolute(raw, base) : null;
        if (abs) out.push(abs);
      }
    }
    if (obj["@graph"]) visit(obj["@graph"]);
  };
  for (const m of html.matchAll(/<script[^>]+type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1]!));
    } catch {
      // A broken block is skipped; the other sources still count.
    }
  }
  return out;
}

export function findPagePictures(html: string, base: string): string[] {
  const found: string[] = [];
  const add = (url: string | null) => {
    if (url && !found.includes(url)) found.push(url);
  };

  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const prop = (attr(m[0], "property") ?? attr(m[0], "name") ?? "").toLowerCase();
    if (prop === "og:image" || prop === "og:image:url" || prop === "og:image:secure_url") add(absolute(attr(m[0], "content"), base));
  }
  for (const url of jsonLdImages(html, base)) add(url);

  // The main content: inside <main> or <article> when there is one, else the body.
  const main = /<(main|article)\b[\s\S]*?<\/\1>/i.exec(html)?.[0] ?? html.replace(/<(header|footer|nav|aside)\b[\s\S]*?<\/\1>/gi, "");
  const imgs = [...main.matchAll(/<img\b[^>]*>/gi)].map((m, order) => {
    const tag = m[0];
    const src = absolute(attr(tag, "data-src") ?? attr(tag, "src"), base);
    const area = (Number(attr(tag, "width")) || 0) * (Number(attr(tag, "height")) || 0);
    const small = /(^|[\/_-])(icon|logo|sprite|avatar|pixel|blank)\b/i.test(src ?? "");
    return { src, area, order, small };
  });
  imgs
    .filter((i) => i.src && !i.small && (i.area === 0 || i.area >= 120 * 120))
    .sort((a, b) => b.area - a.area || a.order - b.order)
    .forEach((i) => add(i.src));

  return found.slice(0, MAX_PAGE_PICTURES);
}
