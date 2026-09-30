import React, { Component, ErrorInfo } from 'react';
import { View, Modal, StyleSheet, ScrollView, Platform } from 'react-native';
import { Button } from '@/components/ui/Button';
import { useThemeColors } from '@/store';
import { borderRadius, spacing } from '@/constants';
import { Text } from './Text';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleDismiss = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <>
          {this.props.children}
          <ErrorDialog error={this.state.error} errorInfo={this.state.errorInfo} onDismiss={this.handleDismiss} />
        </>
      );
    }

    return this.props.children;
  }
}

/**
 * Окно ошибки. Границу ставим выше SafeAreaProvider, поэтому здесь свой Modal,
 * а не Dialog (он читает safe area). Оформление — как у Dialog.
 */
function ErrorDialog({
  error,
  errorInfo,
  onDismiss,
}: {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  onDismiss: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View accessibilityViewIsModal style={[styles.modal, { backgroundColor: colors.surface }]}>
          <Text variant="h3" accessibilityRole="header" style={[styles.title, { color: colors.errorText }]}>
            Что-то пошло не так
          </Text>
          <ScrollView style={styles.scroll}>
            {/* Технический текст ошибки — только разработчику */}
            <Text variant="bodySmall" style={{ color: colors.textPrimary }}>
              {__DEV__ ? error?.toString() : 'Закрой это окно и попробуй ещё раз. Если повторится — напиши нам: Профиль → «Написать нам».'}
            </Text>
            {__DEV__ && errorInfo?.componentStack && (
              <Text variant="caption" style={[styles.stackText, { color: colors.textTertiary }]}>
                {errorInfo.componentStack}
              </Text>
            )}
          </ScrollView>
          <Button title="Закрыть" onPress={onDismiss} fullWidth />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.l,
  },
  modal: {
    borderRadius: borderRadius.xl,
    padding: spacing.l,
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  title: {
    marginBottom: spacing.s,
  },
  scroll: {
    maxHeight: 250,
    marginBottom: spacing.m,
  },
  stackText: {
    marginTop: spacing.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
