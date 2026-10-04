import { readFileSync } from "fs";
import { join } from "path";
import { MARKETPLACES } from "../../../../modules/marketplace/registry";
import { validateAdapter, MarketplaceGuardError } from "../../../../modules/marketplace/guards";
import type { MarketplaceAdapter, ReadEndpoint } from "../../../../modules/marketplace/contract";

/**
 * THE READ-ONLY PROOF OF THE DESK (w18-mp-reviews-desk, retargeted by
 * mp-section-design task-05 onto «Wildberries → Отзывы»).
 *
 * Ivan's standing order of 2026-09-16 02:46 WITA: the marketplaces are
 * read-only for us. Answering a review is a WRITE on both of them —
 * `POST /api/v1/feedbacks/answer` (WB), `POST /v1/review/comment/create` and
 * `POST /v1/question/answer/create` (Ozon) — and this screen is the first one
 * whose whole subject is answers, so it is the one place where a send would
 * look natural to add.
 *
 * Two belts, both of them measured rather than asserted in prose:
 *
 *   1. The screen's own handlers are READ and parsed here, and none of them
 *      names a deny-listed path or calls anything that opens a socket.
 *   2. Every adapter's registry is walked, and no answer method is in it. The
 *      last test adds one on purpose and expects the guard to refuse it, so
 *      the belt is shown to bite instead of being taken on trust.
 */

const DESK_DIR = join(__dirname, "..");

/** The list of «Wildberries → Отзывы» since mp-section-design task-05. */
const LIST_ROUTE = "[marketplace]/reviews/route.ts";

/**
 * Every file a request to the screen can run through: the list route, the
 * draft routes, and the module files they share (moved out of this directory
 * by task-05; the w18 tab routes `reviews/route.ts` and `questions/route.ts`
 * are gone with the tabs).
 */
const HANDLER_FILES = [
  LIST_ROUTE,
  "../../../modules/marketplace/desk.ts",
  "../../../modules/marketplace/reviews-list.ts",
  "draft-handlers.ts",
  "reviews/[id]/draft/route.ts",
  "questions/[id]/draft/route.ts",
  "reviews/[id]/suggest/route.ts",
  "questions/[id]/suggest/route.ts",
];

type Scanned = { code: string; strings: string[] };

/**
 * Source split into CODE and STRING LITERALS, with comments removed.
 *
 * A regex sweep over raw text would fail on this very file: the paragraph
 * above names all three answer methods, and the handlers name them in their
 * own comments precisely to say that they are unreachable. A comment is not a
 * call, and a scanner that cannot tell them apart teaches the next author to
 * delete the explanation rather than the risk (rule 8b).
 */
const scan = (source: string): Scanned => {
  let code = "";
  const strings: string[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index += 1;
      }
      index += 2;
      code += " ";
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      index += 1;
      let value = "";
      while (index < source.length) {
        if (source[index] === "\\") {
          value += source[index + 1] ?? "";
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          break;
        }
        value += source[index];
        index += 1;
      }
      strings.push(value);
      code += '""';
      continue;
    }

    code += char;
    index += 1;
  }

  return { code, strings };
};

const handlers = HANDLER_FILES.map((file) => ({
  file,
  ...scan(readFileSync(join(DESK_DIR, file), "utf8")),
}));

/** Every (method, path) both marketplaces document as a mutation. */
const deniedPaths = MARKETPLACES.flatMap((adapter) =>
  adapter.mutationDenyList.map((entry) => entry.path),
);

const ANSWER_PATHS = [
  "/api/v1/feedbacks/answer",
  "/v1/review/comment/create",
  "/v1/question/answer/create",
];

describe("the desk's handlers cannot reach a marketplace", () => {
  it("reads every handler file it claims to check", () => {
    expect(handlers).toHaveLength(HANDLER_FILES.length);
    for (const handler of handlers) {
      /** A file that disappeared must fail this suite, not silently pass it. */
      expect(handler.code.length).toBeGreaterThan(0);
    }
  });

  it("names no deny-listed path in any string it builds", () => {
    for (const handler of handlers) {
      for (const literal of handler.strings) {
        for (const path of [...deniedPaths, ...ANSWER_PATHS]) {
          expect(`${handler.file}: ${literal}`).not.toContain(path);
        }
      }
    }
  });

  it("opens no socket and calls no adapter I/O", () => {
    const forbidden = [
      "fetch(",
      "wbRead",
      "ozonRead",
      "axios",
      "XMLHttpRequest",
      "https:",
      "http:",
      ".read(",
      ".runSync(",
      ".inspectCredentials(",
    ];

    for (const handler of handlers) {
      for (const token of forbidden) {
        expect(`${handler.file}: ${handler.code}`).not.toContain(token);
      }
    }
  });

  it("lists with GET alone, and writes nothing on the way", () => {
    const list = handlers.find((one) => one.file === LIST_ROUTE) as Scanned;
    const shared = handlers.filter((one) => one.file.includes("modules/marketplace/"));

    expect(list.code).toMatch(/export const GET\b/);
    for (const verb of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(list.code).not.toMatch(new RegExp(`export\\s+(?:const|async function)\\s+${verb}\\b`));
    }
    for (const one of [list, ...shared]) {
      expect(one.code.match(/\.(update|create|delete|upsert|softDelete)\w*\(/g) ?? []).toEqual([]);
    }
  });

  it("writes only into the two draft columns of our own database", () => {
    const draftHandlers = handlers.find((one) => one.file === "draft-handlers.ts");
    expect(draftHandlers).toBeDefined();

    const writes = (draftHandlers as Scanned).code.match(/\.(update|create|delete)\w*\(/g) ?? [];
    expect(writes.sort()).toEqual([".updateMpQuestions(", ".updateMpReviews("].sort());
  });
});

describe("no adapter can answer a review", () => {
  it("registers no answer method as a read", () => {
    for (const adapter of MARKETPLACES) {
      for (const endpoint of adapter.endpoints) {
        expect(ANSWER_PATHS).not.toContain(endpoint.path);
        expect(
          adapter.mutationDenyList.some(
            (entry) =>
              entry.path === endpoint.path &&
              (entry.method === "*" || entry.method === endpoint.method),
          ),
        ).toBe(false);
      }
    }
  });

  it("keeps all three answer methods in the deny-lists, with their doc pages", () => {
    const denied = MARKETPLACES.flatMap((adapter) => adapter.mutationDenyList);

    for (const path of ANSWER_PATHS) {
      const entries = denied.filter((entry) => entry.path === path);
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.summary.length).toBeGreaterThan(0);
        expect(entry.docUrl).toContain("http");
      }
    }
  });

  it("refuses an adapter that registers one anyway", () => {
    for (const adapter of MARKETPLACES) {
      const answer = adapter.mutationDenyList.find((entry) => ANSWER_PATHS.includes(entry.path));
      if (!answer) {
        continue;
      }

      const evil: ReadEndpoint = {
        id: "evil.answer",
        host: adapter.endpoints[0].host,
        method: "POST",
        path: answer.path,
        docUrl: answer.docUrl,
        summary: "registered on purpose by the suite",
        readViaPost: { docUrl: answer.docUrl, reason: "a lie the guard has to catch" },
      };

      const broken = {
        ...adapter,
        endpoints: [...adapter.endpoints, evil],
      } as MarketplaceAdapter;

      expect(() => validateAdapter(broken)).toThrow(MarketplaceGuardError);
    }
  });
});
