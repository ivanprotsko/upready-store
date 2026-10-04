import { LessonQuizSchema, parseLessonQuiz } from "../quiz";

const question = (overrides: Record<string, unknown> = {}) => ({
  text: "Сколько раз в день парим ножки?",
  options: ["Один раз", "Три раза"],
  correct: 0,
  ...overrides,
});

describe("lesson quiz shape (ask-20261005-061005-2e78)", () => {
  it("accepts one to three questions with two to four options each", () => {
    expect(LessonQuizSchema.safeParse({ questions: [question()] }).success).toBe(true);
    expect(
      LessonQuizSchema.safeParse({
        questions: [
          question(),
          question({ options: ["А", "Б", "В"], correct: 2 }),
          question({ options: ["А", "Б", "В", "Г"], correct: 3 }),
        ],
      }).success,
    ).toBe(true);
  });

  it("refuses an empty test and a fourth question", () => {
    expect(LessonQuizSchema.safeParse({ questions: [] }).success).toBe(false);
    expect(
      LessonQuizSchema.safeParse({ questions: [question(), question(), question(), question()] })
        .success,
    ).toBe(false);
  });

  it("refuses one option, five options and a blank option", () => {
    expect(LessonQuizSchema.safeParse({ questions: [question({ options: ["А"] })] }).success).toBe(
      false,
    );
    expect(
      LessonQuizSchema.safeParse({
        questions: [question({ options: ["А", "Б", "В", "Г", "Д"] })],
      }).success,
    ).toBe(false);
    expect(
      LessonQuizSchema.safeParse({ questions: [question({ options: ["А", "  "] })] }).success,
    ).toBe(false);
  });

  it("refuses an answer index outside the options, a fraction and a negative one", () => {
    for (const correct of [2, 1.5, -1]) {
      expect(LessonQuizSchema.safeParse({ questions: [question({ correct })] }).success).toBe(false);
    }
  });

  it("refuses a blank question and keys it does not know", () => {
    expect(LessonQuizSchema.safeParse({ questions: [question({ text: " " })] }).success).toBe(false);
    expect(
      LessonQuizSchema.safeParse({ questions: [question({ explanation: "почему" })] }).success,
    ).toBe(false);
    expect(LessonQuizSchema.safeParse({ questions: [question()], title: "Тест" }).success).toBe(false);
  });

  it("reads a stored value as the test, or as no test when it is missing or malformed", () => {
    expect(parseLessonQuiz({ questions: [question({ text: "  Вопрос  " })] })).toEqual({
      questions: [question({ text: "Вопрос" })],
    });
    expect(parseLessonQuiz(null)).toBeNull();
    expect(parseLessonQuiz(undefined)).toBeNull();
    expect(parseLessonQuiz({ questions: [] })).toBeNull();
    expect(parseLessonQuiz({ questions: [question({ correct: 5 })] })).toBeNull();
    expect(parseLessonQuiz("not a test")).toBeNull();
  });
});
