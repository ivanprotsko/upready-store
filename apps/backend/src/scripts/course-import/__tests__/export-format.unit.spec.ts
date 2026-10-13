import { parseImportArgs } from "../../course-import-export";
import {
  classifyTarget,
  dripDayOf,
  linksOf,
  rewriteLessonMarkdown,
  sectionOf,
  stripExportHeader,
} from "../export-format";

/**
 * t-2026-10-13-29 stage 2: what a lesson of the GetCourse export
 * (`export/README.md` of stage 1) turns into before anything is uploaded. The
 * markdown below is cut from the liver and lymph exports as they are.
 */

const LIVER_01 = `# Доступ к чату вашего тарифа

- GetCourse lesson id: 349870497
- Lesson URL: https://course.cherkashinaoks.ru/pl/teach/control/lesson/view?id=349870497

Мы благодарим вас за доверие.

**ССЫЛКА НА КАНАЛ «КАМНИ 26 ПОТОКА»**

[Вступить в канал](https://t.me/+lvFCqvjB_chmZGI6)


**ССЫЛКА НА ЧАТ «КАМНИ 26 ПОТОКА»**

[Вступить в чат](https://t.me/+08CcqPKVeoFhNjAy)
`;

const LIVER_02 = `# Список симптомов наличия камней

- GetCourse lesson id: 349870498
- Lesson URL: https://course.cherkashinaoks.ru/pl/teach/control/lesson/view?id=349870498

![](02-spisok-simptomov-nalichiya-kamney-img01.jpg)

> **Видео** (4.1 мин): [videos/265221338.mp4](../videos/265221338.mp4)

- Файл: [Подготовительный этап.pdf](../files/%D0%9F%D0%BE%D0%B4%D0%B3%D0%BE%D1%82%D0%BE%D0%B2%D0%B8%D1%82%D0%B5%D0%BB%D1%8C%D0%BD%D1%8B%D0%B9%20%D1%8D%D1%82%D0%B0%D0%BF.pdf)

[Сайт](https://cherkashinaoks.ru/ochishenie)
`;

describe("stripExportHeader", () => {
  it("drops the title and the GetCourse lines and keeps the text", () => {
    expect(stripExportHeader(LIVER_01).split("\n")[0]).toBe("Мы благодарим вас за доверие.");
  });

  it("drops the module and list description lines of a lymph lesson too", () => {
    const md = "# Травяной метод\n\n- GetCourse lesson id: 1\n- Module: Подготовка (666012943)\n- Description in the lesson list: Как лежать на грелке\n\n> **Видео** (1 мин): [videos/1.mp4](../videos/1.mp4)";

    expect(stripExportHeader(md)).toBe("> **Видео** (1 мин): [videos/1.mp4](../videos/1.mp4)");
  });

  it("keeps a list in the text that only looks like a header further down", () => {
    const md = "# Т\n\n- GetCourse lesson id: 1\n\nТекст\n\n- Module: не заголовок";

    expect(stripExportHeader(md)).toBe("Текст\n\n- Module: не заголовок");
  });
});

describe("classifyTarget", () => {
  it("resolves the export's relative addresses against the course folder", () => {
    expect(classifyTarget("../videos/265221338.mp4", false)).toEqual({ kind: "video", file: "videos/265221338.mp4" });
    expect(classifyTarget("../files/%D0%9C%D0%B5%D0%BD%D1%8E.pdf", false)).toEqual({ kind: "file", file: "files/Меню.pdf" });
    expect(classifyTarget("02-img01.jpg", true)).toEqual({ kind: "image", file: "lessons/02-img01.jpg" });
  });

  it("leaves absolute addresses alone", () => {
    expect(classifyTarget("https://t.me/+x", false)).toBeNull();
    expect(classifyTarget("/static/a.jpg", true)).toBeNull();
    expect(classifyTarget("#top", false)).toBeNull();
  });
});

describe("rewriteLessonMarkdown", () => {
  const resolve = (target: { kind: string; file: string }) =>
    target.kind === "image" ? `https://cdn.example/${target.file}` : `/media?key=${target.file}`;

  it("points pictures at their public address and videos and files at the media route", () => {
    const body = rewriteLessonMarkdown(stripExportHeader(LIVER_02), resolve);

    expect(body).toContain("![](https://cdn.example/lessons/02-spisok-simptomov-nalichiya-kamney-img01.jpg)");
    expect(body).toContain("> **Видео** (4.1 мин): [Видео](/media?key=videos/265221338.mp4)");
    expect(body).toContain("[Подготовительный этап.pdf](/media?key=files/Подготовительный этап.pdf)");
    expect(body).toContain("[Сайт](https://cherkashinaoks.ru/ochishenie)");
    expect(body).not.toContain("../");
  });

  it("leaves an address it has nothing for as written", () => {
    expect(rewriteLessonMarkdown("[x](../files/a.pdf)", () => null)).toBe("[x](../files/a.pdf)");
  });
});

describe("linksOf", () => {
  it("tells the liver course's channel from its chat by the lesson's own words", () => {
    const links = linksOf(
      {
        external: [
          { kind: "telegram", url: "https://t.me/+lvFCqvjB_chmZGI6" },
          { kind: "telegram", url: "https://t.me/+08CcqPKVeoFhNjAy" },
          { kind: "telegram", url: "https://t.me/+08CcqPKVeoFhNjAy" },
        ],
      },
      stripExportHeader(LIVER_01),
    );

    expect(links).toEqual([
      { kind: "telegram_channel", url: "https://t.me/+lvFCqvjB_chmZGI6", title: "Вступить в канал" },
      { kind: "telegram_chat", url: "https://t.me/+08CcqPKVeoFhNjAy", title: "Вступить в чат" },
    ]);
  });

  it("reads the line above a link whose own text names neither", () => {
    const md = "**ССЫЛКА НА ЧАТ**\n\n[Перейти](https://t.me/+chat)";

    expect(linksOf({ external: [{ kind: "telegram", url: "https://t.me/+chat" }] }, md)).toEqual([
      { kind: "telegram_chat", url: "https://t.me/+chat", title: "Перейти" },
    ]);
  });

  it("lists a YouTube video with a plain title when the text has no link to it", () => {
    const md = "> **Видео YouTube:** https://www.youtube.com/watch?v=i_UTD2Mh4mI";

    expect(linksOf({ external: [{ kind: "youtube", url: "https://www.youtube.com/watch?v=i_UTD2Mh4mI" }] }, md)).toEqual([
      { kind: "youtube", url: "https://www.youtube.com/watch?v=i_UTD2Mh4mI", title: "Видео на YouTube" },
    ]);
  });
});

describe("sectionOf", () => {
  const course = {
    modules: [
      { id: "666012943", title: "Подготовка", lessonIds: ["259657975"] },
      { id: "666012944", title: "Первая неделя программы", lessonIds: ["259657984"] },
    ],
  };

  it("names the module and its place among the course's modules", () => {
    expect(sectionOf(course, { id: "259657984", module: "Первая неделя программы", moduleId: "666012944" })).toEqual({
      section: "Первая неделя программы",
      section_order: 2,
    });
  });

  it("is no section for a course without modules", () => {
    expect(sectionOf({ modules: [] }, { id: "349870497", module: null, moduleId: null })).toEqual({
      section: null,
      section_order: null,
    });
  });
});

describe("dripDayOf", () => {
  const drip = { lessons: { "349870507": 6, "349870509": 7, "349870498": 1, bad: 2.5 } };

  it("gives the day of a named lesson and null for the rest", () => {
    expect(dripDayOf(drip, "349870507")).toBe(6);
    expect(dripDayOf(drip, "349870499")).toBeNull();
    expect(dripDayOf(null, "349870507")).toBeNull();
  });

  it("reads day 1 and a fraction as open at once", () => {
    expect(dripDayOf(drip, "349870498")).toBeNull();
    expect(dripDayOf(drip, "bad")).toBeNull();
  });
});

describe("parseImportArgs", () => {
  it("reads pairs, dashed pairs, two words and the dry-run flag", () => {
    expect(parseImportArgs(["export=/x/liver", "--tenant", "cherkashino.ru", "--course=ochishchenie-pecheni", "dry-run"], {})).toEqual({
      exportDir: "/x/liver",
      tenant: "cherkashino.ru",
      course: "ochishchenie-pecheni",
      dryRun: true,
    });
  });

  it("falls back to the environment", () => {
    expect(
      parseImportArgs([], {
        COURSE_IMPORT_EXPORT: "/x/lymph",
        COURSE_IMPORT_TENANT: "cherkashino.ru",
        COURSE_IMPORT_COURSE: "nabor",
        COURSE_IMPORT_DRY_RUN: "1",
      }),
    ).toEqual({ exportDir: "/x/lymph", tenant: "cherkashino.ru", course: "nabor", dryRun: true });
  });
});
