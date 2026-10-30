/**
 * Нативные меню «…» и лист жалобы для набора по ссылке на iOS (plan/new/share_set.md, Share 6) —
 * ios/FlashcardsApp/ShareSetActions.swift. Как в последних версиях: UIMenu и
 * UISheetPresentationController, на iOS 26 — системное стекло.
 * Android, веб и сборки без нативного модуля — общий Sheet в SharedSetPreviewModal.
 */
import React from 'react';
import { NativeModules, Platform, UIManager, processColor, requireNativeComponent, type ViewProps } from 'react-native';
import type { ShareReportReason } from '@/services';

export interface NativeMenuItem {
  id: string;
  title: string;
  subtitle?: string;
  /** SF Symbol */
  symbol?: string;
  destructive?: boolean;
}

interface NativeMenuButtonProps extends ViewProps {
  items: NativeMenuItem[];
  menuTitle: string;
  tint?: ReturnType<typeof processColor>;
  onSelect: (event: { nativeEvent: { id: string } }) => void;
}

const hasNativeMenu = Platform.OS === 'ios' && UIManager.hasViewManagerConfig('ShareMenuButton');
const NativeMenuButton = hasNativeMenu ? requireNativeComponent<NativeMenuButtonProps>('ShareMenuButton') : null;

export const isNativeShareMenu = !!NativeMenuButton;

/** Кнопка «…» с системным меню. Только когда isNativeShareMenu. */
export function ShareMenuButton({ items, title, tint, onSelect }: {
  items: NativeMenuItem[];
  title: string;
  tint: string;
  onSelect: (id: string) => void;
}) {
  if (!NativeMenuButton) return null;
  return (
    <NativeMenuButton
      items={items}
      menuTitle={title}
      tint={processColor(tint)}
      onSelect={(event) => onSelect(event.nativeEvent.id)}
      accessibilityLabel="Ещё"
      style={{ width: 44, height: 44 }}
    />
  );
}

interface ReportSheetModule {
  present(options: object): Promise<{ reason: ShareReportReason; comment: string } | null>;
}

const reportSheet: ReportSheetModule | undefined =
  Platform.OS === 'ios' ? NativeModules.ShareReportSheetModule : undefined;

export const isNativeReportSheet = !!reportSheet;

// Токены, которые читает лист (StudyModePalette в Swift)
const COLOR_KEYS = ['surface', 'border', 'textPrimary', 'textSecondary', 'primary', 'primaryFill', 'onPrimary'] as const;

/** Системный лист жалобы. null — закрыли без отправки. */
export function presentNativeReportSheet(options: {
  reasons: { reason: ShareReportReason; title: string }[];
  colors: Record<(typeof COLOR_KEYS)[number], string>;
  dark: boolean;
}): Promise<{ reason: ShareReportReason; comment: string } | null> {
  if (!reportSheet) return Promise.resolve(null);
  return reportSheet.present({
    title: 'Что не так с набором?',
    subtitle: 'Набор скроется у тебя, команда проверит его',
    reasons: options.reasons.map(({ reason, title }) => ({ id: reason, title })),
    colors: Object.fromEntries(COLOR_KEYS.map((key) => [key, processColor(options.colors[key])])),
    dark: options.dark,
  });
}
