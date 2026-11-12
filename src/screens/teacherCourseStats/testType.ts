/**
 * «Выбери тип теста» (plan/new/teacher_cabinet.md, Teacher 11): тип и тексты — общие для RN-шторки
 * (TestLobbySheet.tsx) и Swift-листа (TestTypeSheet.swift через nativeTestTypeSheet.ts).
 */
export type TestKind = 'exam' | 'oral';

export const TEST_TYPE_TEXTS = {
  title: 'Выбери тип теста',
  close: 'Закрыть',
  examTitle: 'Экзамен',
  examDescription: 'Письменный тест с вопросами',
  oralTitle: 'Устный тренажёр',
  oralDescription: 'Тренировка произношения — результат не сохраняется',
} as const;
