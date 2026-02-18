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
    nextMode?: 'study' | 'match' | 'multipleChoice';
    // Параметры фазы
    phaseId?: string;
    totalPhaseCards?: number;
    studiedInPhase?: number;
    phaseOffset?: number;
    phaseFailedIds?: string[];
  };
  CardEditor: { setId: string; cardId?: string };
  SetEditor: { setId?: string; autoFocusTitle?: boolean };
  Match: { 
    setId: string; 
    cardLimit?: number;
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
    // Параметры фазы
    phaseId?: string;
    totalPhaseCards?: number;
    studiedInPhase?: number;
    phaseOffset?: number;
    phaseFailedIds?: string[];
  };
  WordBuilder: {
    setId: string;
    cardLimit?: number;
    // Параметры фазы (на будущее)
    phaseId?: string;
    totalPhaseCards?: number;
    studiedInPhase?: number;
    phaseOffset?: number;
    phaseFailedIds?: string[];
  };
  AudioLearning: {
    setId: string;
    cardLimit?: number;
    // Параметры фазы
    phaseId?: string;
    totalPhaseCards?: number;
    studiedInPhase?: number;
    phaseOffset?: number;
    phaseFailedIds?: string[];
  };
  SharedSetDetail: { setId: string };
  PersonalInfo: undefined;
  Security: undefined;
  Subscription: undefined;
  Achievements: undefined;
  NotificationSettings: undefined;
  Settings: undefined;
  Search: undefined;
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
