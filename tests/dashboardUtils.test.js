import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDashboardDate,
  getPendingEventTasks,
  toDashboardIsoDate,
} from '../src/dashboardUtils.js';

test('dashboard dates convert Jalali and ISO dates without mistaking Gregorian years for Jalali', () => {
  assert.equal(toDashboardIsoDate('۱۴۰۵/۰۷/۰۱'), '2026-09-23');
  assert.equal(toDashboardIsoDate('2026-10-24'), '2026-10-24');
  assert.equal(formatDashboardDate('2026-10-24'), '۱۴۰۵/۰۸/۰۲');
  assert.equal(toDashboardIsoDate('invalid'), '');
});

test('dashboard event tasks include only pending tasks and prioritize overdue events', () => {
  const tasks = [
    { id: 1, event_id: 'future', title: 'کار آینده', completed: false },
    { id: 2, event_id: 'overdue', title: 'کار عقب‌افتاده', completed: false, assignee: 'علی' },
    { id: 3, event_id: 'future', title: 'کار انجام‌شده', completed: true },
    { id: 4, event_id: 'missing', title: 'کار بدون مراسم', completed: false },
  ];
  const events = [
    { id: 'future', event_date: '2026-11-12', customer_name: 'مریم', event_type: 'عروسی' },
    { id: 'overdue', event_date: '2026-11-03', customer_name: 'رضا', event_type: 'عقد' },
  ];

  assert.deepEqual(
    getPendingEventTasks(tasks, events, '2026-11-04').map((task) => task.id),
    [2, 1],
  );
  assert.equal(getPendingEventTasks(tasks, events, '2026-11-04')[0].customer_name, 'رضا');
});
