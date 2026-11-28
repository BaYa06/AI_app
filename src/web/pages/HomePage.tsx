import React from 'react';
import { View } from 'react-native';
import { GraduationCap } from 'lucide-react-native';
import { spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { EmptyState } from '@/components/ui/EmptyState';

/** «Обзор»: курсы, расписание и плашка «идёт тест» появятся в Web 6 */
export function HomePage() {
  return (
    <View style={{ gap: spacing.l }}>
      <Text variant="h2">Обзор</Text>
      <EmptyState
        icon={GraduationCap}
        title="Курсы скоро будут здесь"
        description="Пока управляй курсами в приложении Flashly. В кабинете появятся ученики, экзамены и итоги."
      />
    </View>
  );
}
