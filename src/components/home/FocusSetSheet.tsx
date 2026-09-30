/**
 * FocusSetSheet — «Сменить набор» (plan/home_redesign.md, шаг 2.4)
 * @description Нижний лист со списком наборов, в которых есть новые слова: из выбранного урок дня
 * берёт новые слова. Первая строка — «Выбирать автоматически» (последний изученный набор).
 */
import React from 'react';
import { Check, Sparkles } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { ListRow, Sheet } from '@/components/ui';
import { iconSize } from '@/constants';
import { pluralize } from '@/utils';
import type { NewWordsSet } from '@/services/LessonService';

interface Props {
  visible: boolean;
  onClose: () => void;
  sets: NewWordsSet[];
  /** Текущий набор урока */
  currentSetId: string | null;
  /** Текущий набор выбран вручную */
  manual: boolean;
  /** null — снова выбирать автоматически */
  onSelect: (setId: string | null) => void;
}

export function FocusSetSheet({ visible, onClose, sets, currentSetId, manual, onSelect }: Props) {
  const colors = useThemeColors();
  const check = <Check size={iconSize.s} color={colors.primary} />;

  return (
    <Sheet visible={visible} onClose={onClose} title="Откуда брать новые слова">
      <ListRow
        icon={Sparkles}
        iconColor={colors.primary}
        title="Выбирать автоматически"
        subtitle="Последний изученный набор"
        right={manual ? undefined : check}
        chevron={false}
        onPress={() => onSelect(null)}
      />
      {sets.map((set) => (
        <ListRow
          key={set.setId}
          title={set.title}
          subtitle={`Осталось ${set.newLeft} ${pluralize(set.newLeft, 'новое слово', 'новых слова', 'новых слов')}`}
          right={manual && set.setId === currentSetId ? check : undefined}
          chevron={false}
          onPress={() => onSelect(set.setId)}
        />
      ))}
    </Sheet>
  );
}
