import { DateTime } from 'luxon';
import { parse, isValid } from 'date-fns';

export type ParsedPrecision = 'year' | 'month' | 'day' | 'time';

export interface ParseOptions {
  forwardDate?: boolean;
  timezone?: string | number; // e.g. 'America/New_York' or minute offset
  locale?: string; // for Luxon formatting in UI
  /** Reference date for relative parsing (e.g., "next Friday"). Defaults to system today. */
  referenceDate?: Date;
}

export interface ParsedEventDate {
  start?: DateTime;
  end?: DateTime;
  precision?: ParsedPrecision;
  approximate?: boolean;
  error?: string;
}

const APPROX_RE = /(circa|around|about|approx|~|approx\.)/i;

function inferPrecisionFromLuxon(dt: DateTime): ParsedPrecision {
  // If time components present
  if (dt.hour !== 0 || dt.minute !== 0 || dt.second !== 0 || dt.millisecond !== 0) return 'time';
  if (dt.day !== 1) return 'day';
  if (dt.month !== 1) return 'month';
  return 'year';
}

function inferPrecisionFromPattern(pattern: string): ParsedPrecision {
  if (/[HhKkms]/.test(pattern)) return 'time';
  if (/[dD]/.test(pattern)) return 'day';
  if (/[ML]/.test(pattern)) return 'month';
  return 'year';
}

/** Try Luxon ISO first, then SQL, then era-aware parsing, then ad-hoc formats. */
export function parseEventDate(input?: string, opts: ParseOptions = {}): ParsedEventDate {
  if (!input || !input.trim()) return { error: 'empty' };
  const text = input.trim();
  const approximate = APPROX_RE.test(text);

  // 1) ISO
  const iso = DateTime.fromISO(text, { zone: opts.timezone as any });
  if (iso.isValid) {
    return { start: iso, precision: inferPrecisionFromLuxon(iso), approximate };
  }

  // 2) SQL
  const sql = DateTime.fromSQL(text, { zone: opts.timezone as any });
  if (sql.isValid) {
    return { start: sql, precision: inferPrecisionFromLuxon(sql), approximate };
  }

  // 3) Era tokens (BC/BCE/AD/CE)
  if (/\b(bc|bce|ad|ce)\b/i.test(text)) {
    const norm = text.replace(/\bBCE?\b/gi, 'BC').replace(/\bCE\b/gi, 'AD');
    const patterns = ['yyyy G', 'd MMM yyyy G', 'd MMMM yyyy G'];
    for (const pattern of patterns) {
      const js = parse(norm, pattern, new Date());
      if (isValid(js)) {
        const start = DateTime.fromJSDate(js, { zone: opts.timezone as any });
        return { start, precision: inferPrecisionFromPattern(pattern), approximate };
      }
    }
  }

  // 4) Few common ad-hoc formats
  const candidates = ['yyyy-MM', 'yyyy', 'LLL dd yyyy', 'LLLL dd yyyy'];
  for (const fmt of candidates) {
    const dt = DateTime.fromFormat(text, fmt, { zone: opts.timezone as any });
    if (dt.isValid) return { start: dt, precision: inferPrecisionFromPattern(fmt), approximate };
  }

  return { error: 'unparsed' };
}

export function toDisplay(dt?: DateTime, locale?: string): string {
  if (!dt) return '';
  const v = locale ? dt.setLocale(locale) : dt;
  return v.toLocaleString(DateTime.DATETIME_MED_WITH_WEEKDAY);
}

export function toMillis(dt?: DateTime): number | undefined {
  return dt?.toMillis();
}


