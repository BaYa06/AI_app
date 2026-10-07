/**
 * Типы для навигации
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { StudyMode } from './index';

// ==================== УРОК ДНЯ ====================

/** Часть урока дня: повторение (тест) → новые слова (карточки) → проверка новых (тест); ошибки — отдельно */
export type LessonPart = 'review' | 'new' | 'check' | 'mistakes';

/** Экран тренировки открыт из урока дня (plan/home_redesign.md, шаг 1.3) */
export interface LessonRouteParams {
  part: LessonPart;
  /** Новые слова урока — для следующих частей */
  newIds: string[];
  /** Когда урок начат (мс) и сколько в нём слов на повторение — для аналитики lesson_completed (6.1) */
  startedAt?: number;
  reviewCount?: number;
}

// ==================== ROOT STACK ====================

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList>;
  SetDetail: { setId: string };
  Study: {
    setId: string;
    mode: StudyMode;
    errorCardsFronts?: string[];
    studyAll?: boolean;
    cardLimit?: number;
    onlyHard?: boolean;
    dueCardIds?: string[];
    // Параметры фазы
    phaseId?: string;
    totalPhaseCards?: number;
    studiedInPhase?: number;
    phaseOffset?: number;
    phaseFailedIds?: string[];
    lesson?: LessonRouteParams;
  };
  StudyResults: {
    setId: string;
    totalCards: number;
    learnedCards: number;
    timeSpent: number;
    errors: number;
    errorCards: Array<{ id?: string; front: string; back: string; rating: number }>;
    modeTitle?: string;
    cardLimit?: number;
    dueCardIds?: string[];
    nextMode?: 'study' | 'match' | 'multipleChoice' | 'audio' | 'wordBuilder';
    // Параметры фазы
    phaseId?: string;
    totalPhaseCards?: number;
    studiedInPhase?: number;
    phaseOffset?: number;
    phaseFailedIds?: string[];
    onlyHard?: boolean;
    // Streak celebration
    streakIncreased?: boolean;
    newStreakCount?: number;
    lesson?: LessonRouteParams;
  };
  CardEditor: { setId: string; cardId?: string };
  SetEditor: { setId?: string; autoFocusTitle?: boolean };
  Match: {
    setId: string;
    cardLimit?: number;
    dueCardIds?: string[];
    // Параметры фазы
    phaseId?: string;
    totalPhaseCards?: number;
    studiedInPhase?: number;
    phaseOffset?: number;
    phaseFailedIds?: string[];
  };
  MultipleChoice: {
    setId: string;
    cardLimit?: number;
    questionIndex?: number;
    totalQuestions?: number;
    dueCardIds?: string[];
    // Параметры фазы
    phaseId?: string;
    totalPhaseCards?: number;
    studiedInPhase?: number;
    phaseOffset?: number;
    phaseFailedIds?: string[];
    // Challenge mode
    challengeMode?: boolean;
    timeLimit?: number;
    sniperMode?: boolean;
    forgottenMode?: boolean;
    lesson?: LessonRouteParams;
  };
  WordBuilder: {
    setId: string;
    cardLimit?: number;
    dueCardIds?: string[];
    // Параметры фазы
    phaseId?: string;
    totalPhaseCards?: number;
    studiedInPhase?: number;
    phaseOffset?: number;
    phaseFailedIds?: string[];
  };
  AudioLearning: {
    setId: string;
    cardLimit?: number;
    dueCardIds?: string[];
    // Параметры фазы
    phaseId?: string;
    totalPhaseCards?: number;
    studiedInPhase?: number;
    phaseOffset?: number;
    phaseFailedIds?: string[];
  };
  LibrarySetDetail: { setId: string };
  BookDetail: { bookId: string };
  CourseBooks: { courseId: string; courseTitle: string };
  MyPublications: undefined;
  PersonalInfo: undefined;
  Security: undefined;
  Subscription: undefined;
  Achievements: undefined;
  NotificationSettings: undefined;
  LearningSettings: undefined;
  SoundSettings: undefined;
  Feedback: undefined;
  Settings: undefined;
  Search: undefined;
  TeacherCourseStats: { courseId: string; courseTitle: string };
  TeacherStudents: { courseId: string; courseTitle: string };
  StudentDetail: {
    courseId: string;
    courseTitle: string;
    studentId: string;
    studentName: string;
    studentInitials: string;
    streak: number;
    todayCards: number;
    lastActivity: string;
  };
  ExamLobby: { courseId: string; courseTitle: string };
  TestHistory: { courseId: string; courseTitle: string };
  /** Рейтинг курса за неделю (week: 'previous' — сразу итоги прошлой недели) */
  CourseLeaderboard: { courseId: string; courseTitle?: string; week?: 'current' | 'previous' };
  OralTestLobby: { courseId: string; courseTitle: string };
  OralTestSession: {
    courseId: string;
    courseTitle: string;
    setId: string;
    setTitle: string;
    cardIds: string[];
  };
  OralTestResults: {
    courseId: string;
    courseTitle: string;
    setTitle: string;
    total: number;
    known: number;
    unknown: number;
  };
  TestLobby: {
    courseId: string;
    courseTitle: string;
    sessionId: string;
    code: string;
    testMode: string;
    questionCount: number;
    timePerQuestion: number;
  };
  LiveTest: {
    courseId: string;
    courseTitle: string;
    sessionId: string;
  };
  TestResultsTeacher: {
    courseId: string;
    courseTitle: string;
    sessionId: string;
  };
  TestJoin: undefined;
  TestWaiting: {
    sessionId: string;
    participantId: string;
    setTitle: string;
    teacherName: string;
    testMode: string;
    questionCount: number;
    timePerQuestion: number;
  };
  TestExam: {
    sessionId: string;
    participantId: string;
    testMode: string;
    questionCount: number;
    timePerQuestion: number;
    // С какого вопроса начинать — используется при переподключении к уже идущему тесту
    // (см. TestJoinScreen.tsx, alreadyJoined). По умолчанию 0.
    initialQuestionIndex?: number;
  };
  TestDone: {
    correct: number;
    total: number;
    answers?: Array<{
      word: string;
      yourAnswer: string;
      correctAnswer: string;
      isCorrect: boolean;
    }>;
  };
  ContextFill: {
    setId: string;
    cardLimit?: number;
  };
  ImportFiles: { setId: string };
  PreviewImport: {
    cards: Array<{ front: string; back: string }>;
    suggestedTitle?: string;
    setId: string;
  };
};

// ==================== MAIN TABS ====================

export type MainTabParamList = {
  /** from: 'widget' — открыто ссылкой виджета, главная запускает урок дня (plan/widgets.md, 0.3) */
  Home: { from?: string; state?: string; family?: string } | undefined;
  Library: undefined;
  TestTab: undefined;
  Statistics: undefined;
  Study: undefined;
  Profile: undefined;
};

// ==================== SCREEN PROPS ====================

// Root Stack
export type RootStackScreenProps<T extends keyof RootStackParamList> = 
  NativeStackScreenProps<RootStackParamList, T>;

// Main Tabs
export type MainTabScreenProps<T extends keyof MainTabParamList> = 
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, T>,
    NativeStackScreenProps<RootStackParamList>
  >;

// ==================== TYPE HELPERS ====================

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
