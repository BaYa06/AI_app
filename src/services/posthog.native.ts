/**
 * PostHog в нативном приложении (posthog-react-native). Веб — posthog.ts с тем же API.
 *
 * Сюда приходят все события из analyticsTransport (тот же каталог Analytics, что и в Firebase),
 * плюс экраны навигации, события жизненного цикла (установка, обновление, открытие, уход в фон)
 * и необработанные JS-ошибки. Нативные падения по-прежнему собирает Crashlytics.
 *
 * Записи сессий (posthog-react-native-session-replay):
 * — пока только в staging-сборке (REPLAY_ENVS); после проверки скрытия добавить 'production';
 * — пишем новых: до входа (первый запуск на устройстве) и первые NEW_USER_DAYS дней после
 *   регистрации, остальных — REPLAY_SHARE % по UUID (один и тот же человек всегда в выборке или вне);
 * — поля ввода и картинки скрыты всегда, сеть и логи не пишем;
 * — на экранах с чужими или личными данными (SENSITIVE_SCREENS) запись на паузе.
 */
import PostHog from 'posthog-react-native';
import { APP_ENV_LABEL, POSTHOG_ENABLED, POSTHOG_HOST, POSTHOG_KEY } from '@/config/posthog';
import { log } from '@/utils/logger';
import { StorageService } from './StorageService';

type Props = Record<string, string | number | boolean>;

let client: PostHog | null = null;

const REPLAY_ENVS: ReadonlyArray<typeof APP_ENV_LABEL> = ['staging'];
const REPLAY_SHARE = 20;
const NEW_USER_DAYS = 3;
/** Экзамены и тесты, кабинет учителя, ученики, рейтинг курса, личные данные, поддержка */
const SENSITIVE_SCREENS =
  /^(Exam|Test|LiveTest|Warmup|Teacher|Student|CourseLeaderboard|PersonalInfo|MyData|Security|Support|Feedback)/;
/** Уже входил на этом устройстве — до входа не пишем, решение после identify */
const KNOWN_USER_KEY = 'posthog_known_user';

const replayAllowed = REPLAY_ENVS.includes(APP_ENV_LABEL);
let replayWanted = false;
let onSensitiveScreen = false;
let recording = false;

if (POSTHOG_ENABLED) {
  try {
    client = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      captureAppLifecycleEvents: true,
      // Профиль создаётся только у вошедших (identify), анонимные события дешевле
      personProfiles: 'identified_only',
      errorTracking: { autocapture: { uncaughtExceptions: true, unhandledRejections: true } },
      // Запись включаем сами (applyReplay), чтобы выбирать, кого и где писать
      enableSessionReplay: false,
      sessionReplayConfig: {
        maskAllTextInputs: true,
        maskAllImages: true,
        captureLog: false,
        captureNetworkTelemetry: false,
      },
    });
    client.register({ app_env: APP_ENV_LABEL });
    if (replayAllowed && !StorageService.getString(KNOWN_USER_KEY)) {
      replayWanted = true;
      applyReplay();
    }
  } catch (e) {
    log.debug('PostHog', 'init error', e);
    client = null;
  }
}

/** Веб инициализируется из точки входа; на телефоне клиент создаётся при импорте модуля */
export function initPostHog(_opts?: { maskAllText?: boolean }) {}

export function phCapture(event: string, props?: Props) {
  client?.capture(event, props);
}

export function phIdentify(userId: string | null) {
  if (!client) return;
  if (userId) {
    if (client.getDistinctId() !== userId) client.identify(userId);
  } else {
    replayWanted = false;
    applyReplay();
    client.reset();
    client.register({ app_env: APP_ENV_LABEL });
  }
}

export function phSetPersonProps(props: Record<string, string | number | boolean>) {
  client?.capture('$set', { $set: props });
}

export function phScreen(name: string) {
  client?.screen(name);
  onSensitiveScreen = SENSITIVE_SCREENS.test(name);
  applyReplay();
}

/** Решение о записи после входа: новые — всегда, остальные — REPLAY_SHARE % по UUID */
export function phReplayForUser(userId: string, daysSinceRegistration: number) {
  if (!client || !replayAllowed) return;
  StorageService.setString(KNOWN_USER_KEY, '1');
  const n = parseInt(userId.replace(/-/g, '').slice(7, 14), 16);
  const sampled = Number.isFinite(n) && n % 100 < REPLAY_SHARE;
  replayWanted = daysSinceRegistration < NEW_USER_DAYS || sampled;
  applyReplay();
}

function applyReplay() {
  if (!client) return;
  const shouldRecord = replayWanted && !onSensitiveScreen;
  if (shouldRecord === recording) return;
  recording = shouldRecord;
  (shouldRecord ? client.startSessionRecording() : client.stopSessionRecording()).catch(
    (e: unknown) => log.debug('PostHog', 'replay toggle error', e)
  );
}
