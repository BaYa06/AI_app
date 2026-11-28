import { posthog } from '@/config/posthog';

type LogAttributes = Record<string, boolean | number | string>;

/**
 * Purpose-built operational logs exported to PostHog. Keep application logger output separate:
 * only call sites in this module's diff are eligible for PostHog log capture.
 */
function info(message: string, attributes?: LogAttributes) {
  try {
    posthog?.logger.info(message, attributes);
  } catch {
    // Logging must never interrupt the app path that produced it.
  }
}

function error(message: string, attributes?: LogAttributes) {
  try {
    posthog?.logger.error(message, attributes);
  } catch {
    // Logging must never interrupt the app path that produced it.
  }
}

export const posthogLog = { info, error };
