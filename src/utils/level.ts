/**
 * Уровень пользователя: 1 изученная карточка = 1 XP, уровень каждые 100 XP.
 * Общая формула для экранов профиля и статистики.
 */
export const XP_PER_LEVEL = 100;

export function getLevelProgress(totalCardsStudied: number) {
  const level = Math.floor(totalCardsStudied / XP_PER_LEVEL) + 1;
  const xpCurrent = totalCardsStudied % XP_PER_LEVEL;
  const xpPercent = Math.round((xpCurrent / XP_PER_LEVEL) * 100);
  return { level, xpCurrent, xpPercent, xpToNext: XP_PER_LEVEL - xpCurrent };
}
