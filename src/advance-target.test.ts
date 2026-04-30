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

	it('hourly EDT next step is wall +1 hour (fixes rrule.after + tz shifting +4h)', () => {
		const current = DateTime.fromISO('2026-04-30T17:47:00.000-04:00')
		const rule = buildRRuleFromDueString('every hour', current)
		expect(rule).not.toBeNull()

		const beforeGrace = DateTime.fromISO('2026-04-30T17:52:00.000-04:00')
		const gated = analyzeAdvanceDecision(current, beforeGrace, rule!, windowMs)
		expect(gated.kind).toBe('before_grace_window')
		if (gated.kind === 'before_grace_window') {
			expect(gated.next.toISO()).toBe('2026-04-30T18:47:00.000-04:00')
			expect(gated.graceStart.toISO()).toBe('2026-04-30T18:42:00.000-04:00')
		}

		const inWindow = DateTime.fromISO('2026-04-30T18:43:30.000-04:00')
		expect(resolveAdvanceTarget(current, inWindow, rule!, windowMs)?.toISO()).toBe(
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

		const beforeGrace = analyzeAdvanceDecision(
			current,
			DateTime.fromISO('2026-04-30T18:10:00.000-04:00'),
			rule,
			windowMs,
		)
		expect(beforeGrace.kind).toBe('before_grace_window')
		if (beforeGrace.kind === 'before_grace_window') {
			expect(beforeGrace.next.toISO()).toBe('2026-04-30T18:21:00.000-04:00')
		}

		const inWindow = DateTime.fromISO('2026-04-30T18:17:30.000-04:00')
		expect(resolveAdvanceTarget(current, inWindow, rule, windowMs)?.toISO()).toBe(
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
