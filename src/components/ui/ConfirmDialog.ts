/**
 * ConfirmDialog — подтверждение действия (брендбук, 7.7).
 *
 * Системный Alert с единым видом кнопок: слева «Отмена» (cancel), справа действие;
 * опасное действие («Удалить», «Выйти») — стиль destructive. На вебе — window.confirm.
 *
 *   if (await confirmDialog({ title: 'Удалить набор?', message: '…', confirmText: 'Удалить', destructive: true })) { … }
 */
import { confirmAction } from '@/utils/dialogs';

export interface ConfirmDialogOptions {
  title: string;
  message?: string;
  /** Текст кнопки действия — глагол: «Удалить», «Выйти», «Сбросить». */
  confirmText: string;
  cancelText?: string;
  /** Опасное действие — красная кнопка. */
  destructive?: boolean;
}

/** Показывает подтверждение; `true`, если пользователь выбрал действие. */
export function confirmDialog({
  title,
  message = '',
  confirmText,
  cancelText = 'Отмена',
  destructive = false,
}: ConfirmDialogOptions): Promise<boolean> {
  return confirmAction(title, message, confirmText, { destructive, cancelText });
}
