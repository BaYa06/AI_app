import { Platform } from 'react-native';
import Config from 'react-native-config';
import PostHog from 'posthog-react-native';

// Native builds use react-native-config; the existing web build exposes these values via webpack.
const projectToken =
  Platform.OS === 'web' ? process.env.POSTHOG_PROJECT_TOKEN : Config?.POSTHOG_PROJECT_TOKEN;
const host = Platform.OS === 'web' ? process.env.POSTHOG_HOST : Config?.POSTHOG_HOST;

if (__DEV__ && !projectToken) {
  throw new Error(
    'POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_PROJECT_TOKEN is configured'
  );
}

if (__DEV__ && !host) {
  throw new Error(
    'POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_HOST is configured'
  );
}

/** Shared PostHog client. Undefined in production when configuration is absent. */
export const posthog =
  projectToken && host
    ? new PostHog(projectToken, {
        host,
        captureAppLifecycleEvents: true,
        logs: {
          serviceName: 'flashcards-app',
          environment: __DEV__ ? 'development' : 'production',
        },
        errorTracking: {
          autocapture: {
            uncaughtExceptions: true,
            unhandledRejections: true,
            // Console messages are not part of the error-monitoring scope.
            console: [],
          },
        },
      })
    : undefined;
