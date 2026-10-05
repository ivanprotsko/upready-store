import type { MedusaContainer } from "@medusajs/framework";
import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

/**
 * t-2026-10-04-19: the «Course programme» block on cherkashino.com/en came in
 * Russian, because the store course routes handed out `course` and `lesson`
 * rows as stored. They now resolve the title, the description and every
 * lesson title for `x-medusa-locale` through the translation module.
 *
 * The shop's base text is Russian, so `/en` reads the English rows and `/ru`
 * keeps the base: there is no `ru` translation to read, and none is needed.
 * A fake stands in for `Modules.TRANSLATION`, holding rows the way the SQL
 * and `upsertTranslationFields` write them.
 */

jest.mock("../../resolve-tenant", () => ({
  resolveTenantFromPublishableKey: jest.fn().mockResolvedValue({
    id: "ten_com",
    handle: "cherkashino-com",
    name: "Черкашино",
    sales_channel_id: "sc_com",
  }),
}));

import { GET as getProductCourse } from "../route";
import { GET as getMyCourse } from "../mine/[slug]/route";
import { GET as getLesson } from "../[id]/lessons/[lessonId]/route";
import { translateRows } from "../store-course-helpers";

type TranslationRow = {
  reference: string;
  reference_id: string;
  locale_code: string;
  translations: Record<string, unknown>;
};

const COURSE = {
  id: "crs_liver",
  tenant_id: "ten_com",
  product_id: "prod_liver",
  title: "Очищение печени",
  slug: "ochishchenie-pecheni",
  description: "Без лекарств и препаратов. Мягкое и естественное очищение до последнего камня.",
  status: "published",
  created_at: "2026-09-24T00:00:00.000Z",
  updated_at: "2026-09-24T00:00:00.000Z",
};

const lesson = (id: string, order: number, title: string) => ({
  id,
  tenant_id: "ten_com",
  course_id: COURSE.id,
  title,
  order,
  body: "Текст урока",
  video_url: null,
  quiz: null,
});

const LESSONS = [
  lesson("lsn_2", 2, "Телеграм-канал участников курса"),
  lesson("lsn_1", 1, "Приветственное видео от Оксаны"),
  // Renamed by the owner after the translation: no English row matches it.
  lesson("lsn_3", 3, "Новый урок без перевода"),
];

const TRANSLATIONS: TranslationRow[] = [
  {
    reference: "course",
    reference_id: COURSE.id,
    locale_code: "en",
    translations: {
      title: "Liver Cleanse",
      description: "No medicines or drugs. A gentle, natural cleanse down to the very last stone.",
    },
  },
  {
    reference: "lesson",
    reference_id: "lsn_1",
    locale_code: "en",
    translations: { title: "Welcome video from Oksana" },
  },
  {
    reference: "lesson",
    reference_id: "lsn_2",
    locale_code: "en",
    translations: { title: "Telegram channel for course participants" },
  },
  // Another language's row must not leak into either page.
  {
    reference: "lesson",
    reference_id: "lsn_1",
    locale_code: "de",
    translations: { title: "Willkommensvideo von Oksana" },
  },
];

const fakeTranslationService = () => ({
  listTranslations: jest.fn(async (filters: { reference?: string; reference_id?: string[] }) =>
    TRANSLATIONS.filter(
      (row) =>
        (!filters.reference || row.reference === filters.reference) &&
        (!filters.reference_id || filters.reference_id.includes(row.reference_id)),
    ),
  ),
});

const fakeCourseService = () => ({
  listCourses: jest.fn(async () => [COURSE]),
  listLessons: jest.fn(async (filters: { id?: string }) =>
    filters.id ? LESSONS.filter((row) => row.id === filters.id) : LESSONS,
  ),
  listCourseEntitlements: jest.fn(async () => [{ id: "cent_1", status: "active" }]),
  listCourseProgresses: jest.fn(async () => []),
});

const fakeReq = (
  locale: string | undefined,
  extra: Record<string, unknown> = {},
  services = { translation: fakeTranslationService(), course: fakeCourseService() },
) => {
  const req = {
    locale,
    query: { product_id: COURSE.product_id },
    params: { slug: COURSE.slug, id: COURSE.id, lessonId: "lsn_1" },
    auth_context: { actor_id: "cus_1" },
    scope: {
      resolve: (key: string) => {
        if (key === Modules.TRANSLATION) return services.translation;
        if (key === "course") return services.course;
        throw new Error(`unexpected resolve(${key})`);
      },
    },
    ...extra,
  };
  return { req: req as unknown as MedusaStoreRequest, services };
};

const fakeRes = () => {
  const res = { json: jest.fn() };
  return res as unknown as MedusaResponse & { json: jest.Mock };
};

type CoursePayload = {
  course: { title: string; description: string | null };
  lessons: { id: string; title: string }[];
};

const productBlock = async (locale: string | undefined) => {
  const { req, services } = fakeReq(locale);
  const res = fakeRes();
  await getProductCourse(req, res);
  return { body: res.json.mock.calls[0][0] as CoursePayload, services };
};

describe("GET /store/tenant/courses, the product page's «Course programme»", () => {
  it("translates the course and every translated lesson into English on /en", async () => {
    const { body } = await productBlock("en");

    expect(body.course.title).toBe("Liver Cleanse");
    expect(body.course.description).toBe(
      "No medicines or drugs. A gentle, natural cleanse down to the very last stone.",
    );
    expect(body.lessons.map((row) => row.title)).toEqual([
      "Welcome video from Oksana",
      "Telegram channel for course participants",
      // No English for a renamed lesson: its own text rather than a blank or another lesson's.
      "Новый урок без перевода",
    ]);
  });

  it("keeps the Russian base on /ru", async () => {
    const { body } = await productBlock("ru");

    expect(body.course.title).toBe(COURSE.title);
    expect(body.course.description).toBe(COURSE.description);
    expect(body.lessons.map((row) => row.title)).toEqual([
      "Приветственное видео от Оксаны",
      "Телеграм-канал участников курса",
      "Новый урок без перевода",
    ]);
  });

  it("reads the language part of a regional locale, en-US to en", async () => {
    const { body } = await productBlock("en-US");

    expect(body.course.title).toBe("Liver Cleanse");
    expect(body.lessons[0].title).toBe("Welcome video from Oksana");
  });

  it("answers in the base text without a translation query when no locale is sent", async () => {
    const { body, services } = await productBlock(undefined);

    expect(body.course.title).toBe(COURSE.title);
    expect(body.lessons[0].title).toBe("Приветственное видео от Оксаны");
    expect(services.translation.listTranslations).not.toHaveBeenCalled();
  });

  it("asks the translation module for this course's and these lessons' rows only", async () => {
    const { services } = await productBlock("en");

    expect(services.translation.listTranslations).toHaveBeenCalledWith({
      reference: "course",
      reference_id: [COURSE.id],
    });
    expect(services.translation.listTranslations).toHaveBeenCalledWith({
      reference: "lesson",
      reference_id: ["lsn_1", "lsn_2", "lsn_3"],
    });
  });
});

describe("the account's contents, lesson and test pages", () => {
  it("GET /store/tenant/courses/mine/:slug lists the course and its lessons in English on /en", async () => {
    const { req } = fakeReq("en");
    const res = fakeRes();
    await getMyCourse(req as never, res);
    const body = res.json.mock.calls[0][0] as CoursePayload;

    expect(body.course.title).toBe("Liver Cleanse");
    expect(body.lessons.map((row) => row.title)).toEqual([
      "Welcome video from Oksana",
      "Telegram channel for course participants",
      "Новый урок без перевода",
    ]);
  });

  it("GET /store/tenant/courses/mine/:slug keeps Russian on /ru", async () => {
    const { req } = fakeReq("ru");
    const res = fakeRes();
    await getMyCourse(req as never, res);
    const body = res.json.mock.calls[0][0] as CoursePayload;

    expect(body.course.title).toBe("Очищение печени");
    expect(body.lessons[0].title).toBe("Приветственное видео от Оксаны");
  });

  it("GET /store/tenant/courses/:id/lessons/:lessonId titles the lesson in English on /en and leaves the body alone", async () => {
    const { req } = fakeReq("en");
    const res = fakeRes();
    await getLesson(req as never, res);
    const { lesson: body } = res.json.mock.calls[0][0] as { lesson: { title: string; body: string } };

    expect(body.title).toBe("Welcome video from Oksana");
    expect(body.body).toBe("Текст урока");
  });

  it("GET /store/tenant/courses/:id/lessons/:lessonId keeps the Russian title on /ru", async () => {
    const { req } = fakeReq("ru");
    const res = fakeRes();
    await getLesson(req as never, res);
    const { lesson: body } = res.json.mock.calls[0][0] as { lesson: { title: string } };

    expect(body.title).toBe("Приветственное видео от Оксаны");
  });
});

describe("translateRows", () => {
  const containerWith = (service: unknown): MedusaContainer =>
    ({ resolve: () => service }) as unknown as MedusaContainer;

  it("returns copies and leaves the stored rows untouched", async () => {
    const rows = [{ id: "crs_liver", title: "Очищение печени", description: null as string | null }];

    const [translated] = await translateRows(
      containerWith(fakeTranslationService()),
      "course",
      rows,
      ["title", "description"],
      "en",
    );

    expect(translated.title).toBe("Liver Cleanse");
    // A course without a description stays without one: there is no base text to stand in for.
    expect(translated.description).toBeNull();
    expect(rows[0].title).toBe("Очищение печени");
  });

  it("ignores a blank translation and keeps the base", async () => {
    const service = {
      listTranslations: async () => [
        { reference: "lesson", reference_id: "lsn_1", locale_code: "en", translations: { title: "  " } },
      ],
    };

    const [translated] = await translateRows(
      containerWith(service),
      "lesson",
      [{ id: "lsn_1", title: "Клизмы" }],
      ["title"],
      "en",
    );

    expect(translated.title).toBe("Клизмы");
  });
});
