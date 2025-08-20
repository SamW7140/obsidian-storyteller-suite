import { describe, it, expect } from 'vitest';
import { parseEventDate, toMillis } from '../../src/utils/DateParsing';

describe('DateParsing', () => {
  it('parses ISO date', () => {
    const r = parseEventDate('2024-03-02');
    expect(r.error).toBeUndefined();
    expect(r.start).toBeDefined();
  });

  it('parses BCE year', () => {
    const r = parseEventDate('2000 BC');
    expect(r.error).toBeUndefined();
    expect(r.start).toBeDefined();
    expect(r.start?.year).toBe(-1999);
    expect(typeof toMillis(r.start)).toBe('number');
  });

  it('parses BCE day', () => {
    const r = parseEventDate('23 Mar 44 BCE');
    expect(r.error).toBeUndefined();
    expect(r.start).toBeDefined();
    expect(r.start?.year).toBe(-43);
    expect(r.start?.month).toBe(3);
    expect(r.start?.day).toBe(23);
    expect(typeof toMillis(r.start)).toBe('number');
  });

  it('returns error on empty', () => {
    const r = parseEventDate('');
    expect(r.error).toBe('empty');
  });
});
