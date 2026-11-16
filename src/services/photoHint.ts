/**
 * «Быстрее: сфоткай страницу или вставь список — ИИ сделает карточки» после 10-й карточки,
 * добавленной вручную (plan/new/new_user_activation.md, Start 4.3). Один раз.
 */
import { confirmDialog } from '@/components/ui';
import { Analytics } from './analytics';
import { noteManualCard } from './momentHints';

/** Вызывать после каждой карточки, добавленной вручную. onPhoto — открыть импорт в этот набор */
export function afterManualCard(onPhoto: () => void): void {
  if (!noteManualCard()) return;
  Analytics.momentHintShown('photo_after_manual');
  // Даём закрыться окну добавления
  setTimeout(() => {
    confirmDialog({
      title: 'Быстрее — из фото',
      message: 'Сфоткай страницу или вставь список — ИИ сделает карточки за пару секунд.',
      confirmText: 'Из фото или файла',
      cancelText: 'Не сейчас',
    }).then((ok) => {
      if (!ok) return;
      Analytics.momentHintTapped('photo_after_manual');
      onPhoto();
    });
  }, 400);
}
