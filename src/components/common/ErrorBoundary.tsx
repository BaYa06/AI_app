import React, { Component, ErrorInfo } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';

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
      const { error, errorInfo } = this.state;

      return (
        <>
          {this.props.children}
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={this.handleDismiss}
          >
            <View style={styles.overlay}>
              <View style={styles.modal}>
                <Text style={styles.title}>Something went wrong</Text>
                <ScrollView style={styles.scroll}>
                  <Text style={styles.errorText}>
                    {error?.toString()}
                  </Text>
                  {__DEV__ && errorInfo?.componentStack && (
                    <Text style={styles.stackText}>
                      {errorInfo.componentStack}
                    </Text>
                  )}
                </ScrollView>
                <TouchableOpacity style={styles.button} onPress={this.handleDismiss}>
                  <Text style={styles.buttonText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E53935',
    marginBottom: 12,
  },
  scroll: {
    maxHeight: 250,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  stackText: {
    fontSize: 11,
    color: '#888',
    marginTop: 8,
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  button: {
    backgroundColor: '#E53935',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
