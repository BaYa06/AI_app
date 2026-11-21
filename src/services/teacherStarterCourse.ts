/**
 * «Создай первый тест за минуту» (plan/new/new_user_activation.md, Start 6.1): курс «Мой первый
 * курс» с готовым набором по предмету учителя. Курс сохраняется на сервере до набора — набор в курсе
 * сервер принимает только в свой курс.
 */
import { STARTER_THEMES, isStarterLang } from '@/constants/starterWords';
import { TEACHER_DEMO_LANGUAGE_WORDS, TEACHER_DEMO_SETS } from '@/constants/teacherDemoSets';
import { useCardsStore, useCoursesStore, useSetsStore } from '@/store';
import type { Course } from '@/types';
import { Analytics } from './analytics';
import { markTeacherTask } from './teacherStart';

export const STARTER_COURSE_TITLE = 'Мой первый курс';

export async function createTeacherStarterCourse(opts: {
  subject: string | null;
  nativeLanguage?: string | null;
  targetLanguage?: string | null;
}): Promise<Course | null> {
  const { course, synced } = await useCoursesStore
    .getState()
    .createCourseSynced(STARTER_COURSE_TITLE);
  if (!synced) return null;

  const native = isStarterLang(opts.nativeLanguage) ? opts.nativeLanguage : 'ru';
  const target =
    isStarterLang(opts.targetLanguage) && opts.targetLanguage !== native
      ? opts.targetLanguage
      : native === 'en'
        ? 'de'
        : 'en';

  // Учитель языка — «Первые слова» на его языках; остальные предметы — вопрос → ответ
  if (!opts.subject || opts.subject === 'languages') {
    const set = await useSetsStore.getState().addSet({
      title: STARTER_THEMES.first_words.title,
      languageFrom: target,
      languageTo: native,
      kind: 'language',
      courseId: course.id,
    });
    const words = STARTER_THEMES.first_words.concepts.slice(0, TEACHER_DEMO_LANGUAGE_WORDS);
    useCardsStore.getState().addCards(
      words.map((c) => ({
        setId: set.id,
        frontText: c.words[target].word,
        backText: c.words[native].word,
        example: c.words[target].example,
        wordForm: c.words[target].form,
      }))
    );
    countCards(set.id, words.length);
    done('languages');
    return course;
  }

  const demo = TEACHER_DEMO_SETS[opts.subject] ?? TEACHER_DEMO_SETS.other;
  const set = await useSetsStore.getState().addSet({
    title: demo.title,
    languageFrom: 'ru',
    languageTo: 'ru',
    kind: 'subject',
    courseId: course.id,
  });
  useCardsStore
    .getState()
    .addCards(demo.cards.map((c) => ({ setId: set.id, frontText: c.front, backText: c.back })));
  countCards(set.id, demo.cards.length);
  done(opts.subject);
  return course;
}

/** Счётчики набора в списке — как после импорта (PreviewImport) */
function countCards(setId: string, n: number) {
  useSetsStore.getState().updateSetStats(setId, {
    cardCount: n,
    newCount: n,
    learningCount: 0,
    reviewCount: 0,
    masteredCount: 0,
  });
}

function done(subject: string) {
  markTeacherTask('course');
  Analytics.teacherStarterCourseCreated(subject);
}
