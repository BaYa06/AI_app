/**
 * Поиск и фильтры списка учеников
 * (Clean 8 — вынесено из TeacherStudentsScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, Pressable, TextInput, ScrollView } from 'react-native';
import { Search } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { iconSize } from '@/constants';
import { styles } from './styles';
import { type FilterKey, FILTERS } from './helpers';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  inputBg: string;
  pillActiveBg: string;
  pillInactiveBg: string;
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  activeFilter: FilterKey;
  setActiveFilter: React.Dispatch<React.SetStateAction<FilterKey>>;
};

export function StudentsSearch({
  colors,
  inputBg,
  pillActiveBg,
  pillInactiveBg,
  query,
  setQuery,
  activeFilter,
  setActiveFilter,
}: Props) {
  return (
    <View style={styles.searchSection}>
      {/* Search input */}
      <View style={[styles.searchBar, { backgroundColor: inputBg }]}>
        <Search size={iconSize.xs} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Поиск..."
          placeholderTextColor={colors.textTertiary}
          style={[styles.searchInput, { color: colors.textPrimary }]}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsRow}
      >
        {FILTERS.map((f) => {
          const active = activeFilter === f.key;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={f.key}
              onPress={() => setActiveFilter(f.key)}
              style={[styles.pill, { backgroundColor: active ? pillActiveBg : pillInactiveBg }]}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: active ? colors.onPrimary : colors.textSecondary },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
