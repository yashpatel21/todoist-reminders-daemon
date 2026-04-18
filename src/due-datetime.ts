import { DateTime } from 'luxon';
import type { Task } from '@doist/todoist-sdk';

/**
 * Todoist timed tasks expose `datetime`; date-only work lives in `date` without a time component.
 */
export function dueHasTime(due: NonNullable<Task['due']>): boolean {
  if (due.datetime != null && due.datetime !== '') return true;
  if (/\dT\d/.test(due.date)) return true;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}/.test(due.date)) return true;
  return false;
}

/**
 * Current occurrence wall time: prefer `datetime`, else parse `date`, in task or fallback zone.
 */
export function parseCurrentOccurrence(
  due: NonNullable<Task['due']>,
  fallbackZone: string,
): DateTime | null {
  const zone = due.timezone ?? fallbackZone;
  if (due.datetime) {
    const dt = DateTime.fromISO(due.datetime, { setZone: true });
    if (dt.isValid) return dt.setZone(zone);
  }
  let dt = DateTime.fromISO(due.date, { zone });
  if (!dt.isValid) {
    dt = DateTime.fromSQL(due.date, { zone });
  }
  return dt.isValid ? dt : null;
}

export function dueFingerprint(due: NonNullable<Task['due']>): string {
  return `${due.date}|${due.datetime ?? ''}|${due.string}`;
}

export function isSameDueSnapshot(a: Task['due'], b: Task['due']): boolean {
  if (!a || !b) return false;
  return a.date === b.date && (a.datetime ?? '') === (b.datetime ?? '');
}
