// Web polyfill for react-native-gesture-handler
import React from 'react';
import { View, ViewProps } from 'react-native-web';

// GestureHandlerRootView - just a passthrough View on web
export const GestureHandlerRootView: React.FC<ViewProps & { children?: React.ReactNode }> = ({ 
  children, 
  style,
  ...props 
}) => {
  return React.createElement(View, { style: [{ flex: 1 }, style], ...props }, children);
};

// Basic gesture components - these are just Views on web
export const PanGestureHandler: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

export const TapGestureHandler: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

export const LongPressGestureHandler: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

export const ScrollView = View;
export const FlatList = View;

// Gesture state enum
export const State = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
};

// Direction constants
export const Directions = {
  RIGHT: 1,
  LEFT: 2,
  UP: 4,
  DOWN: 8,
};

// Swipeable component stub
export const Swipeable: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

// RectButton - basic touchable
export const RectButton: React.FC<{ 
  children?: React.ReactNode;
  onPress?: () => void;
  style?: any;
}> = ({ children, onPress, style }) => {
  return React.createElement(
    'div',
    { 
      onClick: onPress,
      style: { cursor: onPress ? 'pointer' : 'default', ...style }
    },
    children
  );
};

export const BaseButton = RectButton;
export const BorderlessButton = RectButton;

// Default export
export default {
  GestureHandlerRootView,
  PanGestureHandler,
  TapGestureHandler,
  LongPressGestureHandler,
  State,
  Directions,
  Swipeable,
  RectButton,
  BaseButton,
  BorderlessButton,
  ScrollView,
  FlatList,
};
