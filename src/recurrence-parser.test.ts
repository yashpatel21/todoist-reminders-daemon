import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { buildRRuleFromDueString } from './recurrence-parser.js'

describe('buildRRuleFromDueString', () => {
	const zone = 'America/New_York'

	it('parses supported phrases', () => {
		const t = DateTime.fromObject({ year: 2026, month: 5, day: 1, hour: 12, minute: 0 }, { zone })
		expect(buildRRuleFromDueString('every hour', t)?.options.freq).toBeDefined()
		expect(buildRRuleFromDueString('every day', t)).not.toBeNull()
		expect(buildRRuleFromDueString('weekly', t)).not.toBeNull()
		expect(buildRRuleFromDueString('every 2 weeks', t)).not.toBeNull()
		expect(buildRRuleFromDueString('monthly', t)).not.toBeNull()
		expect(buildRRuleFromDueString('every year', t)).not.toBeNull()
	})

	it('returns null for minute-based recurrence (unsupported)', () => {
		const t = DateTime.fromObject({ year: 2026, month: 5, day: 1, hour: 12, minute: 0 }, { zone })
		expect(buildRRuleFromDueString('every minute', t)).toBeNull()
		expect(buildRRuleFromDueString('every 15 minutes', t)).toBeNull()
		expect(buildRRuleFromDueString('minutely', t)).toBeNull()
	})

	it('returns null when NLP would be sub-hourly (e.g. every 5 mins)', () => {
		const t = DateTime.fromObject({ year: 2026, month: 5, day: 1, hour: 12, minute: 0 }, { zone })
		expect(buildRRuleFromDueString('every 5 mins', t)).toBeNull()
	})
})
