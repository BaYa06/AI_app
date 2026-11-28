/**
 * Согласие на передачу слов в ИИ (App Review 5.1.2(i) — то же правило, что в приложении):
 * спрашиваем один раз перед первой сборкой экзамена с «вставь слово», которые пишет ИИ.
 */
import React from 'react';
import { View } from 'react-native';
import { spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Sheet';
import { PRIVACY_POLICY_URL } from '@/config/legal';

export function AiConsentDialog({
  visible,
  onAllow,
  onDecline,
}: {
  visible: boolean;
  onAllow: () => void;
  /** Без ИИ: «вставь слово» только для слов с примерами в карточках */
  onDecline: () => void;
}) {
  return (
    <Dialog
      visible={visible}
      onClose={onDecline}
      title="Отправить слова в ИИ?"
      footer={
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.s }}>
          <Button variant="quiet" tone="secondary" title="Без ИИ" onPress={onDecline} />
          <Button title="Разрешить" onPress={onAllow} />
        </View>
      }
    >
      <View style={{ gap: spacing.s }}>
        <Text variant="body" color="secondary">
          Предложения для «вставь слово» пишет ИИ. Для этого Flashly отправит слова экзамена и их
          переводы в Google Gemini (если он перегружен — в запасной сервис Groq). Google может
          использовать эти данные для улучшения своих моделей.
        </Text>
        <Text variant="bodySmall" color="secondary">
          Имена и результаты учеников не отправляются. Без ИИ «вставь слово» будет только у слов,
          где в карточке есть пример. Политика конфиденциальности: {PRIVACY_POLICY_URL}
        </Text>
      </View>
    </Dialog>
  );
}
