/**
 * Общие типы UI-компонентов брендбука.
 */
import type React from 'react';

/** Любая иконка lucide-react-native (тип компонента lucide не экспортируется). */
export type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;
