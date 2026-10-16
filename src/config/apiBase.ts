/**
 * Единая точка объявления адреса backend API.
 *
 * Раньше почти каждый экран объявлял свою копию
 * `const API_BASE = __DEV__ ? 'http://localhost:3000/api' : '/api';`. В продакшен-сборке (не
 * __DEV__) относительный путь '/api' не резолвится в fetch() на нативном React Native (в
 * отличие от браузера/веба) — такой запрос падает сразу, без похода в сеть. Из-за этого вся
 * фича живых письменных тестов (создание/подключение/мониторинг/результаты), скорее всего, не
 * работала вообще в собранном iOS/Android-приложении, только при разработке через Metro
 * (__DEV__) или в веб-версии. См. plan/teacher_access_fix_plan.md, пункт 55.
 *
 * Тестовый сервер (plan/new/release_safety.md, Release 3): сборка с APP_ENV=staging (Codemagic,
 * workflow ios-testflight-staging) ходит на Vercel Preview ветки dev — там своя ветка базы
 * Neon, рабочие данные не трогаются. Веб берёт API со своего же домена, поэтому Preview-сайт
 * тоже работает со своим сервером.
 */
import { Platform } from 'react-native';

export const IS_STAGING = process.env.APP_ENV === 'staging';

const PRODUCTION_ORIGIN = 'https://ai-app-seven-zeta.vercel.app';
const STAGING_ORIGIN = 'https://ai-app-git-dev-baya06s-projects.vercel.app';

export const API_ORIGIN =
  Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.origin
    : IS_STAGING
      ? STAGING_ORIGIN
      : PRODUCTION_ORIGIN;

export const API_BASE = __DEV__
  ? 'http://localhost:3000/api'
  : `${API_ORIGIN}/api`;
