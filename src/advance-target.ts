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
 * Todoist-style “every N {hours,days,...}”: Luxon stepping for plain intervals.
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

/** Hourly (every N hours) advances as soon as the current slot is overdue; other freqs use the grace window. */
function usesGraceWindowBeforeNext(rule: RRule): boolean {
	return rule.options.freq !== Frequency.HOURLY
}

export type AdvanceDecisionOptions = {
	/** Calendar-day recurrence (Todoist due date without time): advance at midnight of the next date. */
	allDay?: boolean
}

/** Date-only recurring tasks: hourly does not apply. */
function analyzeAdvanceDecisionAllDay(
	current: DateTime,
	now: DateTime,
	rule: RRule,
): AdvanceAnalysis {
	if (rule.options.freq === Frequency.HOURLY) {
		return { kind: 'not_overdue' }
	}

	const c = current.startOf('day')
	const next0 = occurrenceAfterAnchored(rule, c)
	if (!next0) return { kind: 'no_next_occurrence' }
	let t = next0.startOf('day')

	if (now < t) return { kind: 'not_overdue' }

	for (let step = 0; step < MAX_STEPS; step++) {
		if (now.startOf('day').toMillis() <= t.startOf('day').toMillis()) {
			return { kind: 'advance', target: t }
		}

		const stepNext = occurrenceAfterAnchored(rule, t)
		if (!stepNext) return { kind: 'no_next_occurrence' }
		const nextT = stepNext.startOf('day')
		if (nextT.toMillis() === t.toMillis()) return { kind: 'stuck_duplicate_next' }
		t = nextT
	}

	return { kind: 'no_next_occurrence' }
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
	opts?: AdvanceDecisionOptions,
): AdvanceAnalysis {
	if (opts?.allDay) {
		return analyzeAdvanceDecisionAllDay(current, now.setZone(current.zone), rule)
	}

	if (!(current < now)) return { kind: 'not_overdue' }

	let t = occurrenceAfterAnchored(rule, current)
	if (!t) return { kind: 'no_next_occurrence' }

	for (let step = 0; step < MAX_STEPS; step++) {
		const graceStart = t.minus({ milliseconds: advanceWindowMs })

		if (usesGraceWindowBeforeNext(rule) && now < graceStart) {
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
 * Walks forward along the series. For timed tasks: non-hourly use the grace window; hourly
 * advances as soon as overdue. For **`allDay`**, compares calendar days only (advance once
 * `now` is at or past midnight of the next occurrence, with catch-up for far-overdue dates).
 */
export function resolveAdvanceTarget(
	current: DateTime,
	now: DateTime,
	rule: RRule,
	advanceWindowMs: number,
	opts?: AdvanceDecisionOptions,
): DateTime | null {
	const a = analyzeAdvanceDecision(current, now, rule, advanceWindowMs, opts)
	return a.kind === 'advance' ? a.target : null
}
