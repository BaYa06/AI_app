import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';

/**
 * Supabase client configured for React Native.
 * - Uses AsyncStorage for auth persistence.
 * - Disables URL detection because deep links are handled by React Native.
 * - PKCE flow is required for mobile OAuth.
 */
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

const isWeb = Platform.OS === 'web';
const defaultWebRedirect =
  typeof window !== 'undefined' ? `${window.location.origin}/auth-callback` : '';
const SUPABASE_REDIRECT_URI = isWeb
  ? process.env.SUPABASE_WEB_REDIRECT_URI ?? defaultWebRedirect
  : process.env.SUPABASE_REDIRECT_URI ?? 'flashly://auth-callback';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[supabase] Missing SUPABASE_URL / SUPABASE_ANON_KEY. Set them in your mobile env (e.g. .env, Xcode/Gradle).',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // On web use the default (localStorage) to avoid gotrue lock issues with RN AsyncStorage.
    storage: isWeb ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isWeb, // let web handle code in URL; mobile uses deep links manually
    flowType: 'pkce',
    lock: isWeb ? undefined : processLock,
    lockAcquireTimeout: 20000,
  },
});

const handleAppStateChange = (state: AppStateStatus) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
};

// Keep tokens fresh while the app is foregrounded (mobile only).
if (!isWeb) {
  AppState.addEventListener('change', handleAppStateChange);
  supabase.auth.startAutoRefresh();
}

export const SUPABASE_OAUTH_REDIRECT = SUPABASE_REDIRECT_URI;
