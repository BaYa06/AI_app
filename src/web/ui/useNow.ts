import { useEffect, useState } from 'react';

/** Текущее время, обновляется раз в `ms` (по умолчанию секунду) — для таймеров и «N секунд назад» */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
