/**
 * Меню набора: перенести в курс, скрыть от учеников
 * (Clean 8a — вынесено из HomeScreen без изменений разметки.)
 */
import React from 'react';
import { useThemeColors } from '@/store';
import { iconSize } from '@/constants';
import { ListRow, Sheet } from '@/components/ui';
import { Library, Eye, EyeOff, Folder, Edit2, Check, FolderInput } from 'lucide-react-native';
import type { CardSet, Course } from '@/types';
import { styles } from '../styles';

type Props = {
  setMenuTarget: CardSet | null;
  setSetMenuTarget: React.Dispatch<React.SetStateAction<CardSet | null>>;
  setMenuMoving: boolean;
  setSetMenuMoving: React.Dispatch<React.SetStateAction<boolean>>;
  closeSetMenu: () => void;
  colors: ReturnType<typeof useThemeColors>;
  handleMoveSet: (set: CardSet, courseId: string | null) => void;
  handleToggleSetHidden: (set: CardSet) => void;
  isTeacher: boolean | null;
  moveTargetCourses: Course[];
  navigation: any;
};

export function SetActionSheet({
  setMenuTarget,
  setSetMenuTarget,
  setMenuMoving,
  setSetMenuMoving,
  closeSetMenu,
  colors,
  handleMoveSet,
  handleToggleSetHidden,
  isTeacher,
  moveTargetCourses,
  navigation,
}: Props) {
  return (
    <Sheet visible={!!setMenuTarget} onClose={closeSetMenu}>
      {setMenuMoving && setMenuTarget ? (
        <>
          {[{ id: null as string | null, title: 'Мои наборы' }, ...moveTargetCourses].map((c) => {
            const current = (setMenuTarget.courseId ?? null) === c.id;
            return (
              <ListRow
                key={c.id ?? 'my-sets'}
                icon={c.id ? Folder : Library}
                iconColor={current ? colors.primary : colors.textPrimary}
                title={c.title}
                right={current ? <Check size={iconSize.s} color={colors.primary} /> : undefined}
                chevron={false}
                onPress={() => handleMoveSet(setMenuTarget, c.id)}
                style={styles.sheetRow}
              />
            );
          })}
        </>
      ) : (
        <>
          <ListRow
            icon={Edit2}
            iconColor={colors.textPrimary}
            title="Редактировать"
            chevron={false}
            onPress={() => {
              if (setMenuTarget) {
                navigation?.navigate('SetEditor', {
                  setId: setMenuTarget.id,
                  autoFocusTitle: true,
                });
                setSetMenuTarget(null);
              }
            }}
            style={styles.sheetRow}
          />
          {setMenuTarget?.courseId && isTeacher && (
            <ListRow
              icon={setMenuTarget.isHiddenFromStudents ? Eye : EyeOff}
              iconColor={setMenuTarget.isHiddenFromStudents ? colors.primary : colors.textSecondary}
              title={
                setMenuTarget.isHiddenFromStudents ? 'Показать ученикам' : 'Скрыть от учеников'
              }
              chevron={false}
              onPress={() => setMenuTarget && handleToggleSetHidden(setMenuTarget)}
              style={styles.sheetRow}
            />
          )}
          {setMenuTarget && !setMenuTarget.isReadOnly && !setMenuTarget.isOfficial && (
            <ListRow
              icon={FolderInput}
              iconColor={colors.textPrimary}
              title="Переместить в курс…"
              chevron={false}
              onPress={() => setSetMenuMoving(true)}
              style={styles.sheetRow}
            />
          )}
        </>
      )}
    </Sheet>
  );
}
