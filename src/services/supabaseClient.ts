import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

/**
 * Safe AsyncStorage adapter — prevents crashes if the native module is not linked.
 */
const safeStorage = AsyncStorage?.getItem
  ? AsyncStorage
  : {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {},
    };

/**
 * Supabase client configured for React Native.
 * - Uses AsyncStorage for auth persistence.
 * - Disables URL detection because deep links are handled by React Native.
 * - PKCE flow is required for mobile OAuth.
 */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yiwsmjbeirgomkrckoju.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlpd3NtamJlaXJnb21rcmNrb2p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NzUzMTksImV4cCI6MjA4NTE1MTMxOX0.d8ck5zaELDtMYLyLHVrYEyiytj3a_8Q7XikSLWM1o3Q';

console.log('[supabase] URL:', SUPABASE_URL ? 'SET' : 'NOT SET');
console.log('[supabase] ANON_KEY:', SUPABASE_ANON_KEY ? 'SET' : 'NOT SET');

const isWeb = Platform.OS === 'web';
const defaultWebRedirect =
  isWeb && typeof window !== 'undefined' && window.location
    ? `${window.location.origin}/auth-callback`
    : '';
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
    storage: isWeb ? undefined : safeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isWeb, // let web handle code in URL; mobile uses deep links manually
    flowType: 'pkce',
    lock: undefined,
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
