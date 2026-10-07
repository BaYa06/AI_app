/**
 * aiConsent
 * @description Согласие на передачу данных в ИИ (Google Gemini) — App Review 5.1.2(i):
 * перед отправкой данных стороннему ИИ нужно прямо сказать, что и кому уйдёт, и получить разрешение.
 *
 * - Действие пользователя (импорт фото/PDF/файлов, перевод, примеры) — сначала ensureAiConsent():
 *   без согласия показывает окно, «Не сейчас» отменяет действие и спросит снова в следующий раз.
 * - Фоновые запросы (варианты ответа в тренировках) — только hasAiConsent(), окно не показывают.
 * - Отозвать — Профиль → «Данные для ИИ».
 */
import { Alert, Linking, Platform } from 'react-native';
import { StorageService } from './StorageService';
import { PRIVACY_POLICY_URL } from '@/config/legal';

const AI_CONSENT_KEY = 'ai_consent_granted';

const TITLE = 'Отправить данные в ИИ?';
const MESSAGE =
  'Чтобы создать карточки, перевод или примеры, Flashly отправит выбранные фото, PDF, файлы ' +
  'или слова в Google Gemini (Google Cloud). Google обрабатывает их только для ответа ' +
  'и не использует для обучения моделей. Отозвать разрешение можно в профиле.';

export function hasAiConsent(): boolean {
  return StorageService.getBoolean(AI_CONSENT_KEY) === true;
}

export function setAiConsent(granted: boolean): void {
  if (granted) StorageService.setBoolean(AI_CONSENT_KEY, true);
  else StorageService.delete(AI_CONSENT_KEY);
}

/** true — можно отправлять; иначе показывает окно согласия и ждёт ответа */
export function ensureAiConsent(): Promise<boolean> {
  if (hasAiConsent()) return Promise.resolve(true);

  if (Platform.OS === 'web') {
    const granted = window.confirm(`${TITLE}\n\n${MESSAGE}\n\nПолитика конфиденциальности: ${PRIVACY_POLICY_URL}`);
    if (granted) setAiConsent(true);
    return Promise.resolve(granted);
  }

  return new Promise((resolve) => {
    Alert.alert(
      TITLE,
      MESSAGE,
      [
        {
          text: 'Политика конфиденциальности',
          onPress: () => {
            Linking.openURL(PRIVACY_POLICY_URL);
            resolve(false);
          },
        },
        { text: 'Не сейчас', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Разрешить',
          onPress: () => {
            setAiConsent(true);
            resolve(true);
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
