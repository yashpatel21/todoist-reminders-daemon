import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import rrule from 'rrule'
import { analyzeAdvanceDecision, resolveAdvanceTarget } from './advance-target.js'
import { buildRRuleFromDueString } from './recurrence-parser.js'

describe('resolveAdvanceTarget', () => {
	const zone = 'America/New_York'
	const windowMs = 300_000

	it('returns today’s daily slot when still within grace before that occurrence', () => {
		const current = DateTime.fromObject(
			{ year: 2026, month: 4, day: 19, hour: 21, minute: 55 },
			{ zone },
		)
		const now = DateTime.fromObject(
			{ year: 2026, month: 4, day: 20, hour: 21, minute: 51 },
			{ zone },
		)
		const rule = buildRRuleFromDueString('every day', current)
		expect(rule).not.toBeNull()

		const target = resolveAdvanceTarget(current, now, rule!, windowMs)
		expect(target).not.toBeNull()
		expect(target!.setZone(zone).toFormat('yyyy-LL-dd HH:mm')).toBe('2026-04-20 21:55')
	})

	it('returns null before the grace window opens', () => {
		const current = DateTime.fromObject(
			{ year: 2026, month: 4, day: 19, hour: 21, minute: 55 },
			{ zone },
		)
		const now = DateTime.fromObject(
			{ year: 2026, month: 4, day: 20, hour: 21, minute: 40 },
			{ zone },
		)
		const rule = buildRRuleFromDueString('every day', current)
		expect(resolveAdvanceTarget(current, now, rule!, windowMs)).toBeNull()
		expect(analyzeAdvanceDecision(current, now, rule!, windowMs).kind).toBe(
			'before_grace_window',
		)
	})

	it('fast-forwards hourly recurrence to the slot near now when far overdue', () => {
		const current = DateTime.fromObject(
			{ year: 2026, month: 4, day: 22, hour: 20, minute: 30 },
			{ zone },
		)
		const now = DateTime.fromObject(
			{ year: 2026, month: 4, day: 25, hour: 15, minute: 26 },
			{ zone },
		)
		const rule = buildRRuleFromDueString('every hour', current)
		expect(rule).not.toBeNull()

		const target = resolveAdvanceTarget(current, now, rule!, windowMs)
		expect(target).not.toBeNull()
		expect(target!.setZone(zone).toFormat('yyyy-LL-dd HH:mm')).toBe('2026-04-25 15:30')
	})

	it('hourly advances as soon as overdue (no grace wait); wall +1 hour for next slot', () => {
		const current = DateTime.fromISO('2026-04-30T17:47:00.000-04:00')
		const rule = buildRRuleFromDueString('every hour', current)
		expect(rule).not.toBeNull()

		const midHour = DateTime.fromISO('2026-04-30T17:52:00.000-04:00')
		const midDecision = analyzeAdvanceDecision(current, midHour, rule!, windowMs)
		expect(midDecision.kind).toBe('advance')
		if (midDecision.kind === 'advance') {
			expect(midDecision.target.toISO()).toBe('2026-04-30T18:47:00.000-04:00')
		}
		expect(resolveAdvanceTarget(current, midHour, rule!, windowMs)?.toISO()).toBe(
			'2026-04-30T18:47:00.000-04:00',
		)

		const nearNext = DateTime.fromISO('2026-04-30T18:43:30.000-04:00')
		expect(resolveAdvanceTarget(current, nearNext, rule!, windowMs)?.toISO()).toBe(
			'2026-04-30T18:47:00.000-04:00',
		)
	})

	it('every N days advances with Luxon stepping (same wall time)', () => {
		const current = DateTime.fromObject(
			{ year: 2026, month: 4, day: 10, hour: 9, minute: 0 },
			{ zone },
		)
		const rule = buildRRuleFromDueString('every 5 days', current)
		expect(rule).not.toBeNull()
		const now = DateTime.fromObject(
			{ year: 2026, month: 4, day: 15, hour: 8, minute: 58 },
			{ zone },
		)
		expect(
			resolveAdvanceTarget(current, now, rule!, windowMs)?.toFormat('yyyy-LL-dd HH:mm'),
		).toBe('2026-04-15 09:00')
	})

	it('every N weeks preserves weekday and clock time', () => {
		const current = DateTime.fromObject(
			{ year: 2026, month: 4, day: 6, hour: 14, minute: 15 },
			{ zone },
		)
		const rule = buildRRuleFromDueString('every 2 weeks', current)
		expect(rule).not.toBeNull()
		const now = DateTime.fromObject(
			{ year: 2026, month: 4, day: 20, hour: 14, minute: 12 },
			{ zone },
		)
		expect(
			resolveAdvanceTarget(current, now, rule!, windowMs)?.toFormat('yyyy-LL-dd HH:mm'),
		).toBe('2026-04-20 14:15')
	})

	it('HOURLY + single echoed byminute (rrule normalization) still steps +1 hour, not rule.after()', () => {
		const current = DateTime.fromISO('2026-04-30T17:21:00.000-04:00')
		const rule = new rrule.RRule({
			freq: rrule.Frequency.HOURLY,
			interval: 1,
			dtstart: current.toJSDate(),
			tzid: zone,
			byminute: [21],
		})

		const midHour = analyzeAdvanceDecision(
			current,
			DateTime.fromISO('2026-04-30T18:10:00.000-04:00'),
			rule,
			windowMs,
		)
		expect(midHour.kind).toBe('advance')
		if (midHour.kind === 'advance') {
			expect(midHour.target.toISO()).toBe('2026-04-30T18:21:00.000-04:00')
		}

		const nearNext = DateTime.fromISO('2026-04-30T18:17:30.000-04:00')
		expect(resolveAdvanceTarget(current, nearNext, rule, windowMs)?.toISO()).toBe(
			'2026-04-30T18:21:00.000-04:00',
		)
	})

	it('every N hours with interval > 1', () => {
		const current = DateTime.fromISO('2026-04-30T10:00:00.000-04:00')
		const rule = buildRRuleFromDueString('every 3 hours', current)
		expect(rule).not.toBeNull()
		expect(rule!.options.interval).toBe(3)
		const now = DateTime.fromISO('2026-04-30T12:57:00.000-04:00')
		expect(resolveAdvanceTarget(current, now, rule!, windowMs)?.toISO()).toBe(
			'2026-04-30T13:00:00.000-04:00',
		)
	})

	it('every N days with interval > 1', () => {
		const current = DateTime.fromObject(
			{ year: 2026, month: 4, day: 5, hour: 8, minute: 0 },
			{ zone },
		)
		const rule = buildRRuleFromDueString('every 4 days', current)
		expect(rule).not.toBeNull()
		expect(rule!.options.interval).toBe(4)
		const now = DateTime.fromObject(
			{ year: 2026, month: 4, day: 9, hour: 7, minute: 57 },
			{ zone },
		)
		expect(resolveAdvanceTarget(current, now, rule!, windowMs)?.toFormat('yyyy-LL-dd HH:mm')).toBe(
			'2026-04-09 08:00',
		)
	})
})

describe('all-day recurrence (AdvanceDecisionOptions.allDay)', () => {
	const zone = 'America/New_York'
	const windowMs = 300_000
	const opts = { allDay: true as const }

	it('daily: still due today → not_overdue until next calendar day begins', () => {
		const current = DateTime.fromObject({ year: 2026, month: 5, day: 1 }, { zone }).startOf('day')
		const rule = buildRRuleFromDueString('every day', current)
		expect(rule).not.toBeNull()

		const may1_evening = DateTime.fromObject(
			{ year: 2026, month: 5, day: 1, hour: 23, minute: 59 },
			{ zone },
		)
		expect(analyzeAdvanceDecision(current, may1_evening, rule!, windowMs, opts).kind).toBe(
			'not_overdue',
		)

		const may2_just_after_midnight = DateTime.fromObject(
			{ year: 2026, month: 5, day: 2, hour: 0, minute: 1 },
			{ zone },
		)
		const a = analyzeAdvanceDecision(current, may2_just_after_midnight, rule!, windowMs, opts)
		expect(a.kind).toBe('advance')
		if (a.kind === 'advance') expect(a.target.toFormat('yyyy-LL-dd')).toBe('2026-05-02')
	})

	it('daily: catch-up to today’s calendar day when far overdue', () => {
		const current = DateTime.fromObject({ year: 2026, month: 5, day: 1 }, { zone }).startOf('day')
		const rule = buildRRuleFromDueString('every day', current)
		expect(rule).not.toBeNull()
		const now = DateTime.fromObject(
			{ year: 2026, month: 5, day: 10, hour: 14, minute: 0 },
			{ zone },
		)
		const target = resolveAdvanceTarget(current, now, rule!, windowMs, opts)
		expect(target?.toFormat('yyyy-LL-dd')).toBe('2026-05-10')
	})

	it('weekly: waits until anchor weekday on next week', () => {
		const current = DateTime.fromObject({ year: 2026, month: 1, day: 1 }, { zone }).startOf('day')
		const rule = buildRRuleFromDueString('every week', current)
		expect(rule).not.toBeNull()
		const jan7 = DateTime.fromObject({ year: 2026, month: 1, day: 7, hour: 12 }, { zone })
		expect(analyzeAdvanceDecision(current, jan7, rule!, windowMs, opts).kind).toBe('not_overdue')

		const jan8 = DateTime.fromObject({ year: 2026, month: 1, day: 8, hour: 9 }, { zone })
		const a = analyzeAdvanceDecision(current, jan8, rule!, windowMs, opts)
		expect(a.kind).toBe('advance')
		if (a.kind === 'advance') expect(a.target.toFormat('yyyy-LL-dd')).toBe('2026-01-08')
	})

	it('hourly recurrence with allDay flag is ignored (no advance)', () => {
		const current = DateTime.fromObject({ year: 2026, month: 5, day: 1, hour: 17 }, { zone })
		const rule = buildRRuleFromDueString('every hour', current)
		expect(rule).not.toBeNull()
		expect(rule!.options.freq).toBe(rrule.Frequency.HOURLY)
		expect(analyzeAdvanceDecision(current, current.plus({ hours: 2 }), rule!, windowMs, opts).kind).toBe(
			'not_overdue',
		)
	})
})
