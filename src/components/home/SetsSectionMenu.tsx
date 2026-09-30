/**
 * SetsSectionMenu — меню «···» секции «Мои наборы» (plan/home_redesign.md, шаг 4.1)
 * @description Третий уровень главной: редкие действия с наборами живут у самих наборов, а не в шапке.
 */
import React from 'react';
import { ArrowUpDown, GraduationCap, Plus, Search, Users } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { ListRow, Sheet } from '@/components/ui';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Текущая сортировка — короткое название («Недавние», «Прогресс») */
  sortLabel: string;
  onSort: () => void;
  onSearch: () => void;
  /** «Учить все карточки» — null, если карточек нет */
  onStudyAll: (() => void) | null;
  onCreateSet: () => void;
  /** «Подключиться к курсу» — null для учителя */
  onJoinCourse: (() => void) | null;
}

export function SetsSectionMenu({ visible, onClose, sortLabel, onSort, onSearch, onStudyAll, onCreateSet, onJoinCourse }: Props) {
  const colors = useThemeColors();
  const icon = colors.textPrimary;

  return (
    <Sheet visible={visible} onClose={onClose} title="Наборы">
      <ListRow icon={ArrowUpDown} iconColor={icon} title="Сортировка" value={sortLabel} onPress={onSort} />
      <ListRow icon={Search} iconColor={icon} title="Поиск по наборам" chevron={false} onPress={onSearch} />
      {onStudyAll ? (
        <ListRow
          icon={GraduationCap}
          iconColor={icon}
          title="Учить все карточки"
          subtitle="Любой режим по всем наборам"
          onPress={onStudyAll}
        />
      ) : null}
      <ListRow icon={Plus} iconColor={icon} title="Новый набор" onPress={onCreateSet} />
      {onJoinCourse ? (
        <ListRow icon={Users} iconColor={icon} title="Подключиться к курсу" subtitle="По коду от учителя" onPress={onJoinCourse} />
      ) : null}
    </Sheet>
  );
}
