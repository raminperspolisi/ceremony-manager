import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDashboardDate, toDashboardIsoDate } from '../src/dashboardUtils.js';

test('dashboard dates convert Jalali and ISO dates without mistaking Gregorian years for Jalali', () => {
  assert.equal(toDashboardIsoDate('۱۴۰۵/۰۷/۰۱'), '2026-09-23');
  assert.equal(toDashboardIsoDate('2026-10-24'), '2026-10-24');
  assert.equal(formatDashboardDate('2026-10-24'), '۱۴۰۵/۰۸/۰۲');
  assert.equal(toDashboardIsoDate('invalid'), '');
});
