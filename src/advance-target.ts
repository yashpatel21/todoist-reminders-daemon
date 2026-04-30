import { DateTime } from 'luxon'
import type { RRule } from 'rrule'
import rrule from 'rrule'

const Frequency = rrule.Frequency
const MAX_STEPS = 1_000_000

function byweekdayIsSet(wd: unknown): boolean {
	if (wd == null) return false
	if (Array.isArray(wd)) return wd.length > 0
	return true
}

/**
 * Structural BY* pins (beyond FREQ+INTERVAL). **Not** dtstart echoes: `rrule` often sets
 * `byhour` / `byminute` / `bysecond` to single-element lists; treating those as “complex”
 * forced `rule.after()` and produced +~4h next times in eastern zones.
 */
function rruleUsesByModifiers(rule: RRule): boolean {
	const o = rule.options
	const nonEmptyArr = (x: unknown) => Array.isArray(x) && x.length > 0

	if (byweekdayIsSet(o.byweekday)) return true
	if (nonEmptyArr(o.bynmonthday)) return true
	if (nonEmptyArr(o.bymonth) || nonEmptyArr(o.byyearday) || nonEmptyArr(o.bysetpos)) return true

	if (Array.isArray(o.byhour) && o.byhour.length > 1) return true
	if (Array.isArray(o.byminute) && o.byminute.length > 1) return true
	if (Array.isArray(o.bysecond) && o.bysecond.length > 1) return true
	if (Array.isArray(o.bymonthday) && o.bymonthday.length > 1) return true

	return false
}

/**
 * Todoist-style “every N {minutes,hours,days,...}”: Luxon stepping for plain intervals.
 * Real constraints (BYDAY, two BYHOURs, nth weekday patterns, …) use `rule.after()`.
 */
function isPlainIntervalRule(rule: RRule): boolean {
	return !rruleUsesByModifiers(rule)
}

/**
 * Next step for plain interval rules using wall time in `anchor`'s zone (DST-safe via Luxon).
 */
function luxonStepPlainInterval(rule: RRule, anchor: DateTime): DateTime | null {
	const { freq, interval } = rule.options
	const every = interval && interval >= 1 ? interval : 1

	switch (freq) {
		case Frequency.SECONDLY:
			return anchor.plus({ seconds: every })
		case Frequency.MINUTELY:
			return anchor.plus({ minutes: every })
		case Frequency.HOURLY:
			return anchor.plus({ hours: every })
		case Frequency.DAILY:
			return anchor.plus({ days: every })
		case Frequency.WEEKLY:
			return anchor.plus({ weeks: every })
		case Frequency.MONTHLY:
			return anchor.plus({ months: every })
		case Frequency.YEARLY:
			return anchor.plus({ years: every })
		default:
			return null
	}
}

/**
 * After `anchor`, next occurrence: Luxon stepping for plain “every N units” rules;
 * otherwise `rule.after()` for complex recurrence text.
 */
function occurrenceAfterAnchored(rule: RRule, anchor: DateTime): DateTime | null {
	if (isPlainIntervalRule(rule)) {
		const next = luxonStepPlainInterval(rule, anchor)
		if (next) return next
	}

	const tJs = rule.after(anchor.toJSDate(), false)
	if (!tJs) return null
	return DateTime.fromJSDate(tJs, { zone: anchor.zone })
}

export type AdvanceAnalysis =
	| { kind: 'not_overdue' }
	| { kind: 'no_next_occurrence' }
	| { kind: 'before_grace_window'; next: DateTime; graceStart: DateTime }
	| { kind: 'advance'; target: DateTime }
	| { kind: 'stuck_duplicate_next' }

/**
 * Explains whether we would advance, or why not (advance window, recurrence end, etc.).
 * Used for SCHEDULE_DIAG and for asserting resolveAdvanceTarget.
 */
export function analyzeAdvanceDecision(
	current: DateTime,
	now: DateTime,
	rule: RRule,
	advanceWindowMs: number,
): AdvanceAnalysis {
	if (!(current < now)) return { kind: 'not_overdue' }

	let t = occurrenceAfterAnchored(rule, current)
	if (!t) return { kind: 'no_next_occurrence' }

	for (let step = 0; step < MAX_STEPS; step++) {
		const graceStart = t.minus({ milliseconds: advanceWindowMs })

		if (now < graceStart) {
			return { kind: 'before_grace_window', next: t, graceStart }
		}

		if (now < t) {
			return { kind: 'advance', target: t }
		}

		const nextT = occurrenceAfterAnchored(rule, t)
		if (!nextT) return { kind: 'no_next_occurrence' }

		if (nextT.toMillis() === t.toMillis()) {
			return { kind: 'stuck_duplicate_next' }
		}
		t = nextT
	}

	return { kind: 'no_next_occurrence' }
}

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
	const a = analyzeAdvanceDecision(current, now, rule, advanceWindowMs)
	return a.kind === 'advance' ? a.target : null
}
