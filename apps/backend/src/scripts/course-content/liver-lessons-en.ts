import { LIVER_COURSE } from "./liver-lessons";

/**
 * The English of «Очищение печени» for cherkashino.com/en (t-2026-10-04-19):
 * the course's title and description and the title of every lesson, the text
 * of the product page's «Course programme» block and of the course in the
 * account. Translated by meaning, not transliterated. The title is the one the
 * product already carries in English on cherkashino.com, «Liver Cleanse».
 *
 * Each English title is keyed by the Russian title it translates, the one in
 * `LIVER_LESSONS`, so a lesson the owner renamed matches nothing here and
 * keeps its own text rather than another lesson's English. The lesson bodies
 * and the tests after them are not here: neither is a translatable field.
 *
 * Stored as translation rows with the reference `course` and `lesson`, locale
 * `en` (`courseTranslationPlan` below, `scripts/fixtures/o24-seed-course-translations.ts`).
 */
export const LIVER_COURSE_EN = {
  /** The Russian base the English below translates, the course's own row. */
  ru: { title: LIVER_COURSE.title, description: LIVER_COURSE.description },
  en: {
    title: "Liver Cleanse",
    description: "No medicines or drugs. A gentle, natural cleanse down to the very last stone.",
  },
};

export const LIVER_LESSON_TITLES_EN: Record<string, string> = {
  "Приветственное видео от Оксаны": "Welcome video from Oksana",
  "Телеграм-канал участников курса": "Telegram channel for course participants",
  "Ответственность участника программы": "Your responsibility as a participant",
  "Как пройти программу легко и результативно": "How to complete the programme easily and effectively",
  "Как пользоваться платформой": "How to use the platform",
  "Распаковка коробки и состав": "Unboxing: what is in the box",
  "Распаковка коробки. Часть 2": "Unboxing. Part 2",
  "Распаковка коробки. Часть 3": "Unboxing. Part 3",
  "Меню на период прохождения программы": "Your menu for the programme",
  "Трекер полезных привычек": "Healthy habits tracker",
  "Шесть ключей на программе «Очищение печени»": "Six keys of the Liver Cleanse programme",
  "Дыхательная гимнастика": "Breathing exercises",
  "Дыхательная гимнастика — практика с Оксаной": "Breathing exercises: practice with Oksana",
  "Маслом полоскаем рот": "Oil pulling",
  "Клизмы": "Enemas",
  "Парим ножки каждый день": "A hot foot bath every day",
  "Принципы очищения на программе «Очищение печени»": "Cleansing principles of the Liver Cleanse programme",
  "Очистительные процедуры": "Cleansing procedures",
  "Дюбаж. Инструкция по очищению печени": "Tubage. Liver cleanse instructions",
  "Эндогенное питание": "Endogenous nutrition",
  "Видео о вреде молока": "A video on why milk is harmful",
  "Про Валик": "About the back roller",
  "Лимфодренажный массаж": "Lymphatic drainage massage",
};

export type CourseTranslationRow = {
  reference: "course" | "lesson";
  reference_id: string;
  fields: Record<string, string>;
};

export type CourseTranslationPlan = {
  rows: CourseTranslationRow[];
  /** The course's own text is not the Russian the English translates: nothing of it is written. */
  courseSkipped: boolean;
  /** Lessons whose title is not one `LIVER_LESSON_TITLES_EN` knows, kept as they are. */
  skippedLessons: { id: string; order: number; title: string }[];
};

/**
 * What the English write is for one course row and its lessons: one
 * translation row for the course, one per lesson whose Russian title is one
 * of the translated ones. The course row is written only when its title and
 * description are still the Russian base above, so a course the owner
 * rewrote is not handed an English that no longer matches it.
 */
export const courseTranslationPlan = (
  course: { id: string; title: string; description: string | null },
  lessons: { id: string; order: number; title: string }[],
): CourseTranslationPlan => {
  const rows: CourseTranslationRow[] = [];
  const courseSkipped =
    course.title !== LIVER_COURSE_EN.ru.title || course.description !== LIVER_COURSE_EN.ru.description;

  if (!courseSkipped) {
    rows.push({ reference: "course", reference_id: course.id, fields: { ...LIVER_COURSE_EN.en } });
  }

  const skippedLessons: CourseTranslationPlan["skippedLessons"] = [];
  for (const lesson of [...lessons].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
    const english = Object.prototype.hasOwnProperty.call(LIVER_LESSON_TITLES_EN, lesson.title)
      ? LIVER_LESSON_TITLES_EN[lesson.title]
      : undefined;
    if (english) {
      rows.push({ reference: "lesson", reference_id: lesson.id, fields: { title: english } });
    } else {
      skippedLessons.push({ id: lesson.id, order: lesson.order, title: lesson.title });
    }
  }

  return { rows, courseSkipped, skippedLessons };
};
