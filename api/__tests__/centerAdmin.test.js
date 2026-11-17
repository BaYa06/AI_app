/**
 * Коды, логины и вкладка «Центры» админки (plan/new/center_books.md, Center 8).
 */
import { describe, expect, it } from '@jest/globals';
import {
  CODE_MAX,
  isValidLogin,
  makeCenterCode,
  makeTempPassword,
  suggestLogin,
  suggestPrefix,
} from '../_handlers/center/codes.js';
import { assignBook, createCenter } from '../_handlers/center/admin.js';

const BOOK = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';

/** Подставной sql: пишет запросы, отвечает по первому совпавшему правилу. */
function fakeSql(rules) {
  const queries = [];
  const sql = (strings, ...values) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    queries.push({ text, values });
    const rule = rules.find(([re]) => re.test(text));
    return Promise.resolve(rule ? rule[1](values) : []);
  };
  sql.transaction = async (list) => Promise.all(list);
  return { sql, queries };
}

describe('начало кода и логин из названия', () => {
  it('берёт первое настоящее слово, не «школа» и не «English»', () => {
    expect(suggestPrefix('Alfa English Center')).toBe('ALFA');
    expect(suggestPrefix('Международная школа языков Lingua')).toBe('LINGUA');
    expect(suggestPrefix('Школа английского «Оксфорд»')).toBe('OKSFORD');
    expect(suggestLogin('Alfa English Center')).toBe('alfa');
  });

  it('короткое слово добирает первыми буквами, пустое — null', () => {
    expect(suggestPrefix('IQ Language School')).toBe('IQL');
    expect(suggestPrefix('IQ Kids Academy')).toBe('IQK');
    expect(suggestPrefix('—')).toBeNull();
  });

  it('логин: латиница, цифры, дефис внутри', () => {
    expect(isValidLogin('alfa')).toBe(true);
    expect(isValidLogin('alfa-2')).toBe(true);
    expect(isValidLogin('Alfa')).toBe(false);
    expect(isValidLogin('al')).toBe(false);
    expect(isValidLogin('-alfa')).toBe(false);
  });
});

describe('код центра', () => {
  it('НАЧАЛО-МЕТКА-ХВОСТ, хвост всегда, не длиннее 14', () => {
    const code = makeCenterCode('ALFA', 'DEC');
    expect(code).toMatch(/^ALFA-DEC-[2-9A-HJKMNP-Z]{4}$/);
    for (const prefix of ['ABC', 'LINGUA', 'ABCDEFGH']) {
      for (const label of ['', 'DEC', 'GROUPA']) {
        const c = makeCenterCode(prefix, label);
        expect(c.length).toBeLessThanOrEqual(CODE_MAX);
        expect(c.startsWith(`${prefix}-`)).toBe(true);
        // Хвост — минимум 3 знака: перебором не угадать
        expect(c.split('-').pop().length).toBeGreaterThanOrEqual(3);
        // Подходит под правило кода центра в приложении (src/utils/centerCode.ts)
        expect(c).toMatch(/^[A-Z0-9]+-[A-Z0-9-]*[A-Z0-9]$/);
      }
    }
  });

  it('длинное начало укорачивает метку', () => {
    expect(makeCenterCode('ABCDEFGH', 'DEC')).toMatch(/^ABCDEFGH-D-[A-Z0-9]{3}$/);
  });

  it('плохое начало — ошибка', () => {
    expect(() => makeCenterCode('AB')).toThrow('bad_prefix');
  });

  it('временный пароль — 12 знаков группами', () => {
    expect(makeTempPassword()).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  });
});

describe('привязка книги к центру', () => {
  const bookRow = (over) => [
    { id: BOOK, organization_id: null, is_published: true, learners: 0, courses: 0, ...over },
  ];

  it('книгу уже учат — без подтверждения ничего не меняет', async () => {
    const { sql, queries } = fakeSql([
      [/FROM books b WHERE b.id/, () => bookRow({ learners: 42, courses: 3 })],
      [/FROM organizations WHERE id/, () => [{ 1: 1 }]],
    ]);
    const res = await assignBook(sql, { bookId: BOOK, orgId: ORG, position: 1 });
    expect(res).toEqual({ needConfirm: true, learners: 42, courses: 3, wasPublic: true });
    expect(queries.some((q) => /^UPDATE books/.test(q.text))).toBe(false);
  });

  it('с подтверждением — привязывает и ставит порядок', async () => {
    const { sql, queries } = fakeSql([
      [/FROM books b WHERE b.id/, () => bookRow({ learners: 42 })],
      [/FROM organizations WHERE id/, () => [{ 1: 1 }]],
    ]);
    expect(await assignBook(sql, { bookId: BOOK, orgId: ORG, position: 2, confirm: true })).toEqual(
      { ok: true }
    );
    const update = queries.find((q) => /^UPDATE books/.test(q.text));
    expect(update.values.slice(0, 3)).toEqual([ORG, 2, BOOK]);
  });

  it('новая книга без учеников — сразу; смена только порядка — без подтверждения', async () => {
    const { sql } = fakeSql([
      [/FROM books b WHERE b.id/, () => bookRow({ organization_id: ORG, learners: 9 })],
      [/FROM organizations WHERE id/, () => [{ 1: 1 }]],
    ]);
    expect(await assignBook(sql, { bookId: BOOK, orgId: ORG, position: 3 })).toEqual({ ok: true });
  });

  it('кривой порядок — ошибка', async () => {
    const { sql } = fakeSql([]);
    await expect(assignBook(sql, { bookId: BOOK, orgId: ORG, position: 0 })).rejects.toThrow(
      'Порядок'
    );
  });
});

describe('создание центра', () => {
  const supaWith = (users = []) => {
    const calls = [];
    return {
      calls,
      auth: {
        admin: {
          listUsers: async () => ({ data: { users }, error: null }),
          createUser: async (p) => {
            calls.push(['create', p]);
            return { data: { user: { id: 'u-new', email: p.email } }, error: null };
          },
          updateUserById: async (id, p) => {
            calls.push(['update', id, p]);
            return { data: {}, error: null };
          },
          deleteUser: async (id) => {
            calls.push(['delete', id]);
            return { error: null };
          },
        },
      },
    };
  };
  const input = {
    name: 'Alfa English Center',
    login: 'alfa',
    seatLimit: 300,
    contractUntil: '2027-06-30',
  };

  it('создаёт логин, центр и владельца; пароль — временный', async () => {
    const supa = supaWith();
    const { sql, queries } = fakeSql([]);
    const res = await createCenter(sql, supa, input);
    expect(res.login).toBe('alfa');
    expect(res.codePrefix).toBe('ALFA');
    expect(supa.calls[0][1]).toMatchObject({
      email: 'alfa@center.flashlycards.app',
      email_confirm: true,
      user_metadata: { center: true, must_change_password: true },
    });
    expect(queries.some((q) => /INSERT INTO organization_members/.test(q.text))).toBe(true);
    const org = queries.find((q) => /INSERT INTO organizations/.test(q.text));
    expect(org.values).toContain('2027-06-30T23:59:59Z');
  });

  it('почта занята обычным пользователем — отказ, ничего не создано', async () => {
    const supa = supaWith([{ id: 'u1', email: 'alfa@center.flashlycards.app', user_metadata: {} }]);
    const { sql, queries } = fakeSql([]);
    await expect(createCenter(sql, supa, input)).rejects.toThrow('занята');
    expect(queries.some((q) => /INSERT/.test(q.text))).toBe(false);
  });

  it('аккаунт центра уже есть в Supabase (создан в другой базе) — новый пароль, тот же id', async () => {
    const supa = supaWith([
      { id: 'u-old', email: 'alfa@center.flashlycards.app', user_metadata: { center: true } },
    ]);
    const { sql, queries } = fakeSql([]);
    await createCenter(sql, supa, input);
    expect(supa.calls[0][0]).toBe('update');
    expect(queries.find((q) => /INSERT INTO users/.test(q.text)).values[0]).toBe('u-old');
  });

  it('база не приняла строки — созданный логин удаляется', async () => {
    const supa = supaWith();
    const { sql } = fakeSql([]);
    sql.transaction = async () => {
      throw new Error('db down');
    };
    await expect(createCenter(sql, supa, input)).rejects.toThrow('db down');
    expect(supa.calls.map((c) => c[0])).toEqual(['create', 'delete']);
  });
});
