/**
 * Кроссплатформенные диалоги. В react-native-web Alert.alert — пустая заглушка,
 * поэтому на вебе используем window.alert / window.confirm (как в TeacherStudentsScreen, ProfileScreen).
 */
import { Alert, Platform } from 'react-native';

// В tsconfig нет lib "dom" — типизируем только то, что нужно на вебе.
const webWindow = globalThis as unknown as { alert(message: string): void; confirm(message: string): boolean };

export function showMessage(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    webWindow.alert(message ? `${title}\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function confirmAction(
  title: string,
  message: string,
  confirmText: string,
  { destructive = false, cancelText = 'Отмена' }: { destructive?: boolean; cancelText?: string } = {},
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(webWindow.confirm(`${title}\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
