const markProductAsCourseIn = jest.fn(async () => undefined);

// The helper runs two workflows; what it writes is its own tests' business.
jest.mock("../../api/tenants/courses/course-helpers", () => ({
  __esModule: true,
  markProductAsCourseIn: (...args: unknown[]) => markProductAsCourseIn(...(args as [])),
}));

import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../modules/course";
import markCourseProduct from "../mark-course-product";

/**
 * pass 3b N6: the live course product was sold with no `metadata.digital`, so
 * the cart sidebar drew a freshly added course as a parcel until the server's
 * line arrived. The script puts the marker on, and only on a product a course
 * is really sold under.
 */

type Product = {
  id: string;
  handle: string;
  metadata?: Record<string, unknown> | null;
  shipping_profile?: { id: string } | null;
  variants?: { inventory_items?: { inventory?: { requires_shipping?: boolean } | null }[] }[];
};

const run = (opts: { args: string[]; products?: Product[]; coursesUnder?: string[] }) => {
  const info = jest.fn();
  const graph = jest.fn(async ({ filters }: { filters: { handle: string } }) => ({
    data: (opts.products ?? []).filter((product) => product.handle === filters.handle),
  }));
  const listCourses = jest.fn(async ({ product_id }: { product_id: string }) =>
    (opts.coursesUnder ?? []).includes(product_id) ? [{ id: "course_1", product_id }] : [],
  );

  const container = {
    resolve: (key: string) => {
      if (key === ContainerRegistrationKeys.LOGGER) return { info };
      if (key === ContainerRegistrationKeys.QUERY) return { graph };
      if (key === COURSE_MODULE) return { listCourses };
      throw new Error(`unexpected container key ${key}`);
    },
  };

  const result = markCourseProduct({ container, args: opts.args } as unknown as ExecArgs);
  const lines = () => info.mock.calls.map(([line]) => String(line)).join("\n");

  return { result, container, lines };
};

const UNMARKED: Product = { id: "prod_course", handle: "course-liver", metadata: { course_page: { title: "x" } } };

beforeEach(() => {
  markProductAsCourseIn.mockClear();
});

describe("mark-course-product", () => {
  it("marks a product a course is sold under", async () => {
    const { result, container, lines } = run({
      args: ["product=course-liver"],
      products: [UNMARKED],
      coursesUnder: ["prod_course"],
    });

    await result;
    expect(markProductAsCourseIn).toHaveBeenCalledTimes(1);
    expect(markProductAsCourseIn).toHaveBeenCalledWith(container, "prod_course");
    expect(lines()).toContain('metadata.digital = "true"');
  });

  it("refuses a product no course is sold under and writes nothing", async () => {
    const { result } = run({
      args: ["product=honey"],
      products: [{ id: "prod_honey", handle: "honey", metadata: null }],
      coursesUnder: ["prod_course"],
    });

    await expect(result).rejects.toThrow('no course is sold under "honey"');
    expect(markProductAsCourseIn).not.toHaveBeenCalled();
  });

  it("writes nothing on a dry run and says what it would change", async () => {
    const { result, lines } = run({
      args: ["product=course-liver", "dry-run"],
      products: [{ ...UNMARKED, shipping_profile: { id: "sp_1" } }],
      coursesUnder: ["prod_course"],
    });

    await result;
    expect(markProductAsCourseIn).not.toHaveBeenCalled();
    expect(lines()).toContain('would change: metadata.digital = "true"; shipping profile detached');
    expect(lines()).toContain("dry-run, nothing written");
  });

  it("writes nothing to a product that is already a course product", async () => {
    const { result, lines } = run({
      args: ["product=course-liver"],
      products: [{ ...UNMARKED, metadata: { digital: "true" }, shipping_profile: null }],
      coursesUnder: ["prod_course"],
    });

    await result;
    expect(markProductAsCourseIn).not.toHaveBeenCalled();
    expect(lines()).toContain("nothing to write");
  });

  it("still releases shipping on a marked product whose stock asks for a parcel", async () => {
    const { result, lines } = run({
      args: ["product=course-liver"],
      products: [
        {
          ...UNMARKED,
          metadata: { digital: "true" },
          variants: [{ inventory_items: [{ inventory: { requires_shipping: true } }] }],
        },
      ],
      coursesUnder: ["prod_course"],
    });

    await result;
    expect(markProductAsCourseIn).toHaveBeenCalledTimes(1);
    expect(lines()).toContain("inventory items no longer require shipping");
  });

  it("fails on an unknown handle", async () => {
    const { result } = run({ args: ["product=nope"], products: [UNMARKED], coursesUnder: ["prod_course"] });

    await expect(result).rejects.toThrow('product "nope" was not found');
    expect(markProductAsCourseIn).not.toHaveBeenCalled();
  });

  it("fails without a handle before reading anything", async () => {
    const { result } = run({ args: ["dry-run"] });

    await expect(result).rejects.toThrow("pass product=<handle>");
  });
});
