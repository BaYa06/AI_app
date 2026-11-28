/**
 * Живой экзамен, движок 2 (plan/new/live_exam.md) — вызовы api/test.js?action=exam-*.
 *
 * Не бросает на HTTP-ошибках: возвращает { ok, status, data, error } — экран сам решает,
 * что показать (409 deadline / paused / submitted, 426 «обновите»).
 */
import { getAccessToken } from '@/services/auth/session';
import { rawApiFetch } from '@/services/api/client';

/** Возможности клиента для join: без 'exam2' сервер не пустит в экзамен движка 2 (426) */
export const EXAM_FEATURES = ['exam2'];

export type ExamFormat = 'choice' | 'write' | 'scramble' | 'match' | 'gap';
export type Verdict = 'correct' | 'wrong' | 'typo' | 'wrong_form' | 'none';
export type Difficulty = 'easy' | 'mid' | 'hard' | 'unstudied';

export type ExamQuestion = {
  itemId: string;
  prompt: string;
  direction?: string | null;
  pos?: string;
  options?: string[];
  letters?: string[];
  wordLengths?: number[];
  rows?: number;
  maxLength?: number;
};

export type MatchQuestion = {
  itemIds: string[];
  left: { itemId: string; text: string }[];
  right: string[];
  layout: 'columns' | 'stacked';
};

export type ExamScreen = {
  blockNo: number;
  format: ExamFormat;
  numbers: number[];
  questions: (ExamQuestion | MatchQuestion)[];
};

export type ExamState = {
  status: string;
  screens: ExamScreen[];
  total: number;
  answers: Record<string, string>;
  finished: boolean;
  submitted: boolean;
  left: boolean;
  leftReason: string | null;
  deadline: string | null;
  remainingSec: number | null;
  paused: boolean;
  serverNow: string;
};

export type DraftItem = {
  itemId: string;
  cardId: string;
  blockNo: number;
  format: ExamFormat;
  direction: string | null;
  prompt: string;
  answer: string;
  options: string[] | null;
  difficulty: Difficulty;
  points: number;
  extra: Record<string, unknown>;
};

export type BuildStep = { key: string; title: string; detail: string };
export type BuildWarning = { code: string; text: string };

export type ExamDraft = {
  sessionId: string;
  status: string;
  /** Код входа: только у открытого экзамена (не у черновика) */
  code?: string | null;
  durationSec: number;
  config: Record<string, unknown> | null;
  items: DraftItem[];
  steps?: BuildStep[];
  warnings?: BuildWarning[];
  counts?: Record<ExamFormat, number>;
  levels?: Record<Difficulty, number>;
  recommended?: { baseSec: number; sec: number; minutes: number };
  pointsPerWord?: number;
  screens?: number;
  backKind?: 'translation' | 'definition';
  difficultySource?: 'class' | 'exams' | 'text';
  replacedItemId?: string;
  sameLevel?: boolean;
  /** Веб-кабинет: сколько вопросов «вставь слово» ждут ИИ (api/_ai/exam-gap.js) */
  aiPending?: number;
};

export type ResultStudent = {
  participantId: string;
  userId: string;
  name: string;
  initials: string;
  score: number;
  computedScore: number;
  overridden: boolean;
  comment: string | null;
  counts: Record<Verdict, number>;
  finished: boolean;
  leftReason: string | null;
  awayCount: number;
  flags: string[];
};

export type ResultWord = {
  itemId: string;
  cardId: string;
  format: ExamFormat;
  prompt: string;
  answer: string;
  voided: boolean;
  accepted: string[];
  answered: number;
  correct: number;
  wrong: number;
  suspicious: boolean;
};

export type ExamResults = {
  sessionId: string;
  status: string;
  setTitle: string;
  date: string;
  released: boolean;
  durationSec: number;
  totalQuestions: number;
  avgScore: number;
  distribution: { label: string; n: number }[];
  students: ResultStudent[];
  words: ResultWord[];
  absent: { userId: string; name: string }[];
};

export type Simulation = {
  rows: { participantId: string; name: string; from: number; to: number }[];
  unchanged: string[];
  avgFrom: number;
  avgTo: number;
};

export type QuestionReview = {
  item: {
    itemId: string;
    format: ExamFormat;
    direction: string | null;
    prompt: string;
    answer: string;
    options: string[] | null;
    voided: boolean;
    accepted: string[];
    kept: boolean;
    number: number;
  };
  stats: { answered: number; correct: number; wrong: number };
  groups: { text: string; count: number; names: string[]; verdict: Verdict }[];
  hints: { code: string; text: string; suggest?: 'void' | 'accept' | 'keep'; answer?: string }[];
  actions: { void: Simulation | null; accept: (Simulation & { answer: string }) | null };
  decisions: { logId: string; action: string; payload: Record<string, unknown>; at: string }[];
};

export type ReviewItem = {
  itemId: string;
  cardId: string | null;
  format: ExamFormat;
  prompt: string;
  answer: string;
  given: string | null;
  verdict: Verdict;
  accepted: boolean;
  voided: boolean;
  points: number;
};

export type StudentReview = {
  released: boolean;
  setTitle: string;
  date?: string;
  score?: number;
  counts?: Record<Verdict, number>;
  byFormat?: Partial<Record<ExamFormat, { total: number; correct: number }>>;
  comment?: string | null;
  items?: ReviewItem[];
};

export type ExamStudentCard = StudentReview & {
  participantId: string;
  userId: string;
  name: string;
  override: number | null;
  comment: string | null;
  leftReason: string | null;
  awayCount: number;
  finished: boolean;
  extraSec: number;
  preparation: {
    days: number;
    reviews: number;
    reviewDays: number;
    classReviews: number;
    classReviewDays: number;
  };
};

export type MyExam = {
  sessionId: string;
  setTitle: string;
  courseTitle: string | null;
  date: string;
  released: boolean;
  score: number | null;
};

/** Строка списка экзаменов учителя (веб-кабинет, Web 12): любой статус, в том числе черновик */
export type ExamListItem = {
  sessionId: string;
  courseId: string | null;
  courseTitle: string | null;
  setTitle: string | null;
  status: 'draft' | 'waiting' | 'active' | 'finished' | string;
  code: string | null;
  questionCount: number;
  durationSec: number;
  createdAt: string;
  finishedAt: string | null;
  participantCount: number;
  avgScore: number;
};

/** Событие журнала экзамена (веб-кабинет, Web 22); сервер: api/_exam/events.js */
export type ExamEvent = {
  id: string;
  kind:
    | 'old_version'
    | 'away'
    | 'back'
    | 'paused'
    | 'resumed'
    | 'extra_time'
    | 'reinstated'
    | string;
  userId: string | null;
  name: string;
  detail: Record<string, unknown>;
  at: string;
};

export type ExamResult<T> = { ok: boolean; status: number; data: T; error?: string };

async function callExam<T>(
  action: string,
  method: 'GET' | 'POST',
  payload: Record<string, unknown> = {}
): Promise<ExamResult<T>> {
  const token = await getAccessToken();
  if (!token) return { ok: false, status: 401, data: {} as T, error: 'Not authenticated' };
  const query: Record<string, string> = { action };
  if (method === 'GET') {
    for (const [k, v] of Object.entries(payload)) if (v !== undefined) query[k] = String(v);
  }
  const qs = Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  try {
    const res = await rawApiFetch(`test?${qs}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(method === 'POST' ? { body: payload } : {}),
    });
    let data: any = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    return { ok: res.ok, status: res.status, data, error: res.ok ? undefined : data?.error };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: {} as T,
      error: e instanceof Error ? e.message : 'Network request failed',
    };
  }
}

export const ExamApi = {
  build: (body: Record<string, unknown>) => callExam<ExamDraft>('exam-build', 'POST', body),
  draft: (sessionId: string) => callExam<ExamDraft>('exam-draft', 'GET', { sessionId }),
  replace: (sessionId: string, itemId: string) =>
    callExam<ExamDraft>('exam-replace-item', 'POST', { sessionId, itemId }),
  /** Веб-кабинет: все экзамены учителя (движок 2), новые первыми */
  list: (courseId?: string) =>
    callExam<ExamListItem[]>('exam-list', 'GET', courseId ? { courseId } : {}),
  /** Веб-кабинет: журнал событий (вход со старой версией, выходы, пауза, +время) */
  events: (sessionId: string) =>
    callExam<{ events: ExamEvent[] }>('exam-events', 'GET', { sessionId }),
  /** Веб-кабинет: правка неверных вариантов и предложения «вставь слово» в черновике */
  editItem: (
    sessionId: string,
    itemId: string,
    patch: {
      distractors?: string[];
      sentence?: string;
      source?: 'ai';
      doubtful?: boolean;
    }
  ) =>
    callExam<ExamDraft & { editedItemId: string }>('exam-edit-item', 'POST', {
      sessionId,
      itemId,
      ...patch,
    }),
  create: (sessionId: string, durationSec?: number, exitControl?: boolean) =>
    callExam<{ sessionId: string; code: string; questionCount: number; durationSec: number }>(
      'exam-create',
      'POST',
      { sessionId, durationSec, exitControl }
    ),
  state: (participantId: string) => callExam<ExamState>('exam-state', 'POST', { participantId }),
  answer: (participantId: string, itemId: string, response: string, timeSpentSec?: number) =>
    callExam<{
      ok: boolean;
      answered: number;
      total: number;
      deadline?: boolean;
      paused?: boolean;
    }>('exam-answer', 'POST', { participantId, itemId, response, timeSpentSec }),
  submit: (participantId: string) =>
    callExam<StudentReview & { submitted: boolean }>('exam-submit', 'POST', { participantId }),
  pause: (sessionId: string, paused: boolean) =>
    callExam<{ paused: boolean }>('exam-pause', 'POST', { sessionId, paused }),
  extraTime: (sessionId: string, userId: string, minutes = 2) =>
    callExam<{ extraSec: number }>('exam-extra-time', 'POST', { sessionId, userId, minutes }),
  results: (sessionId: string) => callExam<ExamResults>('exam-results', 'GET', { sessionId }),
  question: (sessionId: string, itemId: string) =>
    callExam<QuestionReview>('exam-question', 'GET', { sessionId, itemId }),
  decide: (
    sessionId: string,
    itemId: string,
    decision: 'void' | 'accept' | 'keep',
    answer?: string
  ) => callExam<{ logId: string }>('exam-decide', 'POST', { sessionId, itemId, decision, answer }),
  override: (sessionId: string, participantId: string, score: number | null, comment?: string) =>
    callExam<{ logId: string }>('exam-override', 'POST', {
      sessionId,
      participantId,
      score,
      comment,
    }),
  undo: (sessionId: string, logId: string) =>
    callExam<{ ok: boolean }>('exam-undo', 'POST', { sessionId, logId }),
  release: (sessionId: string) =>
    callExam<{ releasedAt: string }>('exam-release', 'POST', { sessionId }),
  student: (sessionId: string, participantId: string) =>
    callExam<ExamStudentCard>('exam-student', 'GET', { sessionId, participantId }),
  homework: (sessionId: string, dueAt: string) =>
    callExam<{
      created: { name: string; words: number }[];
      failed: { name: string; reason: string }[];
    }>('exam-homework', 'POST', { sessionId, dueAt }),
  retake: (sessionId: string) =>
    callExam<{ sessionId: string }>('exam-retake', 'POST', { sessionId }),
  my: () => callExam<MyExam[]>('exam-my', 'GET'),
  myOne: (sessionId: string) => callExam<StudentReview>('exam-my', 'GET', { sessionId }),
};
