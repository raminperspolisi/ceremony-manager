import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPersianDate, toAsciiDigits } from '../src/dateUtils.js';

test('formats Gregorian dates as Persian-calendar dates with Persian digits', () => {
  assert.equal(formatPersianDate('2026-10-31'), '۱۴۰۵/۰۸/۰۹');
  assert.equal(formatPersianDate(''), '—');
  assert.equal(formatPersianDate('invalid'), '—');
});

test('normalizes Persian date-picker digits for database date values', () => {
  assert.equal(toAsciiDigits('۲۰۲۶-۱۰-۳۱'), '2026-10-31');
});
