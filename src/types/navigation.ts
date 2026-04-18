/**
 * Типы для навигации
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { StudyMode } from './index';

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
    nextMode?: 'study' | 'match' | 'multipleChoice';
    // Параметры фазы
    phaseId?: string;
    totalPhaseCards?: number;
    studiedInPhase?: number;
    phaseOffset?: number;
    phaseFailedIds?: string[];
    // Streak celebration
    streakIncreased?: boolean;
    newStreakCount?: number;
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
  MyPublications: undefined;
  PersonalInfo: undefined;
  Security: undefined;
  Subscription: undefined;
  Achievements: undefined;
  NotificationSettings: undefined;
  Settings: undefined;
  Search: undefined;
  TeacherCourseStats: { courseId: string; courseTitle: string };
  TeacherStudents: { courseId: string; courseTitle: string };
  ExamLobby: { courseId: string; courseTitle: string };
  TestHistory: { courseId: string; courseTitle: string };
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
  ImportFiles: undefined;
  PreviewImport: {
    cards: Array<{ front: string; back: string }>;
    suggestedTitle?: string;
  };
};

// ==================== MAIN TABS ====================

export type MainTabParamList = {
  Home: undefined;
  Library: undefined;
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
