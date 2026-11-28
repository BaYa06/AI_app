import { useState } from 'react';
import { PAGE_SIZE } from '../teacherLogic';

/** «Показать ещё» для длинных списков (Web 27): по PAGE_SIZE строк за раз */
export function useShowMore(total: number, size = PAGE_SIZE) {
  const [shown, setShown] = useState(size);
  return {
    shown,
    hasMore: total > shown,
    next: Math.min(size, Math.max(0, total - shown)),
    showMore: () => setShown((n) => n + size),
  };
}
