import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney } from '../src/numberUtils.js';

test('formats money with Persian digits and grouped thousands', () => {
  assert.equal(formatMoney(1250000), '۱٬۲۵۰٬۰۰۰ تومان');
  assert.equal(formatMoney(0), '۰ تومان');
  assert.equal(formatMoney(null, { nullText: 'توافقی' }), 'توافقی');
  assert.equal(formatMoney(12.345, { maximumFractionDigits: 3 }), '۱۲٫۳۴۵ تومان');
});
