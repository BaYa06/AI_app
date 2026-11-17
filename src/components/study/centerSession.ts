/**
 * Учить юнит книги учебного центра (plan/new/center_books.md, Center 6): загрузить официальный набор
 * юнита в сторы и запустить обычную сессию «Изучить» (setSession). Слова отдаёт сервер только при
 * доступе к центру (Center 2) — без доступа или сети вернётся 'unavailable'.
 *
 * fromHome: стек собирается заново — «главная → сессия» (сразу после кода центра: экраны выбора
 * книги и юнита из стека уходят, «назад» из итогов ведёт в набор юнита, оттуда — на главную).
 */
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BookService } from '@/services/BookService';
import type { RootStackParamList } from '@/types/navigation';
import { currentSetSessionPlan, firstSetSessionStep } from './setSession';

export type CenterUnitStart = 'session' | 'set' | 'unavailable';

export async function studyCenterUnit(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  setId: string,
  { fromHome = false }: { fromHome?: boolean } = {}
): Promise<CenterUnitStart> {
  const ok = await BookService.openOfficialSet(setId);
  if (!ok) return 'unavailable';
  const info = currentSetSessionPlan(setId);
  const step = info ? firstSetSessionStep(setId, info.plan) : null;
  const home = { name: 'Main' as const, params: { screen: 'Home' as const } };

  if (!step) {
    // Сессии нет (всё выучено и повторять сегодня нечего) — открываем набор юнита
    if (fromHome)
      navigation.reset({ index: 1, routes: [home, { name: 'SetDetail', params: { setId } }] });
    else navigation.navigate('SetDetail', { setId });
    return 'set';
  }
  if (fromHome) {
    navigation.reset({
      index: 1,
      routes: [home, { name: step.screen, params: step.params } as never],
    });
  } else {
    navigation.push(step.screen, step.params);
  }
  return 'session';
}
