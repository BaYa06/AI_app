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
