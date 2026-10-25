import { addDays, daysBetween, relativeDay, shiftYears, todayIso } from './dates';

describe('dates', () => {
  it('uses the local calendar date, not UTC', () => {
    expect(todayIso(new Date(2026, 11, 3, 0, 30))).toBe('2026-12-03');
    expect(todayIso(new Date(2026, 11, 3, 23, 30))).toBe('2026-12-03');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-10-23', '2026-12-01')).toBe(39);
    expect(daysBetween('2026-12-01', '2026-10-23')).toBe(-39);
  });

  it('shifts years keeping month and day', () => {
    expect(shiftYears('2026-12-03', -2)).toBe('2024-12-03');
  });

  it('describes relative days', () => {
    expect(relativeDay('2026-12-01', '2026-12-01')).toBe('сегодня');
    expect(relativeDay('2026-12-02', '2026-12-01')).toBe('завтра');
    expect(relativeDay('2026-12-06', '2026-12-01')).toBe('через 5 дн.');
    expect(relativeDay('2026-11-28', '2026-12-01')).toBe('3 дн. назад');
  });
});
