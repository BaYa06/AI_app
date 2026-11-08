/**
 * Размеры и тайминги карточки в сессии «Карточки»
 * (Clean 8 — перенесено из StudyScreen.tsx без изменений.)
 */
import { Dimensions } from 'react-native';
import { spacing } from '@/constants';

export const { width: SCREEN_WIDTH } = Dimensions.get('window');
export const CARD_WIDTH = Math.min(340, SCREEN_WIDTH - 32);
export const CARD_HEIGHT = CARD_WIDTH * 1.25;
export const CARD_BOX_HEIGHT = Math.min(CARD_HEIGHT, 420);

// Рамка текста на карточке до первого onLayout: без отступов 24×2 и рамки, верхней строки (32),
// низа (24 + подпись 20 на лице, 24 на обороте) и запаса над словом (4)
export const DEFAULT_TEXT_BOX = {
  width: CARD_WIDTH - spacing.l * 2 - 2,
  front: CARD_BOX_HEIGHT - spacing.l * 2 - 2 - 32 - 44 - spacing.xxs,
  back: CARD_BOX_HEIGHT - spacing.l * 2 - 2 - 32 - spacing.l - spacing.xxs,
};
// Слово: h2 (24) → не мельче 18; пример: bodyLarge (18) → не мельче 15 (utils/fitText.ts)
export const WORD_FIT = { sizes: [24, 22, 20, 18], lineHeightRatio: 1.5 };
export const EXAMPLE_FIT = { sizes: [18, 16, 15], lineHeightRatio: 1.45 };
// Между словом и примером: два отступа cardContent + разделитель
export const EXAMPLE_GAP = spacing.m * 2 + 2;
// Свайп карточки засчитывается после 30% её ширины или быстрым смахом; затем она улетает за край
export const SWIPE_DISTANCE = CARD_WIDTH * 0.3;
export const SWIPE_VELOCITY = 800;
export const SWIPE_OUT_MS = 220;
// Следующая карточка проявляется на месте отвеченной
export const CARD_IN_MS = 160;
export const CARD_IN_DELAY_MS = 32;
