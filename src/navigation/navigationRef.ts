/**
 * Ссылка на навигацию для кода вне экранов (окно превью набора по ссылке живёт в App.tsx,
 * над навигатором). Пока навигатор не смонтирован (экран входа), isReady() === false.
 */
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '@/types/navigation';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
