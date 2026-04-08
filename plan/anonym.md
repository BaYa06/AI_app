
Мне нужно добавить гостевой вход в приложение Flashly (React Native + Supabase + NeonDB/PostgreSQL).

## Задача
Добавить кнопку "Попробовать без регистрации" на экран входа. При нажатии — создаётся анонимная сессия через Supabase, пользователь попадает в приложение без онбординга и может сразу пользоваться основным функционалом.

## Стек
- React Native + TypeScript
- Supabase (auth)
- NeonDB (PostgreSQL через NeonService)
- Zustand (state)
- Аналитика через Analytics сервис (уже есть метод Analytics.login с типом 'anonymous')

## Что нужно изменить

### 1. src/screens/SignInScreen.tsx
Добавить кнопку "Попробовать без регистрации" внизу экрана (под существующими кнопками входа).

При нажатии:
```typescript
const handleGuestLogin = async () => {
  setIsLoading(true);
  try {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    // onAuthStateChange в App.tsx сам поймает новую сессию
  } catch (e) {
    setError('Не удалось войти. Попробуйте ещё раз.');
  } finally {
    setIsLoading(false);
  }
};
```

Стиль кнопки: простой Pressable (не основная кнопка), текст цвета `colors.textSecondary`, без фона, расположить под разделителем с текстом "или".

### 2. src/App.tsx — функция handleSession
Сейчас handleSession вызывает NeonService.ensureUserExists и NeonService.checkOnboardingCompleted для каждого пользователя.

Для анонимного пользователя нужно другое поведение:
- Определять анонимного пользователя: `user.is_anonymous === true` (поле из Supabase)
- Если пользователь анонимный — НЕ вызывать NeonService.ensureUserExists и NeonService.checkOnboardingCompleted
- Сразу ставить: `setIsAuthenticated(true)`, `setNeedsOnboarding(false)`
- НЕ показывать онбординг — пропустить его полностью
- Вызвать Analytics.login('anonymous')

Пример проверки:
```typescript
const isAnonymous = (user as any).is_anonymous === true;
if (isAnonymous) {
  setCurrentUserId(user.id);
  setIsAuthenticated(true);
  setNeedsOnboarding(false);
  Analytics.login('anonymous');
  return;
}
// ... остальная логика для обычных пользователей
```

### 3. src/services/NeonService.ts — функция ensureUserExists
В INSERT запросе добавить поддержку анонимных пользователей.
Изменить поле `is_anonymous`:
```sql
INSERT INTO users (id, email, display_name, is_anonymous, user_name)
VALUES (${user.id}::uuid, ${user.email ?? null}, ${displayName ?? 'Гость'}, ${user.isAnonymous ?? false}, ${defaultUserName ?? null})
ON CONFLICT (id) DO UPDATE SET
  user_name = COALESCE(users.user_name, EXCLUDED.user_name);
```

Добавить опциональное поле `isAnonymous?: boolean` в тип EnsureUserArgs.

## Что НЕ нужно менять
- Онбординг экраны — они не затрагиваются
- AppNavigator — маршрутизация не меняется
- Никакие другие экраны

## Дополнительно
После реализации добавь короткий комментарий `// Guest login` рядом с новым кодом в каждом файле, чтобы легко найти изменения.

Покажи изменения по одному файлу за раз, начни с SignInScreen.tsx.
```