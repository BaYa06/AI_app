/**
 * Общие запросы по курсам для backend-эндпоинтов (api/teacher.js, api/progress.js).
 * Файл начинается с "_", поэтому Vercel не публикует его как отдельный роут.
 */

/**
 * id наборов курса для статистики: собственные наборы курса (card_sets.course_id) + официальные
 * наборы юнитов книг (каталог книг), которые учитель хоть раз открывал в этом курсе. Закрытый
 * после прохождения юнит остаётся в статистике. Вкладывается в другие запросы (композиция
 * шаблонов @neondatabase/serverless 1.x).
 */
export function courseSetIdsSql(sql, courseId) {
  return sql`
    SELECT id FROM card_sets WHERE course_id = ${courseId}::uuid
    UNION
    SELECT ocs.id
    FROM course_units cu
    JOIN book_units u ON u.id = cu.unit_id
    JOIN course_books cb ON cb.course_id = cu.course_id AND cb.book_id = u.book_id
    JOIN card_sets ocs ON ocs.unit_id = u.id AND ocs.is_official = true
    WHERE cu.course_id = ${courseId}::uuid AND cu.opened_at IS NOT NULL
  `;
}

/**
 * Наборы курса, которые видит ученик: наборы учителя (кроме скрытых) и открытые юниты учебника.
 * Доступ (членство в курсе) проверяет вызывающий. Используют api/teacher.js и api/data.js (bootstrap).
 */
export async function courseSetsForStudent(sql, courseId) {
  const rows = await sql`
    SELECT
      cs.*,
      (SELECT COUNT(*) FROM cards WHERE set_id = cs.id) AS total_cards
    FROM card_sets cs
    WHERE cs.course_id = ${courseId}::uuid
      AND cs.is_hidden_from_students = false
    ORDER BY cs.created_at DESC
  `;

  // Официальные наборы книг курса (каталог книг): только открытые учителем юниты опубликованных книг.
  // У таких наборов course_id = NULL — к курсу они привязаны через course_books/course_units.
  const officialRows = await sql`
    SELECT cs.*, b.id AS book_id, b.title AS book_title, u.number AS unit_number,
      (SELECT COUNT(*) FROM cards WHERE set_id = cs.id) AS total_cards
    FROM course_units cu
    JOIN book_units u ON u.id = cu.unit_id
    JOIN books b ON b.id = u.book_id AND b.is_published = true
    JOIN course_books cb ON cb.course_id = cu.course_id AND cb.book_id = b.id
    JOIN card_sets cs ON cs.unit_id = u.id AND cs.is_official = true
    WHERE cu.course_id = ${courseId}::uuid AND cu.is_open = true
    ORDER BY b.title, u.sort_order, u.number, cs.created_at
  `;

  return [...rows, ...officialRows].map((row) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      description: row.description || '',
      category: row.category || '',
      icon: row.icon || null,
      languageFrom: row.language_from || 'de',
      languageTo: row.language_to || 'ru',
      totalCards: parseInt(row.total_cards, 10) || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at || null,
      // Официальный набор в курс попадает через план юнитов — отдаём его под этим курсом.
      courseId: row.is_official ? courseId : row.course_id,
      isOfficial: row.is_official === true,
      unitId: row.unit_id || null,
      bookId: row.book_id || null,
      bookTitle: row.book_title || null,
      unitNumber: row.unit_number ?? null,
    }));
}
