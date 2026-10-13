'use strict';
// Date helpers pinned to one time zone (America/New_York by default), so
// "today", follow-ups, and daily notes don't depend on the computer's setting.

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function zoned(date, tz) {
  const parts = {};
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short',
  });
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
    hour: Number(hour),
    minute: Number(parts.minute),
    weekday: parts.weekday.slice(0, 3).toLowerCase(),
  };
}

function makeClock(tz, now = () => new Date()) {
  return {
    tz,
    now,
    today: () => zoned(now(), tz).date,
    parts: (d = now()) => zoned(d, tz),
  };
}

// Pure calendar arithmetic on YYYY-MM-DD strings (no time zone involved).
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

function isMonth(s) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || ''));
}

function monthLabel(ym) {
  if (!isMonth(ym)) return String(ym || '');
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// The n most recent *complete* months before the month containing `todayIso`,
// oldest first. monthsBefore('2026-10-13', 3) -> ['2026-07','2026-08','2026-09'].
function monthsBefore(todayIso, n) {
  const [y, m] = todayIso.split('-').map(Number);
  const out = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

module.exports = { WEEKDAYS, zoned, makeClock, addDays, daysBetween, isMonth, monthLabel, monthsBefore };
