import { describe, it, expect } from 'vitest';
import {
  projectDay,
  unprojectPx,
  generateTicks,
  chooseSnapLevel,
  snapDay,
  stepDay,
  type AxisView,
} from '../../src/calendar/TimelineAxis';
import { fromAbsolute, toAbsolute } from '../../src/calendar/CalendarEngine';
import { GREGORIAN_CALENDAR } from '../../src/calendar/builtins';
import type { CalendarSystem } from '../../src/calendar/types';
import { CALENDAR_SCHEMA_VERSION } from '../../src/calendar/types';

const G = GREGORIAN_CALENDAR;

describe('TimelineAxis — projection', () => {
  const view: AxisView = { startDay: 1000, endDay: 2000, widthPx: 500 };

  it('projects edges and midpoint linearly', () => {
    expect(projectDay(1000, view)).toBe(0);
    expect(projectDay(2000, view)).toBe(500);
    expect(projectDay(1500, view)).toBe(250);
  });

  it('unproject inverts project', () => {
    for (const day of [1000, 1234, 1750, 2000]) {
      expect(unprojectPx(projectDay(day, view), view)).toBeCloseTo(day, 6);
    }
  });
});

describe('TimelineAxis — Gregorian tick generation', () => {
  const dayOf = (y: number, m: number, d: number) =>
    toAbsolute(G, { year: y, month: m - 1, day: d }).absoluteDay;

  it('uses year granularity for a multi-century span, with nice steps', () => {
    const view: AxisView = {
      startDay: dayOf(1800, 1, 1),
      endDay: dayOf(2000, 1, 1),
      widthPx: 1000,
    };
    const ticks = generateTicks(G, view);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((t) => t.level === 'year')).toBe(true);
    expect(ticks.length).toBeLessThanOrEqual(12);
    // Consecutive year ticks are evenly spaced on a single "nice" step.
    const years = ticks.map((t) => parseInt(t.label));
    const step = years[1] - years[0];
    expect([1, 2, 5, 10, 20, 25, 50, 100]).toContain(step);
    for (let i = 1; i < years.length; i++) {
      expect(years[i] - years[i - 1]).toBe(step);
      expect(years[i] % step).toBe(0);
    }
  });

  it('year labels carry the epoch label and align to Jan 1', () => {
    const view: AxisView = {
      startDay: dayOf(2000, 1, 1),
      endDay: dayOf(2010, 1, 1),
      widthPx: 800,
    };
    const ticks = generateTicks(G, view);
    const t2005 = ticks.find((t) => t.label.startsWith('2005'));
    expect(t2005?.label).toBe('2005 CE');
    expect(t2005?.absoluteDay).toBe(dayOf(2005, 1, 1));
  });

  it('uses month granularity within a single year', () => {
    const view: AxisView = {
      startDay: dayOf(2024, 1, 1),
      endDay: dayOf(2024, 12, 31),
      widthPx: 1200,
    };
    const ticks = generateTicks(G, view);
    expect(ticks.every((t) => t.level === 'month')).toBe(true);
    expect(ticks.map((t) => t.label)).toContain('March');
    // First tick sits at the left edge, projected to x=0.
    expect(ticks[0].x).toBeCloseTo(0, 6);
  });

  it('uses day granularity for a sub-month span', () => {
    const view: AxisView = {
      startDay: dayOf(2024, 3, 1),
      endDay: dayOf(2024, 3, 20),
      widthPx: 600,
    };
    const ticks = generateTicks(G, view);
    expect(ticks.every((t) => t.level === 'day')).toBe(true);
    expect(ticks[0].label).toBe('Mar 1');
    expect(ticks.some((t) => t.label === '15')).toBe(true);
  });

  it('keeps month context when a day-level view starts mid-month and crosses a boundary', () => {
    const view: AxisView = {
      startDay: dayOf(2024, 3, 12),
      endDay: dayOf(2024, 4, 8),
      widthPx: 900,
    };
    const ticks = generateTicks(G, view);
    expect(ticks[0].label).toBe('Mar 12');
    expect(ticks.find(tick => tick.absoluteDay === dayOf(2024, 4, 1))?.label).toBe('Apr 1');
    expect(ticks.find(tick => tick.absoluteDay === dayOf(2024, 3, 13))?.label).toBe('13');
  });

  it('uses hour ticks when zoomed inside a day', () => {
    const start = toAbsolute(G, { year: 2024, month: 2, day: 1, unitOfDay: 8 * 60 }).absoluteDay;
    const ticks = generateTicks(G, { startDay: start, endDay: start + 12 / 24, widthPx: 900 });
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every((tick) => tick.level === 'hour')).toBe(true);
    expect(ticks.some((tick) => tick.label === '12:00')).toBe(true);
  });

  it('uses minute ticks at the closest zoom level', () => {
    const start = toAbsolute(G, { year: 2024, month: 2, day: 1, unitOfDay: 10 * 60 }).absoluteDay;
    const ticks = generateTicks(G, { startDay: start, endDay: start + 30 / 1440, widthPx: 900 });
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every((tick) => tick.level === 'minute')).toBe(true);
    expect(ticks.some((tick) => tick.label === '10:15')).toBe(true);
  });

  it('keeps every tick inside the view window', () => {
    const view: AxisView = {
      startDay: dayOf(1950, 6, 15),
      endDay: dayOf(2050, 6, 15),
      widthPx: 900,
    };
    for (const t of generateTicks(G, view)) {
      expect(t.absoluteDay).toBeGreaterThanOrEqual(view.startDay);
      expect(t.absoluteDay).toBeLessThanOrEqual(view.endDay);
    }
  });
});

describe('TimelineAxis — custom-calendar ticks', () => {
  // 40-day year (4 months x 10 days), epoch offset, no leap.
  const FANTASY: CalendarSystem = {
    schemaVersion: CALENDAR_SCHEMA_VERSION,
    id: 'axis-fantasy',
    name: 'Fantasy Forty',
    baseUnit: 'day',
    unitsPerDay: 1,
    epochAbsoluteDay: 0,
    epochLabel: 'AF',
    months: [
      { name: 'Frost', days: 10 },
      { name: 'Bloom', days: 10 },
      { name: 'Blaze', days: 10 },
      { name: 'Fade', days: 10 },
    ],
  };

  it('emits native month names, not Gregorian ones', () => {
    // One full 40-day year -> month granularity.
    const start = toAbsolute(FANTASY, { year: 5, month: 0, day: 1 }).absoluteDay;
    const view: AxisView = { startDay: start, endDay: start + 40, widthPx: 400 };
    const ticks = generateTicks(FANTASY, view);
    expect(ticks.every((t) => t.level === 'month')).toBe(true);
    expect(ticks.map((t) => t.label)).toEqual(['Frost', 'Bloom', 'Blaze', 'Fade']);
  });

  it('year ticks respect the 40-day year length', () => {
    const start = toAbsolute(FANTASY, { year: 1, month: 0, day: 1 }).absoluteDay;
    const view: AxisView = { startDay: start, endDay: start + 40 * 10, widthPx: 800 };
    const ticks = generateTicks(FANTASY, view);
    expect(ticks.every((t) => t.level === 'year')).toBe(true);
    // Year 2 begins exactly 40 days after year 1.
    const y2 = ticks.find((t) => t.label === '2 AF');
    expect(y2?.absoluteDay).toBe(start + 40);
  });

  it('uses fantasy month names for day-level context', () => {
    const start = toAbsolute(FANTASY, { year: 5, month: 0, day: 7 }).absoluteDay;
    const view: AxisView = { startDay: start, endDay: start + 9, widthPx: 500 };
    const ticks = generateTicks(FANTASY, view);
    expect(ticks[0].label).toBe('Frost 7');
    expect(ticks.find(tick => tick.label === 'Bloom 1')).toBeDefined();
  });
});

describe('TimelineAxis — snap resolution', () => {
  const dayOf = (y: number, m: number, d: number) =>
    toAbsolute(G, { year: y, month: m - 1, day: d }).absoluteDay;

  // Uneven months plus a leap rule, so nothing here can pass by assuming a
  // fixed unit length.
  const UNEVEN: CalendarSystem = {
    schemaVersion: CALENDAR_SCHEMA_VERSION,
    id: 'axis-uneven',
    name: 'Uneven',
    baseUnit: 'day',
    unitsPerDay: 1,
    epochAbsoluteDay: 0,
    months: [
      { name: 'Short', days: 7 },
      { name: 'Long', days: 33 },
      { name: 'Middling', days: 20 },
    ],
    leapRule: { everyYears: 4, monthIndex: 0, extraDays: 1 },
  };

  describe('chooseSnapLevel', () => {
    it('snaps by day inside a single month', () => {
      const view: AxisView = { startDay: dayOf(2024, 3, 1), endDay: dayOf(2024, 3, 20), widthPx: 600 };
      expect(chooseSnapLevel(G, view)).toBe('day');
    });

    it('does not follow the axis up to year level just because the labels did', () => {
      const view: AxisView = { startDay: dayOf(2020, 1, 1), endDay: dayOf(2024, 1, 1), widthPx: 1000 };
      expect(generateTicks(G, view).every(t => t.level === 'year')).toBe(true);
      // Matching the labels would let an event land only on Jan 1.
      expect(chooseSnapLevel(G, view)).toBe('month');
    });

    it('falls back to months once days are narrower than the cursor', () => {
      const view: AxisView = { startDay: dayOf(1990, 1, 1), endDay: dayOf(2000, 1, 1), widthPx: 900 };
      expect(chooseSnapLevel(G, view)).toBe('month');
    });

    it('falls back to years for a very long view', () => {
      const view: AxisView = { startDay: dayOf(0, 1, 1), endDay: dayOf(5000, 1, 1), widthPx: 900 };
      expect(chooseSnapLevel(G, view)).toBe('year');
    });

    it('reads unit widths off the calendar, so identical views differ by calendar', () => {
      const base = { ...UNEVEN, leapRule: undefined };
      const tiny: CalendarSystem = { ...base, months: [{ name: 'A', days: 3 }, { name: 'B', days: 3 }] };
      const huge: CalendarSystem = { ...base, months: [{ name: 'A', days: 500 }, { name: 'B', days: 500 }] };
      const view: AxisView = { startDay: 0, endDay: 900, widthPx: 900 };
      // Same window, same pixels. A 3-day month is too narrow to aim at, so the
      // tiny calendar skips past month level; the 500-day one settles there.
      expect(chooseSnapLevel(tiny, view)).toBe('year');
      expect(chooseSnapLevel(huge, view)).toBe('month');
    });
  });

  describe('snapDay', () => {
    it('is idempotent at every level', () => {
      for (const level of ['day', 'month', 'year'] as const) {
        for (const cal of [G, UNEVEN]) {
          for (const day of [-4000.3, -1, 0, 0.5, 733.25, 12345.9, 738000.1]) {
            const once = snapDay(cal, day, level);
            expect(snapDay(cal, once, level)).toBe(once);
          }
        }
      }
    });

    it('lands on whole days at day level', () => {
      for (const day of [-10.4, 0.5, 733.25, 12345.9]) {
        expect(Number.isInteger(snapDay(G, day, 'day'))).toBe(true);
      }
    });

    it('always lands on the first of a month at month level', () => {
      for (const cal of [G, UNEVEN]) {
        for (let day = -200; day < 900; day += 7) {
          const snapped = snapDay(cal, day + 0.4, 'month');
          expect(fromAbsolute(cal, { absoluteDay: snapped }).day).toBe(1);
        }
      }
    });

    it('always lands on the first day of a year at year level', () => {
      for (const cal of [G, UNEVEN]) {
        for (let day = -500; day < 2000; day += 37) {
          const date = fromAbsolute(cal, { absoluteDay: snapDay(cal, day, 'year') });
          expect(date.month).toBe(0);
          expect(date.day).toBe(1);
        }
      }
    });

    it('never moves a value further than the period it sits in', () => {
      for (let day = 0; day < 4000; day += 13) {
        const snapped = snapDay(G, day, 'month');
        expect(Math.abs(snapped - day)).toBeLessThanOrEqual(31);
      }
    });

    it('honours variable month length around a leap February', () => {
      // Feb 15.5 is past the midpoint of a 28-day February but not of a 29-day one.
      expect(snapDay(G, dayOf(2023, 2, 15) + 0.5, 'month')).toBe(dayOf(2023, 3, 1));
      expect(snapDay(G, dayOf(2024, 2, 15) + 0.5, 'month')).toBe(dayOf(2024, 2, 1));
    });
  });

  describe('stepDay', () => {
    it('steps by the real length of the month it leaves', () => {
      expect(stepDay(G, dayOf(2024, 2, 1), 'month', 1) - dayOf(2024, 2, 1)).toBe(29);
      expect(stepDay(G, dayOf(2023, 2, 1), 'month', 1) - dayOf(2023, 2, 1)).toBe(28);
      expect(stepDay(UNEVEN, toAbsolute(UNEVEN, { year: 3, month: 1, day: 1 }).absoluteDay, 'month', 1)
        - toAbsolute(UNEVEN, { year: 3, month: 1, day: 1 }).absoluteDay).toBe(33);
    });

    it('rolls over the year boundary in both directions', () => {
      const last = toAbsolute(UNEVEN, { year: 6, month: 2, day: 1 }).absoluteDay;
      const next = fromAbsolute(UNEVEN, { absoluteDay: stepDay(UNEVEN, last, 'month', 1) });
      expect([next.year, next.month, next.day]).toEqual([7, 0, 1]);

      const first = toAbsolute(UNEVEN, { year: 6, month: 0, day: 1 }).absoluteDay;
      const previous = fromAbsolute(UNEVEN, { absoluteDay: stepDay(UNEVEN, first, 'month', -1) });
      expect([previous.year, previous.month, previous.day]).toEqual([5, 2, 1]);
    });

    it('is reversible at day and month level', () => {
      for (const cal of [G, UNEVEN]) {
        for (const level of ['day', 'month', 'year'] as const) {
          for (const day of [0, 733, 12345]) {
            expect(stepDay(cal, stepDay(cal, day, level, 1), level, -1)).toBe(snapDay(cal, day, level));
          }
        }
      }
    });

    it('always moves in the requested direction', () => {
      for (const level of ['day', 'month', 'year'] as const) {
        for (let day = 0; day < 3000; day += 97) {
          expect(stepDay(G, day, level, 1)).toBeGreaterThan(snapDay(G, day, level));
          expect(stepDay(G, day, level, -1)).toBeLessThan(snapDay(G, day, level));
        }
      }
    });
  });
});
