/**
 * Окна курса (plan/new/web_cabinet.md, Web 10): создать, переименовать, пригласить, удалить.
 * Рискованное — удаление курса и обновление кода — только через окно подтверждения.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Copy, Pencil, Trash2, RefreshCw } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Switch } from '@/components/ui/Controls';
import { Dialog } from '@/components/ui/Sheet';
import { toast } from '@/components/ui/Toast';
import { Skeleton } from '@/components/ui/Skeleton';
import { describeApiError } from '../api';
import { TeacherData, type CourseInvite, type WebCourse } from '../data/teacher';
import { inviteLink } from '../teacherLogic';
import { ConfirmDialog, TypeToConfirmDialog } from '../ui/dialogs';
import { QrCode } from '../ui/QrCode';

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error('Не получилось скопировать. Выдели текст и скопируй вручную');
  }
}

const MAX_TITLE = 60;

/** Окно с одним полем «Название курса» — для создания и переименования */
function TitleDialog({
  visible,
  title,
  confirmText,
  initial,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  confirmText: string;
  initial: string;
  onSubmit: (title: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setValue(initial);
      setError(null);
      setBusy(false);
    }
  }, [visible, initial]);

  const submit = async () => {
    const name = value.trim();
    if (!name) {
      setError('Введи название курса');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name);
    } catch (e) {
      setError(describeApiError(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      visible={visible}
      onClose={busy ? () => {} : onClose}
      title={title}
      footer={
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.s }}>
          <Button
            variant="quiet"
            tone="secondary"
            title="Отмена"
            onPress={onClose}
            disabled={busy}
          />
          <Button title={confirmText} onPress={submit} loading={busy} />
        </View>
      }
    >
      <View style={{ paddingHorizontal: spacing.m }}>
        <TextField
          label="Название курса"
          placeholder="Например: A2 · вечерняя группа"
          value={value}
          onChangeText={setValue}
          maxLength={MAX_TITLE}
          autoFocus
          onSubmitEditing={submit}
          error={error}
        />
      </View>
    </Dialog>
  );
}

export function NewCourseDialog({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (course: WebCourse) => void;
}) {
  return (
    <TitleDialog
      visible={visible}
      title="Новый курс"
      confirmText="Создать курс"
      initial=""
      onClose={onClose}
      onSubmit={async (name) => onCreated(await TeacherData.createCourse(name))}
    />
  );
}

export function RenameCourseDialog({
  visible,
  course,
  onClose,
  onRenamed,
}: {
  visible: boolean;
  course: WebCourse;
  onClose: () => void;
  onRenamed: (title: string) => void;
}) {
  return (
    <TitleDialog
      visible={visible}
      title="Переименовать курс"
      confirmText="Сохранить"
      initial={course.title}
      onClose={onClose}
      onSubmit={async (name) => {
        await TeacherData.renameCourse(course.id, name);
        onRenamed(name);
      }}
    />
  );
}

export function DeleteCourseDialog({
  visible,
  course,
  studentsCount,
  onClose,
  onDeleted,
}: {
  visible: boolean;
  course: WebCourse;
  studentsCount: number | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [withSets, setWithSets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setWithSets(false);
      setBusy(false);
      setError(null);
    }
  }, [visible]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await TeacherData.deleteCourse(course.id, withSets);
      onDeleted();
    } catch (e) {
      setError(describeApiError(e));
      setBusy(false);
    }
  };

  const who =
    studentsCount && studentsCount > 0
      ? `${studentsCount} ${studentsCount === 1 ? 'ученик потеряет' : 'учеников потеряют'} доступ к курсу. `
      : '';

  return (
    <TypeToConfirmDialog
      visible={visible}
      title="Удалить курс?"
      message={`${who}Курс исчезнет у всех, вернуть его нельзя.`}
      expected={course.title}
      confirmText="Удалить курс"
      busy={busy}
      error={error}
      onConfirm={run}
      onClose={onClose}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s }}>
        <Switch
          value={withSets}
          onValueChange={setWithSets}
          accessibilityLabel="Удалить вместе с наборами курса"
        />
        <Text variant="bodySmall" style={{ flex: 1 }}>
          Удалить вместе с наборами и словами курса. Без галочки наборы останутся в «Моих наборах».
        </Text>
      </View>
    </TypeToConfirmDialog>
  );
}

export function InviteDialog({
  visible,
  course,
  onClose,
}: {
  visible: boolean;
  course: WebCourse;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const [invite, setInvite] = useState<CourseInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askRegen, setAskRegen] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setInvite(null);
    setError(null);
    TeacherData.invite(course.id)
      .then((r) => alive && setInvite(r))
      .catch((e) => alive && setError(describeApiError(e)));
    return () => {
      alive = false;
    };
  }, [visible, course.id]);

  const regenerate = async () => {
    setRegenBusy(true);
    try {
      setInvite(await TeacherData.regenerateInvite(course.id));
      setAskRegen(false);
      toast.success('Код обновлён. Старые ссылка и код больше не работают');
    } catch (e) {
      toast.error(describeApiError(e));
    }
    setRegenBusy(false);
  };

  const link = invite ? inviteLink(invite.token) : '';

  return (
    <>
      <Dialog
        visible={visible && !askRegen}
        onClose={onClose}
        title="Пригласить учеников"
        footer={
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Button
              variant="quiet"
              tone="secondary"
              title="Обновить код"
              icon={RefreshCw}
              onPress={() => setAskRegen(true)}
              disabled={!invite}
            />
            <Button variant="quiet" title="Готово" onPress={onClose} />
          </View>
        }
      >
        <View style={{ paddingHorizontal: spacing.m, gap: spacing.m, alignItems: 'center' }}>
          <Text variant="body" color="secondary" align="center">
            Ученик вводит код в приложении Flashly или сканирует QR-код.
          </Text>
          {error ? (
            <Text variant="bodySmall" color="error" accessibilityRole="alert">
              {error}
            </Text>
          ) : !invite ? (
            <Skeleton width={240} height={120} />
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Код ${invite.joinCode}. Нажми, чтобы скопировать`}
                onPress={() => copy(invite.joinCode, 'Код скопирован')}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: borderRadius.l,
                  paddingVertical: spacing.m,
                  paddingHorizontal: spacing.l,
                }}
              >
                <Text variant="display" align="center" selectable>
                  {invite.joinCode}
                </Text>
              </Pressable>
              <View
                style={{
                  backgroundColor: '#FFFFFF', // brand:data
                  borderRadius: borderRadius.m,
                  overflow: 'hidden',
                }}
              >
                <QrCode value={link} />
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: spacing.s,
                }}
              >
                <Button
                  variant="secondary"
                  size="s"
                  icon={Copy}
                  title="Копировать код"
                  onPress={() => copy(invite.joinCode, 'Код скопирован')}
                />
                <Button
                  variant="secondary"
                  size="s"
                  icon={Copy}
                  title="Копировать ссылку"
                  onPress={() => copy(link, 'Ссылка скопирована')}
                />
              </View>
            </>
          )}
        </View>
      </Dialog>
      <ConfirmDialog
        visible={visible && askRegen}
        title="Обновить код подключения?"
        message="Старые ссылка и код перестанут работать — ученики, у которых они есть, больше не смогут по ним присоединиться."
        confirmText="Обновить"
        destructive
        busy={regenBusy}
        onConfirm={regenerate}
        onClose={() => setAskRegen(false)}
      />
    </>
  );
}

/** Меню «Ещё» на странице курса: переименовать и удалить */
export function CourseMenuDialog({
  visible,
  onClose,
  onRename,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <Dialog visible={visible} onClose={onClose} title="Курс">
      <View style={{ paddingHorizontal: spacing.m, paddingBottom: spacing.m, gap: spacing.xs }}>
        <Button
          variant="quiet"
          tone="secondary"
          icon={Pencil}
          title="Переименовать"
          onPress={onRename}
        />
        <Button variant="danger" icon={Trash2} title="Удалить курс" onPress={onDelete} />
      </View>
    </Dialog>
  );
}
