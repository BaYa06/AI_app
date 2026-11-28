/**
 * «Умные варианты (ИИ)» (plan/new/web_cabinet.md, Web 17): переключатель, согласие на передачу
 * данных, ожидание, предложения «было → стало». ИИ только предлагает: каждое предложение
 * принимается кнопкой, сомнительное — через окно подтверждения.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertTriangle, Sparkles } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Controls';
import { Switch } from '@/components/ui/Controls';
import { Dialog } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { PRIVACY_POLICY_URL } from '@/config/legal';
import type { SmartResult, SmartSuggestion } from './smartLogic';

export type SmartState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; result: SmartResult };

export function SmartSwitch({
  state,
  onToggle,
}: {
  state: SmartState;
  onToggle: (on: boolean) => void;
}) {
  const colors = useThemeColors();
  const on = state.status !== 'off';
  return (
    <Card>
      <View style={styles.head}>
        <Sparkles size={24} color={colors.primary} />
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text variant="label">Умные варианты (ИИ)</Text>
          <Text variant="caption" color="secondary">
            ИИ предложит новые предложения для «вставь слово» и варианты по смыслу для «выбора». Ты
            смотришь и принимаешь каждое предложение сам, баллы считает кабинет.
          </Text>
        </View>
        <Switch
          value={on}
          onValueChange={onToggle}
          disabled={state.status === 'loading'}
          accessibilityLabel="Умные варианты (ИИ)"
        />
      </View>
      {state.status === 'loading' ? (
        <View style={{ gap: spacing.xs, marginTop: spacing.m }} accessibilityLiveRegion="polite">
          <Text variant="bodySmall" color="secondary">
            Готовим варианты… обычно 15–30 секунд. Можно пока проверять остальные вопросы.
          </Text>
          <Skeleton width="100%" height={12} />
          <Skeleton width="70%" height={12} />
        </View>
      ) : null}
      {state.status === 'error' ? (
        <Text
          variant="bodySmall"
          color="error"
          accessibilityRole="alert"
          style={{ marginTop: spacing.m }}
        >
          {state.message}
        </Text>
      ) : null}
      {state.status === 'done' ? (
        <Text
          variant="bodySmall"
          color="secondary"
          style={{ marginTop: spacing.m }}
          accessibilityLiveRegion="polite"
        >
          {state.result.suggestions.length > 0
            ? `Предложений: ${state.result.suggestions.length}. Они показаны под вопросами.`
            : 'ИИ не предложил ничего подходящего. Вопросы остались как были.'}
          {state.result.usage
            ? ` Запусков в этот час: ${state.result.usage.used} из ${state.result.usage.limit}.`
            : ''}
        </Text>
      ) : null}
    </Card>
  );
}

/** Предложение ИИ под вопросом: было / стало, пометки, «Применить» и «Отклонить» */
export function SuggestionCard({
  s,
  busy,
  onApply,
  onDismiss,
}: {
  s: SmartSuggestion;
  busy: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        styles.suggestion,
        { backgroundColor: alpha(colors.primary, 10), borderColor: alpha(colors.primary, 40) },
      ]}
    >
      <View style={styles.suggestionHead}>
        <Badge label="Предложение ИИ" tone="primary" />
        {s.doubtful ? <Badge label="Проверь" tone="warning" icon={AlertTriangle} /> : null}
      </View>
      {s.kind === 'gap' ? (
        <>
          <Diff label="Было" text={s.before.prompt} />
          <Diff label="Стало" text={s.after.prompt} strong />
        </>
      ) : null}
      <Diff label="Неверные было" text={s.before.options.join(' · ')} />
      <Diff label="Неверные стало" text={s.after.options.join(' · ')} strong />
      {s.reasons.map((r) => (
        <Text key={r.code + r.text} variant="caption" style={{ color: colors.warningText }}>
          {r.text}
        </Text>
      ))}
      <View style={styles.actions}>
        <Button
          variant="quiet"
          tone="secondary"
          size="s"
          title="Отклонить"
          onPress={onDismiss}
          disabled={busy}
        />
        <Button
          size="s"
          title={s.doubtful ? 'Проверить и применить' : 'Применить'}
          onPress={onApply}
          loading={busy}
        />
      </View>
    </View>
  );
}

function Diff({ label, text, strong }: { label: string; text: string; strong?: boolean }) {
  return (
    <View style={styles.diff}>
      <Text variant="caption" color="secondary" style={{ width: 112 }}>
        {label}
      </Text>
      <Text variant="bodySmall" style={{ flex: 1, fontWeight: strong ? '600' : '400' }}>
        {text}
      </Text>
    </View>
  );
}

/** Согласие на передачу слов в ИИ — до первого запуска (App Review 5.1.2(i)) */
export function SmartConsentDialog({
  visible,
  onAllow,
  onClose,
}: {
  visible: boolean;
  onAllow: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title="Отправить слова в ИИ?"
      footer={
        <View style={styles.actions}>
          <Button variant="quiet" tone="secondary" title="Не сейчас" onPress={onClose} />
          <Button title="Разрешить" onPress={onAllow} />
        </View>
      }
    >
      <View style={{ gap: spacing.s }}>
        <Text variant="body" color="secondary">
          Чтобы подготовить варианты, Flashly отправит слова, переводы и предложения этого экзамена
          в Google Gemini (если он перегружен — в запасной сервис Groq). Google может использовать
          эти данные для улучшения своих моделей — не добавляй в экзамен личные данные.
        </Text>
        <Text variant="bodySmall" color="secondary">
          Имена и результаты учеников не отправляются. Разрешение можно отозвать в профиле
          приложения. Политика конфиденциальности: {PRIVACY_POLICY_URL}
        </Text>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: spacing.s, alignItems: 'flex-start' },
  suggestion: {
    gap: spacing.xs,
    padding: spacing.m,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    marginBottom: spacing.s,
    marginHorizontal: spacing.m,
  },
  suggestionHead: { flexDirection: 'row', gap: spacing.xs },
  diff: { flexDirection: 'row', gap: spacing.s },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.s },
});
