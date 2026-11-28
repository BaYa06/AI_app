/**
 * Правка вопроса (plan/new/web_cabinet.md, Web 15; макет E4): неверные варианты у «выбора» и
 * «вставь слово», предложение у «вставь слово». Справа налево не читаем: слева поля, ниже —
 * «Как увидит ученик». Правильный ответ и баллы не меняются; правка живёт только в этом экзамене.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import type { DraftItem, ExamDraft } from '@/services/exam';
import { describeApiError, WebApiError } from '../api';
import { ExamData } from '../data/exam';
import { describeEditError } from './smartLogic';
import { itemTitle, splitGap } from './itemView';

export function ItemEditDialog({
  sessionId,
  item,
  onClose,
  onSaved,
}: {
  sessionId: string;
  item: DraftItem | null;
  onClose: () => void;
  onSaved: (draft: ExamDraft) => void;
}) {
  const colors = useThemeColors();
  const [sentence, setSentence] = useState('');
  const [wrong, setWrong] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setSentence(item.format === 'gap' ? item.prompt : '');
      setWrong((item.options ?? []).slice(1));
      setError(null);
      setBusy(false);
    }
  }, [item]);

  if (!item) return null;
  const isGap = item.format === 'gap';

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const draft = await ExamData.editItem(sessionId, item.itemId, {
        distractors: wrong,
        ...(isGap ? { sentence } : {}),
      });
      onSaved(draft);
    } catch (e) {
      if (e instanceof WebApiError && e.status === 400) {
        const index = typeof e.details?.index === 'number' ? e.details.index : undefined;
        setError(describeEditError(e.serverError, index));
      } else {
        setError(describeApiError(e));
      }
      setBusy(false);
    }
  };

  const parts = isGap ? splitGap(sentence) : null;
  const shownOptions = [item.answer, ...wrong.map((w) => w.trim()).filter(Boolean)];

  return (
    <Dialog
      visible
      onClose={busy ? () => {} : onClose}
      title={isGap ? 'Правка: вставь слово' : 'Правка: выбор ответа'}
      style={{ maxWidth: 560 }}
      footer={
        <View style={styles.footer}>
          <Button
            variant="quiet"
            tone="secondary"
            title="Отмена"
            onPress={onClose}
            disabled={busy}
          />
          <Button title="Сохранить" onPress={save} loading={busy} />
        </View>
      }
    >
      <View style={{ gap: spacing.m }}>
        <Text variant="bodySmall" color="secondary">
          Слово: <Text variant="label">{itemTitle(item)}</Text>. Правильный ответ —{' '}
          <Text variant="label">{item.answer}</Text>. Его и баллы поменять нельзя.
        </Text>

        {isGap ? (
          <TextField
            label="Предложение"
            hint="Одно слово заменено на _____. Само слово в предложении не пиши — это подсказка."
            value={sentence}
            onChangeText={setSentence}
            multiline
            maxLength={240}
          />
        ) : null}

        {wrong.map((w, i) => (
          <TextField
            key={i}
            label={`Неверный вариант ${i + 1}`}
            value={w}
            maxLength={80}
            onChangeText={(t) => setWrong((cur) => cur.map((x, j) => (j === i ? t : x)))}
          />
        ))}

        <View style={[styles.preview, { backgroundColor: colors.surfaceMuted }]}>
          <Text variant="overline" color="secondary" accessibilityRole="header">
            КАК УВИДИТ УЧЕНИК
          </Text>
          <Text variant="bodyLarge" style={{ color: colors.textPrimary }}>
            {isGap && parts ? (
              <>
                {parts[0]}
                <Text
                  variant="bodyLarge"
                  style={{ color: colors.primary, backgroundColor: alpha(colors.primary, 10) }}
                >
                  {'      '}
                </Text>
                {parts[1]}
              </>
            ) : (
              item.prompt
            )}
          </Text>
          <View style={styles.optionGrid}>
            {shownOptions.map((o, i) => (
              <View
                key={`${o}-${i}`}
                style={[
                  styles.option,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              >
                <Text variant="body" numberOfLines={1}>
                  {o}
                </Text>
              </View>
            ))}
          </View>
          <Text variant="caption" color="secondary">
            Порядок вариантов у каждого ученика свой.
          </Text>
        </View>

        {error ? (
          <Text variant="bodySmall" color="error" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.s },
  preview: { gap: spacing.s, padding: spacing.m, borderRadius: borderRadius.m },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  option: {
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.s,
    minWidth: 120,
  },
});
