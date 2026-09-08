// Web polyfill for @invertase/react-native-apple-authentication.
// Sign in with Apple is a native iOS-only flow — on web `isSupported` is always false,
// so WelcomeScreen never renders the button or calls these methods, but the module
// still needs to resolve for the webpack/web build.
import React from 'react';
import { View } from 'react-native-web';

export const AppleButtonStyle = {
  DEFAULT: 'White',
  WHITE: 'White',
  WHITE_OUTLINE: 'WhiteOutline',
  BLACK: 'Black',
} as const;

export const AppleButtonType = {
  DEFAULT: 'SignIn',
  SIGN_IN: 'SignIn',
  CONTINUE: 'Continue',
  SIGN_UP: 'SignUp',
} as const;

export const AppleRequestOperation = {
  IMPLICIT: 0,
  LOGIN: 1,
  REFRESH: 2,
  LOGOUT: 3,
} as const;

export const AppleRequestScope = {
  EMAIL: 0,
  FULL_NAME: 1,
} as const;

export const AppleCredentialState = {
  REVOKED: 0,
  AUTHORIZED: 1,
  NOT_FOUND: 2,
  TRANSFERRED: 3,
} as const;

export const AppleError = {
  UNKNOWN: '1000',
  CANCELED: '1001',
  INVALID_RESPONSE: '1002',
  NOT_HANDLED: '1003',
  FAILED: '1004',
} as const;

const notSupported = () => Promise.reject(new Error('Sign in with Apple is not supported on web'));

export const appleAuth = {
  isSupported: false,
  isSignUpButtonSupported: false,
  performRequest: notSupported,
  getCredentialStateForUser: notSupported,
  onCredentialRevoked: (_listener: (...args: any[]) => void) => () => {},
  Error: AppleError,
  Operation: AppleRequestOperation,
  Scope: AppleRequestScope,
  UserStatus: { UNSUPPORTED: 0, UNKNOWN: 1, LIKELY_REAL: 2 },
  State: AppleCredentialState,
};

export default appleAuth;

type AppleButtonProps = {
  buttonStyle?: (typeof AppleButtonStyle)[keyof typeof AppleButtonStyle];
  buttonType?: (typeof AppleButtonType)[keyof typeof AppleButtonType];
  cornerRadius?: number;
  style?: any;
  testID?: string;
  textStyle?: any;
  leftView?: React.ReactNode;
  buttonText?: string;
  onPress?: (event: unknown) => void;
};

// Sign in with Apple has no web equivalent — render an empty View so layouts using
// this component don't need platform branching (canUseAppleSignIn keeps it unused anyway).
export const AppleButton: React.FC<AppleButtonProps> & {
  Style: typeof AppleButtonStyle;
  Type: typeof AppleButtonType;
} = (props) => React.createElement(View, { style: props.style, testID: props.testID });

AppleButton.Style = AppleButtonStyle;
AppleButton.Type = AppleButtonType;
