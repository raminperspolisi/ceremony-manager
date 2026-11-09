import test from 'node:test';
import assert from 'node:assert/strict';
import { formatGroupedNumber, normalizeNumber, parseNumericInput } from '../src/numberUtils.js';

test('formats large values with Persian digits and groups of three', () => {
  assert.equal(formatGroupedNumber('3000000'), '۳٬۰۰۰٬۰۰۰');
  assert.equal(formatGroupedNumber('1234567.89'), '۱٬۲۳۴٬۵۶۷.۸۹');
});

test('normalizes Persian digits and grouped input before saving', () => {
  assert.equal(normalizeNumber('۳٬۰۰۰٬۰۰۰', false), '3000000');
  assert.equal(normalizeNumber('۱٬۲۳۴٫۵', true), '1234.5');
  assert.equal(parseNumericInput('۱٬۲۳۴٬۵۶۷'), 1234567);
  assert.equal(parseNumericInput('١٬٢٣٤'), 1234);
  assert.equal(parseNumericInput('۰'), 0);
});

test('supports signed quantity adjustments without changing positive inputs', () => {
  assert.equal(normalizeNumber('-۲٬۰۰۰', true, true), '-2000');
  assert.equal(normalizeNumber('-۲٬۰۰۰', true), '2000');
});
