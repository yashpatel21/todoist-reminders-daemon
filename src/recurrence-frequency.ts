/** True if the recurrence text plausibly describes an hourly/minutely pattern (unsupported for date-only dues). */
export function recurrenceLooksSubDaily(s: string): boolean {
	return /\bevery!?\s*\d*\s*hours?\b|\bhourly\b|\bevery\s+hour\b|\bevery\s+minute\b|\bminutely\b|\bevery\s+\d+\s+minutes?\b/i.test(
		s,
	)
}
