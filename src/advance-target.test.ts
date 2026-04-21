import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { resolveAdvanceTarget } from './advance-target.js';
import { buildRRuleFromDueString } from './recurrence-parser.js';

describe('resolveAdvanceTarget', () => {
  const zone = 'America/New_York';
  const windowMs = 300_000;

  it('returns today’s daily slot when still within grace before that occurrence', () => {
    const current = DateTime.fromObject(
      { year: 2026, month: 4, day: 19, hour: 21, minute: 55 },
      { zone },
    );
    const now = DateTime.fromObject(
      { year: 2026, month: 4, day: 20, hour: 21, minute: 51 },
      { zone },
    );
    const rule = buildRRuleFromDueString('every day', current);
    expect(rule).not.toBeNull();

    const target = resolveAdvanceTarget(current, now, rule!, windowMs);
    expect(target).not.toBeNull();
    expect(target!.setZone(zone).toFormat('yyyy-LL-dd HH:mm')).toBe('2026-04-20 21:55');
  });

  it('returns null before the grace window opens', () => {
    const current = DateTime.fromObject(
      { year: 2026, month: 4, day: 19, hour: 21, minute: 55 },
      { zone },
    );
    const now = DateTime.fromObject(
      { year: 2026, month: 4, day: 20, hour: 21, minute: 40 },
      { zone },
    );
    const rule = buildRRuleFromDueString('every day', current);
    expect(resolveAdvanceTarget(current, now, rule!, windowMs)).toBeNull();
  });

  it('fast-forwards hourly recurrence to the slot near now when far overdue', () => {
    const current = DateTime.fromObject(
      { year: 2026, month: 4, day: 22, hour: 20, minute: 30 },
      { zone },
    );
    const now = DateTime.fromObject(
      { year: 2026, month: 4, day: 25, hour: 15, minute: 26 },
      { zone },
    );
    const rule = buildRRuleFromDueString('every hour', current);
    expect(rule).not.toBeNull();

    const target = resolveAdvanceTarget(current, now, rule!, windowMs);
    expect(target).not.toBeNull();
    expect(target!.setZone(zone).toFormat('yyyy-LL-dd HH:mm')).toBe('2026-04-25 15:30');
  });
});
