/**
 * Галерея компонентов (только в разработке, адрес /_ui): проверить глазами, что компоненты брендбука
 * выглядят в кабинете так, как описано в DESIGN.md.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, Badge, ProgressBar, Switch } from '@/components/ui/Controls';
import { TextField } from '@/components/ui/TextField';
import { SkeletonList } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { Banner } from '../ui/states';

export function UiGalleryPage() {
  const [chip, setChip] = useState(true);
  const [on, setOn] = useState(true);
  return (
    <View style={{ gap: spacing.l }}>
      <Text variant="h2">Компоненты</Text>
      <Card>
        <View style={{ gap: spacing.s }}>
          <Text variant="overline" color="secondary">
            КНОПКИ
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.s, alignItems: 'center' }}>
            <Button title="Главная" icon={Plus} />
            <Button variant="secondary" title="Вторая" />
            <Button variant="quiet" title="Тихая" />
            <Button variant="danger" title="Удалить" />
            <Button title="Малая" size="s" />
            <Button title="Загрузка" loading />
          </View>
        </View>
      </Card>
      <Card>
        <View style={{ gap: spacing.s }}>
          <Text variant="overline" color="secondary">
            ЧИПЫ, БЕЙДЖИ, ПЕРЕКЛЮЧАТЕЛЬ
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.s, alignItems: 'center' }}>
            <Chip label="Выбран" selected={chip} onPress={() => setChip(!chip)} />
            <Chip label="Обычный" />
            <Badge label="Идёт тест" tone="primary" />
            <Badge label="Готово" tone="success" />
            <Badge label="Скоро" tone="warning" />
            <Switch value={on} onValueChange={setOn} accessibilityLabel="Пример" />
          </View>
          <ProgressBar progress={62} />
        </View>
      </Card>
      <Card>
        <View style={{ gap: spacing.s, maxWidth: 360 }}>
          <TextField label="Название курса" hint="Как его увидят ученики" />
          <TextField label="С ошибкой" error="Введи название" />
          <TextField variant="search" placeholder="Поиск по ученикам" />
        </View>
      </Card>
      <Card>
        <View style={{ gap: spacing.s }}>
          <Button
            title="Показать тост"
            variant="secondary"
            onPress={() => toast.success('Сохранено')}
          />
          <Banner text="Нет связи. Пробуем снова." />
          <SkeletonList />
        </View>
      </Card>
    </View>
  );
}
