import { z } from "@medusajs/framework/zod";

/**
 * The test after a lesson (ask-20261005-061005-2e78, Ivan 05.10: «3 шага по
 * 1 вопросу с вариантами ответов, чтобы человек тратил на тексты не более 1-2
 * минут»): at most three questions, each with two to four options and
 * `correct`, the zero-based index of the right option. It is a self-check,
 * not an exam, so the store API hands `correct` to the buyer along with the
 * question and nothing about an answer is stored.
 */
export const LESSON_QUIZ_MAX_QUESTIONS = 3;

export const LessonQuizQuestionSchema = z
  .strictObject({
    text: z.string().trim().min(1).max(500),
    options: z.array(z.string().trim().min(1).max(300)).min(2).max(4),
    correct: z.number().int().min(0),
  })
  .refine((question) => question.correct < question.options.length, {
    message: "correct must name one of the options.",
    path: ["correct"],
  });

export const LessonQuizSchema = z.strictObject({
  questions: z.array(LessonQuizQuestionSchema).min(1).max(LESSON_QUIZ_MAX_QUESTIONS),
});

export type LessonQuiz = z.infer<typeof LessonQuizSchema>;

/**
 * `lesson.quiz` as the storefront may show it, else null. A stored value that
 * does not match `LessonQuizSchema` (an empty list, a fourth question, an
 * answer index past the options) reads as no test at all rather than as a
 * test that cannot be passed.
 */
export const parseLessonQuiz = (value: unknown): LessonQuiz | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = LessonQuizSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
};
