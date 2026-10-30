/**
 * SharedSetPreviewModal — набор по ссылке (plan/new/share_set.md, Share 4).
 * Макет: https://claude.ai/artifact/4tsWywJmzW97fbxApmwSNd
 *
 * Окно поверх приложения (как приглашение в курс), поэтому работает и до входа: превью видно
 * без аккаунта, «Войти и добавить» уводит на вход, после входа окно возвращается само.
 * iOS — системный лист (pageSheet), остальные платформы — полноэкранное окно.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ban, BookOpen, Check, CheckCircle2, Flag, Folder, Layers, MoreHorizontal, Plus, Unlink, X } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, ErrorState, ListGroup, ListRow, Sheet, Skeleton, SkeletonText, ToastHost, toast } from '@/components/ui';
import { useCoursesStore, useSettingsStore, useThemeColors } from '@/store';
import { alpha, borderRadius, getLanguageFlag, getLanguageLabel, iconSize, spacing } from '@/constants';
import { Analytics, ShareApiError, ShareService, supabase, type SharePreview, type ShareReportReason } from '@/services';
import { importSharedSet } from '@/services/shareImport';
import { confirmAction } from '@/utils/dialogs';
import { ShareMenuButton, isNativeShareMenu, isNativeReportSheet, presentNativeReportSheet } from './nativeShareActions';
import { describeError } from '@/utils/userErrors';
import { pluralize } from '@/utils';

type LoadError = 'not_found' | 'disabled' | 'blocked' | 'reported' | 'network';

const ERROR_TEXT: Record<Exclude<LoadError, 'network'>, { title: string; description: string }> = {
  not_found: { title: 'Набор не найден', description: 'Возможно, автор удалил набор или в ссылке ошибка.' },
  disabled: { title: 'Ссылка больше не действует', description: 'Автор закрыл доступ к этому набору. Попроси автора прислать новую ссылку.' },
  blocked: { title: 'Автор заблокирован', description: 'Ссылки этого автора у тебя не открываются. Разблокировать можно в профиле.' },
  reported: { title: 'Набор скрыт', description: 'Жалоба на этот набор отправлена — команда его проверит.' },
};

const REPORT_REASONS: { reason: ShareReportReason; title: string }[] = [
  { reason: 'offensive', title: 'Оскорбления' },
  { reason: 'spam', title: 'Спам или реклама' },
  { reason: 'inappropriate', title: 'Неприемлемый контент' },
  { reason: 'copyright', title: 'Нарушает авторские права' },
  { reason: 'other', title: 'Другое' },
];

const cardsLabel = (n: number) => `${n} ${pluralize(n, 'карточка', 'карточки', 'карточек')}`;

function toLoadError(e: unknown): LoadError {
  if (e instanceof ShareApiError) {
    if (e.status === 404) return 'not_found';
    if (e.status === 410) return 'disabled';
    if (e.code === 'blocked' || e.code === 'reported') return e.code;
  }
  return 'network';
}

interface Props {
  code: string;
  /** Вход выполнен и онбординг пройден — можно добавлять. */
  signedIn: boolean;
  /** Человек нажал «Войти и добавить»: после входа добавить сразу, если выбирать некуда. */
  autoAdd: boolean;
  onRequestSignIn: () => void;
  onClose: () => void;
  /** Набор добавлен (или уже был) — App закрывает окно и открывает набор. */
  onOpenSet: (setId: string) => void;
}

export function SharedSetPreviewModal({ code, signedIn, autoAdd, onRequestSignIn, onClose, onOpenSet }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const isTeacher = useSettingsStore((s) => s.isTeacher) === true;
  const dark = useSettingsStore((s) => s.resolvedTheme === 'dark');
  const allCourses = useCoursesStore((s) => s.courses);
  const activeCourseId = useCoursesStore((s) => s.activeCourseId);
  const createCourse = useCoursesStore((s) => s.createCourse);
  // Добавить можно только в свой курс (не в курс, где пользователь ученик)
  const ownCourses = useMemo(() => allCourses.filter((c) => !c.isStudentCourse), [allCourses]);

  const [preview, setPreview] = useState<SharePreview | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [session, setSession] = useState<{ userId: string; isGuest: boolean } | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(
    ownCourses.some((c) => c.id === activeCourseId) ? activeCourseId : null,
  );
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const autoAddDone = useRef(false);

  useEffect(() => {
    Analytics.shareLinkOpened(signedIn);
    // Один раз на код: повторное открытие окна после входа — не новое открытие ссылки
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!cancelled) setSession(user ? { userId: user.id, isGuest: (user as any).is_anonymous === true } : null);
      try {
        const result = await ShareService.preview(code);
        if (!cancelled) setPreview(result);
      } catch (e) {
        if (!cancelled) setLoadError(toLoadError(e));
      }
    })();
    return () => { cancelled = true; };
  }, [code, signedIn, reloadKey]);

  const viewer = preview?.viewer ?? null;
  const isOwner = viewer?.isOwner === true;
  const existingCopy = useMemo(() => {
    if (!viewer) return null;
    return viewer.imports.find((i) => (i.courseId ?? null) === selectedCourseId)?.setId ?? null;
  }, [viewer, selectedCourseId]);
  const selectedCourse = ownCourses.find((c) => c.id === selectedCourseId) ?? null;

  const handleAdd = useCallback(async () => {
    if (!preview || !session || adding) return;
    setAdding(true);
    try {
      // Курс, которого ещё нет на сервере (создан только что), — через «Мои наборы» и переезд
      const onServer = !selectedCourseId || !!viewer?.courses.some((c) => c.id === selectedCourseId);
      const result = await importSharedSet({
        preview,
        userId: session.userId,
        isGuest: session.isGuest,
        serverCourseId: onServer ? selectedCourseId : null,
        localCourseId: onServer ? null : selectedCourseId,
      });
      if (!result.alreadyImported) {
        Analytics.shareSetImported({
          target: selectedCourseId ? 'course' : 'own',
          guest: session.isGuest,
          cardCount: preview.set.cardsCount,
        });
      }
      toast.success(
        result.alreadyImported
          ? 'Набор уже у тебя'
          : selectedCourse ? `Набор добавлен в «${selectedCourse.title}»` : 'Набор добавлен',
      );
      onOpenSet(result.setId);
    } catch (e) {
      if (e instanceof ShareApiError && e.status === 429) toast.error('Слишком много добавлений — попробуй через час');
      else if (e instanceof ShareApiError && (e.status === 404 || e.status === 410)) setLoadError(toLoadError(e));
      else toast.error(describeError(e, 'Не удалось добавить набор'));
    } finally {
      setAdding(false);
    }
  }, [preview, session, adding, selectedCourseId, selectedCourse, viewer, onOpenSet]);

  // После «Войти и добавить»: выбирать некуда — добавляем сразу
  useEffect(() => {
    if (!autoAdd || autoAddDone.current || !signedIn || !preview || !session || isOwner) return;
    if (ownCourses.length > 0 || existingCopy) return;
    autoAddDone.current = true;
    handleAdd();
  }, [autoAdd, signedIn, preview, session, isOwner, ownCourses.length, existingCopy, handleAdd]);

  const submitNewCourse = useCallback(() => {
    const title = newCourseTitle.trim();
    setCreatingCourse(false);
    setNewCourseTitle('');
    if (!title) return;
    const course = createCourse(title);
    setSelectedCourseId(course.id);
  }, [newCourseTitle, createCourse]);

  const handleReport = useCallback(async (reason: ShareReportReason, comment?: string) => {
    setReportVisible(false);
    try {
      await ShareService.report(code, reason, comment || undefined);
      Analytics.shareSetReported(reason);
      toast.success('Спасибо, мы проверим набор');
      onClose();
    } catch (e) {
      toast.error(describeError(e, 'Не удалось отправить жалобу'));
    }
  }, [code, onClose]);

  // iOS — системный лист (Share 6), иначе общий Sheet
  const openReport = useCallback(async () => {
    setMenuVisible(false);
    if (!isNativeReportSheet) {
      setReportVisible(true);
      return;
    }
    const result = await presentNativeReportSheet({ reasons: REPORT_REASONS, colors, dark });
    if (result) handleReport(result.reason, result.comment);
  }, [colors, dark, handleReport]);

  const handleBlock = useCallback(async () => {
    setMenuVisible(false);
    const name = preview?.author.name || 'автора';
    const confirmed = await confirmAction(
      `Заблокировать ${name}?`,
      'Ссылки этого автора больше не будут у тебя открываться.',
      'Заблокировать',
      { destructive: true },
    );
    if (!confirmed) return;
    try {
      await ShareService.blockAuthor(code);
      Analytics.shareAuthorBlocked();
      toast.success('Автор заблокирован');
      onClose();
    } catch (e) {
      toast.error(describeError(e, 'Не удалось заблокировать'));
    }
  }, [code, preview?.author.name, onClose]);

  const isSheet = Platform.OS === 'ios';
  const authorName = preview?.author.name || 'Пользователь Flashly';
  const canModerate = signedIn && !!preview && !isOwner;
  const shownCards = preview?.cards ?? [];
  const restCards = preview ? preview.set.cardsCount - shownCards.length : 0;

  const renderFooter = () => {
    if (!preview) return null;
    let main: React.ReactNode;
    let hint: string | null = null;
    if (!signedIn) {
      main = <Button title="Войти и добавить" onPress={onRequestSignIn} fullWidth />;
      hint = 'Набор добавится сразу после входа';
    } else if (isOwner && viewer?.ownSetId) {
      main = <Button title="Открыть набор" onPress={() => onOpenSet(viewer.ownSetId!)} fullWidth />;
      hint = 'Это твой набор';
    } else if (existingCopy) {
      main = <Button title="Открыть набор" onPress={() => onOpenSet(existingCopy)} fullWidth />;
    } else {
      main = <Button title="Добавить все карточки" icon={Plus} onPress={handleAdd} loading={adding} fullWidth />;
      hint = `Набор появится ${selectedCourse ? `в курсе «${selectedCourse.title}»` : 'в «Мои наборы»'} — это твоя копия, правки автора её не изменят`;
    }
    return (
      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: spacing.s + insets.bottom }]}>
        {main}
        {hint && <Text variant="caption" color="secondary" style={styles.center}>{hint}</Text>}
      </View>
    );
  };

  const renderCoursePicker = () => {
    // Своих курсов нет — блока нет, набор идёт в «Мои наборы»
    if (!signedIn || isOwner || ownCourses.length === 0) return null;
    const rows: { id: string | null; title: string }[] = [
      { id: null, title: 'Мои наборы' },
      ...ownCourses.map((c) => ({ id: c.id, title: c.title })),
    ];
    return (
      <ListGroup
        title="Куда добавить"
        footer={isTeacher && selectedCourseId ? 'Ученики курса сразу увидят набор' : undefined}
      >
        {rows.map((row) => {
          const selected = row.id === selectedCourseId;
          return (
            <ListRow
              key={row.id ?? 'own'}
              title={row.title}
              icon={row.id ? Folder : Layers}
              iconColor={selected ? colors.primary : undefined}
              onPress={() => setSelectedCourseId(row.id)}
              right={selected ? <Check size={iconSize.s} color={colors.primary} /> : <View />}
            />
          );
        })}
        {/* Гость: курс сохранится только на устройстве, создавать его здесь не предлагаем */}
        {session?.isGuest ? null : creatingCourse ? (
          <View style={styles.newCourseRow}>
            <Folder size={iconSize.s} color={colors.primary} />
            <TextInput
              autoFocus
              value={newCourseTitle}
              onChangeText={setNewCourseTitle}
              onSubmitEditing={submitNewCourse}
              onBlur={submitNewCourse}
              placeholder="Название курса"
              placeholderTextColor={colors.textTertiary}
              selectionColor={colors.primary}
              maxLength={255}
              returnKeyType="done"
              style={[styles.newCourseInput, { color: colors.textPrimary }]}
            />
          </View>
        ) : (
          <ListRow title="Новый курс" icon={Plus} iconColor={colors.primary} onPress={() => setCreatingCourse(true)} chevron={false} />
        )}
      </ListGroup>
    );
  };

  const renderBody = () => {
    if (loadError) {
      if (loadError === 'network') {
        return <ErrorState description="Проверь интернет и попробуй ещё раз" onRetry={() => setReloadKey((k) => k + 1)} />;
      }
      const text = ERROR_TEXT[loadError];
      return (
        <View style={styles.errorBox}>
          <View style={[styles.deck, { backgroundColor: colors.surfaceMuted }]}>
            <Unlink size={iconSize.l} color={colors.textSecondary} />
          </View>
          <Text variant="h3" color="primary" style={styles.center}>{text.title}</Text>
          <Text variant="bodySmall" color="secondary" style={styles.center}>{text.description}</Text>
        </View>
      );
    }
    if (!preview) {
      return (
        <View style={styles.content} accessibilityLabel="Загрузка" accessibilityRole="progressbar">
          <View style={styles.hero}>
            <Skeleton width={64} height={64} radius="l" />
            <Skeleton width="70%" height={28} />
            <Skeleton width="40%" height={16} />
          </View>
          <SkeletonText lines={6} lineHeight={20} />
        </View>
      );
    }
    const { set } = preview;
    return (
      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.deck, { backgroundColor: alpha(colors.primary, 10) }]}>
            <BookOpen size={iconSize.l} color={colors.primary} />
          </View>
          <Text variant="h2" color="primary" style={styles.center}>{set.title}</Text>
          <View style={styles.authorRow}>
            <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
              <Text variant="caption" style={[styles.avatarText, { color: colors.onPrimary }]}>
                {authorName.trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text variant="bodySmall" color="secondary">
              Набор от <Text variant="bodySmall" color="primary" style={styles.bold}>{authorName}</Text>
            </Text>
          </View>
          <View style={styles.chips}>
            {set.languageFrom && set.languageTo ? (
              <View style={[styles.chip, { backgroundColor: colors.surfaceMuted }]}>
                <Text variant="bodySmall" color="primary">
                  {`${getLanguageFlag(set.languageFrom)} ${getLanguageLabel(set.languageFrom)} → ${getLanguageFlag(set.languageTo)} ${getLanguageLabel(set.languageTo)}`}
                </Text>
              </View>
            ) : null}
            <View style={[styles.chip, { backgroundColor: colors.surfaceMuted }]}>
              <Layers size={iconSize.xs} color={colors.textSecondary} />
              <Text variant="bodySmall" color="primary">{cardsLabel(set.cardsCount)}</Text>
            </View>
          </View>
          {set.description ? <Text variant="bodySmall" color="secondary" style={styles.center}>{set.description}</Text> : null}
          {existingCopy && (
            <View style={[styles.addedBadge, { backgroundColor: alpha(colors.success, 10) }]}>
              <CheckCircle2 size={iconSize.s} color={colors.successText} />
              <Text variant="label" style={{ color: colors.successText }}>
                {selectedCourse ? `Набор уже в курсе «${selectedCourse.title}»` : 'Набор уже у тебя'}
              </Text>
            </View>
          )}
        </View>

        {renderCoursePicker()}

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text variant="overline" color="secondary">Карточки</Text>
            {restCards > 0 && (
              <Text variant="caption" color="tertiary">{`показаны ${shownCards.length} из ${set.cardsCount}`}</Text>
            )}
          </View>
          <View style={[styles.cards, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            {shownCards.map((card, index) => (
              <View
                key={index}
                style={[styles.cardRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.border }]}
              >
                <Text variant="body" color="primary" style={[styles.bold, styles.cardFront]}>{card.front}</Text>
                <Text variant="body" color="secondary" style={styles.cardBack}>{card.back}</Text>
              </View>
            ))}
          </View>
          {restCards > 0 && (
            <Text variant="bodySmall" color="secondary" style={styles.center}>
              {`и ещё ${cardsLabel(restCards)} — после добавления`}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle={isSheet ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: isSheet ? 0 : insets.top }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Button variant="icon" icon={X} accessibilityLabel="Закрыть" onPress={onClose} />
          <Text variant="body" color="primary" style={[styles.bold, styles.headerTitle]}>Набор по ссылке</Text>
          {canModerate && isNativeShareMenu ? (
            <ShareMenuButton
              title={`Набор от ${authorName}`}
              tint={colors.textPrimary}
              items={[
                { id: 'report', title: 'Пожаловаться', subtitle: 'Набор скроется у тебя, команда проверит его', symbol: 'flag' },
                { id: 'block', title: 'Заблокировать автора', subtitle: 'Ссылки этого автора больше не будут открываться', symbol: 'nosign', destructive: true },
              ]}
              onSelect={(id) => (id === 'report' ? openReport() : handleBlock())}
            />
          ) : canModerate ? (
            <Button variant="icon" icon={MoreHorizontal} accessibilityLabel="Ещё" onPress={() => setMenuVisible(true)} />
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {renderBody()}
        </ScrollView>

        {!loadError && renderFooter()}

        <Sheet visible={menuVisible} onClose={() => setMenuVisible(false)} title={`Набор от ${authorName}`}>
          <ListGroup>
            <ListRow
              title="Пожаловаться"
              subtitle="Набор скроется у тебя, команда проверит его"
              icon={Flag}
              chevron={false}
              onPress={openReport}
            />
            <ListRow
              title="Заблокировать автора"
              subtitle="Ссылки этого автора больше не будут открываться"
              icon={Ban}
              destructive
              chevron={false}
              onPress={handleBlock}
            />
          </ListGroup>
        </Sheet>

        <Sheet visible={reportVisible} onClose={() => setReportVisible(false)} title="Что не так с набором?">
          <ListGroup>
            {REPORT_REASONS.map(({ reason, title }) => (
              <ListRow key={reason} title={title} chevron={false} onPress={() => handleReport(reason)} />
            ))}
          </ListGroup>
        </Sheet>

        {/* Тосты поверх окна — Modal перекрывает хост приложения */}
        <ToastHost />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    borderBottomWidth: 1,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    padding: spacing.m,
    paddingTop: spacing.l,
    gap: spacing.l,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.s,
  },
  deck: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    textAlign: 'center',
  },
  bold: {
    fontWeight: '600',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.s,
  },
  addedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.m,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  cards: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.s,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
  },
  cardFront: {
    flexShrink: 1,
  },
  cardBack: {
    flexShrink: 1,
    textAlign: 'right',
  },
  newCourseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    minHeight: 52,
    paddingHorizontal: spacing.m,
  },
  newCourseInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: spacing.s,
  },
  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
    padding: spacing.xl,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: spacing.s,
    paddingHorizontal: spacing.m,
    gap: spacing.xs,
  },
});
