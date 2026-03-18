import React from 'react';
import { View } from 'react-native';

export function BlurView({ style, children, ...props }: any) {
  return <View style={style} {...props}>{children}</View>;
}
