import { DateTime } from 'luxon';

/**
 * Advance only when the current stored occurrence is stale and `now` sits in
 * [next - window, next).
 */
export function shouldAdvance(
  now: DateTime,
  currentOccurrence: DateTime,
  nextOccurrence: DateTime,
  advanceWindowMs: number,
): boolean {
  if (currentOccurrence >= now) return false;
  const windowStart = nextOccurrence.minus({ milliseconds: advanceWindowMs });
  return now >= windowStart && now < nextOccurrence;
}
