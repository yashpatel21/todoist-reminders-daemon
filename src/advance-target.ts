import { DateTime } from 'luxon';
import type { RRule } from 'rrule';

const MAX_STEPS = 1_000_000;

/**
 * Given a stored occurrence `current` (still shown on the task) and `now`, find the
 * recurrence instant `target` we should roll the task to.
 *
 * Walks forward along the series: if `now` is before the grace window for the next
 * occurrence, returns null. If `now` is inside [target - window, target), returns that
 * `target`. If `now` is at or after `target`, skips ahead until an occurrence matches
 * (so long-overdue hourly/daily tasks catch up to the slot anchored on `now`).
 */
export function resolveAdvanceTarget(
  current: DateTime,
  now: DateTime,
  rule: RRule,
  advanceWindowMs: number,
): DateTime | null {
  if (!(current < now)) return null;

  let tJs = rule.after(current.toJSDate(), false);
  if (!tJs) return null;

  let t = DateTime.fromJSDate(tJs, { zone: current.zone });

  for (let step = 0; step < MAX_STEPS; step++) {
    const graceStart = t.minus({ milliseconds: advanceWindowMs });

    if (now < graceStart) {
      return null;
    }

    if (now < t) {
      return t;
    }

    const nextJs = rule.after(t.toJSDate(), false);
    if (!nextJs) return null;

    const nextT = DateTime.fromJSDate(nextJs, { zone: current.zone });
    if (+nextT === +t) {
      return null;
    }
    t = nextT;
  }

  return null;
}
