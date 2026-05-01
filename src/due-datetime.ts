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
 * Current occurrence: timed tasks use instant from `datetime` / dated time; date-only dues
 * normalize to **start of that calendar day** in the due / fallback zone.
 */
export function parseCurrentOccurrence(
  due: NonNullable<Task['due']>,
  fallbackZone: string,
): DateTime | null {
  const zone = due.timezone ?? fallbackZone;
  if (dueHasTime(due)) {
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
  let dt = DateTime.fromISO(due.date, { zone });
  if (!dt.isValid) {
    dt = DateTime.fromSQL(due.date, { zone });
  }
  return dt.isValid ? dt.startOf('day') : null;
}

export function dueFingerprint(due: NonNullable<Task['due']>): string {
  return `${due.date}|${due.datetime ?? ''}|${due.string}`;
}

export function isSameDueSnapshot(a: Task['due'], b: Task['due']): boolean {
  if (!a || !b) return false;
  const aDatetime = a.datetime ?? '';
  const bDatetime = b.datetime ?? '';
  if (aDatetime || bDatetime) {
    if (!aDatetime || !bDatetime) return false;
    const aIso = DateTime.fromISO(aDatetime, { setZone: true });
    const bIso = DateTime.fromISO(bDatetime, { setZone: true });
    if (aIso.isValid && bIso.isValid) {
      return aIso.toUTC().toMillis() === bIso.toUTC().toMillis();
    }
    return aDatetime === bDatetime;
  }
  return a.date === b.date;
}
