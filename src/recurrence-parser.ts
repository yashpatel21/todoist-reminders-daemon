import { DateTime } from 'luxon';
import type { Frequency, RRule } from 'rrule';
import rrule from 'rrule';

const RRuleCtor = rrule.RRule;
const rrulestr = rrule.rrulestr;
const FrequencyEnum = rrule.Frequency;

const SUPPORTED_RECURRENCE_FREQ = new Set<Frequency>([
  FrequencyEnum.HOURLY,
  FrequencyEnum.DAILY,
  FrequencyEnum.WEEKLY,
  FrequencyEnum.MONTHLY,
  FrequencyEnum.YEARLY,
])

function recurrenceFreqSupported(freq: Frequency): boolean {
  return SUPPORTED_RECURRENCE_FREQ.has(freq)
}

function acceptParsedRule(rule: RRule): RRule | null {
  return recurrenceFreqSupported(rule.options.freq) ? rule : null
}

/**
 * Build an RRule anchored at Todoist's current occurrence, using the recurrence phrase from `due.string`.
 * Only **hourly, daily, weekly, monthly, and yearly** (incl. “every N …”) are supported; other frequencies
 * return null. Falls back to keyword inference when NLP parsing fails — Todoist NL is not guaranteed to map 1:1.
 */
export function buildRRuleFromDueString(
  recurrenceString: string,
  currentOccurrence: DateTime,
): RRule | null {
  const dtstart = currentOccurrence.toJSDate();
  const tzid = currentOccurrence.zoneName;

  const trimmed = recurrenceString.trim();
  if (!trimmed) return null;

  // Prefer keyword inference before rrule NLP. `fromText()`/`after()` with `tzid` and
  // JS `Date` UTC instants can shift the computed next occurrence (often hours off in
  // America/New_York). Our advance logic uses timezone-safe stepping for plain interval
  // rules when RRULE modifiers are trivial.
  if (preferKeywordInferenceOverFromText(trimmed)) {
    const inferred = inferFrequencyFromKeywords(trimmed, dtstart, tzid);
    if (inferred) return acceptParsedRule(inferred);
  }

  try {
    const parsed = RRuleCtor.fromText(trimmed);
    const rule = new RRuleCtor({
      ...parsed.origOptions,
      dtstart,
      tzid,
    });
    const ok = acceptParsedRule(rule);
    if (ok) return ok;
  } catch {
    // continue to fallbacks
  }

  const inferred = inferFrequencyFromKeywords(trimmed, dtstart, tzid);
  if (inferred) return acceptParsedRule(inferred);

  try {
    if (/^RRULE:/i.test(trimmed) || trimmed.includes('\nRRULE:')) {
      const rule = rrulestr(trimmed, { dtstart, tzid: tzid ?? undefined });
      return acceptParsedRule(rule);
    }
  } catch {
    return null;
  }

  return null;
}

/** Natural-language Todoist-ish phrases we map to FREQ + INTERVAL ourselves (avoid fromText tz bugs). */
function preferKeywordInferenceOverFromText(s: string): boolean {
  return (
    /\bevery!?\s*\d+\s+hours?\b/i.test(s) ||
    /\bevery\s+\d+\s+days?\b/i.test(s) ||
    /\bevery\s+\d+\s+weeks?\b/i.test(s) ||
    /\bevery\s+\d+\s+months?\b/i.test(s) ||
    /\bevery\s+\d+\s+years?\b/i.test(s) ||
    /\bevery\s+hour\b|\bhourly\b/i.test(s) ||
    /\b(daily|every\s+day|weekly|every\s+week|monthly|every\s+month|yearly|annually|every\s+year)\b/i.test(s)
  );
}

function inferFrequencyFromKeywords(
  text: string,
  dtstart: Date,
  tzid: string | null,
): RRule | null {
  const s = text.toLowerCase();
  let freq: Frequency | null = null;
  let interval = 1;

  const hourMatch = s.match(/\bevery!?\s*(\d+)\s+hours?\b/i);
  if (hourMatch) {
    freq = FrequencyEnum.HOURLY;
    interval = Number.parseInt(hourMatch[1] ?? '1', 10) || 1;
  } else if (/\bevery\s+hour\b|\bhourly\b/i.test(s)) {
    freq = FrequencyEnum.HOURLY;
  } else {
    const dayMatch = s.match(/\bevery\s+(\d+)\s+days?\b/i);
    if (dayMatch) {
      freq = FrequencyEnum.DAILY;
      interval = Number.parseInt(dayMatch[1] ?? '1', 10) || 1;
    }
  }
  if (!freq) {
    const weekMatch = s.match(/\bevery\s+(\d+)\s+weeks?\b/i);
    if (weekMatch) {
      freq = FrequencyEnum.WEEKLY;
      interval = Number.parseInt(weekMatch[1] ?? '1', 10) || 1;
    }
  }
  if (!freq) {
    const monthMatch = s.match(/\bevery\s+(\d+)\s+months?\b/i);
    if (monthMatch) {
      freq = FrequencyEnum.MONTHLY;
      interval = Number.parseInt(monthMatch[1] ?? '1', 10) || 1;
    }
  }
  if (!freq) {
    const yearMatch = s.match(/\bevery\s+(\d+)\s+years?\b/i);
    if (yearMatch) {
      freq = FrequencyEnum.YEARLY;
      interval = Number.parseInt(yearMatch[1] ?? '1', 10) || 1;
    }
  }
  if (!freq && /\b(daily|every\s+day)\b/i.test(s)) {
    freq = FrequencyEnum.DAILY;
  } else if (!freq && /\b(weekly|every\s+week)\b/i.test(s)) {
    freq = FrequencyEnum.WEEKLY;
  } else if (!freq && /\b(monthly|every\s+month)\b/i.test(s)) {
    freq = FrequencyEnum.MONTHLY;
  } else if (!freq && /\b(yearly|annually|every\s+year)\b/i.test(s)) {
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
