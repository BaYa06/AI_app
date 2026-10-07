/**
 * appleSignInName
 * @description Имя из Sign in with Apple. Apple отдаёт его только при первом входе,
 * а Supabase из identityToken его не берёт — передаём из WelcomeScreen в App
 * (создание профиля), чтобы не спрашивать имя повторно (App Review, Guideline 4).
 */
let pendingName: string | null = null;

export function setAppleSignInName(name: string | null): void {
  pendingName = name;
}

/** Забирает имя один раз */
export function takeAppleSignInName(): string | null {
  const name = pendingName;
  pendingName = null;
  return name;
}

export function isAppleUser(user: { app_metadata?: any }): boolean {
  const meta = user.app_metadata ?? {};
  return meta.provider === 'apple' || (Array.isArray(meta.providers) && meta.providers.includes('apple'));
}
