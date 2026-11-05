/**
 * Набор не найден: ждём синхронизацию курсов 8 с, потом — пустое состояние
 * (Clean 8 — перенесено из SetDetailScreen.tsx без изменений.)
 */
import { useEffect } from 'react';
import { Container, Loading } from '@/components/common';
import { EmptyState } from '@/components/ui';
import { DatabaseService } from '@/services';
import { Layers } from 'lucide-react-native';

export function MissingSet({
  missing,
  onMissing,
  onBack,
}: {
  missing: boolean;
  onMissing: (missing: boolean) => void;
  onBack: () => void;
}) {
  useEffect(() => {
    DatabaseService.syncStudentCourses().catch(() => {});
    const timer = setTimeout(() => onMissing(true), 8000);
    return () => clearTimeout(timer);
  }, [onMissing]);
  if (!missing) return <Loading fullScreen message="Загрузка..." />;
  return (
    <Container>
      <EmptyState
        icon={Layers}
        title="Набор не найден"
        description="Возможно, его удалили или скрыли. Попробуй открыть курс ещё раз."
        action={{ label: 'Назад', onPress: onBack }}
      />
    </Container>
  );
}
