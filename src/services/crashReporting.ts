/**
 * Отчёты о падениях: в веб-версии не собираются (Crashlytics — только нативный SDK).
 *
 * В нативном приложении Metro берёт crashReporting.native.ts с тем же API.
 */

export function initCrashReporting() {}

export function setCrashUserId(_userId: string | null) {}

export function reportError(_error: Error, _context?: string) {}
