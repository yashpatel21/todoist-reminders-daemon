import { DateTime } from 'luxon';
import type { Frequency, RRule } from 'rrule';
import rrule from 'rrule';

const RRuleCtor = rrule.RRule;
const rrulestr = rrule.rrulestr;
const FrequencyEnum = rrule.Frequency;

/**
 * Build an RRule anchored at Todoist's current occurrence, using the recurrence phrase from `due.string`.
 * Falls back to keyword inference when NLP parsing fails — Todoist NL is not guaranteed to map 1:1.
 */
export function buildRRuleFromDueString(
  recurrenceString: string,
  currentOccurrence: DateTime,
): RRule | null {
  const dtstart = currentOccurrence.toJSDate();
  const tzid = currentOccurrence.zoneName;

  const trimmed = recurrenceString.trim();
  if (!trimmed) return null;

  try {
    const parsed = RRuleCtor.fromText(trimmed);
    return new RRuleCtor({
      ...parsed.origOptions,
      dtstart,
      tzid,
    });
  } catch {
    // continue to fallbacks
  }

  const inferred = inferFrequencyFromKeywords(trimmed, dtstart, tzid);
  if (inferred) return inferred;

  try {
    if (/^RRULE:/i.test(trimmed) || trimmed.includes('\nRRULE:')) {
      return rrulestr(trimmed, { dtstart, tzid: tzid ?? undefined });
    }
  } catch {
    return null;
  }

  return null;
}

function inferFrequencyFromKeywords(
  text: string,
  dtstart: Date,
  tzid: string | null,
): RRule | null {
  const s = text.toLowerCase();
  let freq: Frequency | null = null;
  let interval = 1;

  const hourMatch = s.match(/\bevery\s+(\d+)\s+hours?\b/i);
  if (hourMatch) {
    freq = FrequencyEnum.HOURLY;
    interval = Number.parseInt(hourMatch[1] ?? '1', 10) || 1;
  } else if (/\bevery\s+hour\b|\bhourly\b/i.test(s)) {
    freq = FrequencyEnum.HOURLY;
  } else if (/\b(daily|every\s+day)\b/i.test(s)) {
    freq = FrequencyEnum.DAILY;
  } else if (/\b(weekly|every\s+week)\b/i.test(s)) {
    freq = FrequencyEnum.WEEKLY;
  } else if (/\b(monthly|every\s+month)\b/i.test(s)) {
    freq = FrequencyEnum.MONTHLY;
  } else if (/\b(yearly|annually|every\s+year)\b/i.test(s)) {
    freq = FrequencyEnum.YEARLY;
  }

  if (freq === null) return null;

  return new RRuleCtor({
    freq,
    interval,
    dtstart,
    tzid: tzid ?? undefined,
  });
}
