import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAccountBalances,
  formatJalaliDate,
  getInvoicePaymentStatus,
  maskCardNumber,
  normalizeCardNumber,
  parseJalaliDate,
  summarizeCashTransactions,
} from '../src/cashbookUtils.js';

test('Jalali date input is converted to an ISO date and formatted back', () => {
  const isoDate = parseJalaliDate('۱۴۰۵/۰۷/۰۱');
  assert.ok(isoDate);
  assert.equal(formatJalaliDate(isoDate), '۱۴۰۵/۰۷/۰۱');
  assert.equal(parseJalaliDate('۱۴۰۵/۱۳/۰۱'), null);
});

test('account balances apply income, expenses, and internal transfers correctly', () => {
  const balances = calculateAccountBalances(
    [
      { id: 1, opening_balance: 1000 },
      { id: 2, opening_balance: 250 },
    ],
    [
      { transaction_type: 'income', account_id: 1, amount: 500 },
      { transaction_type: 'expense', account_id: 1, amount: 200 },
      { transaction_type: 'transfer', account_id: 1, transfer_to_account_id: 2, amount: 300 },
    ],
  );

  assert.equal(balances.get('1'), 1000);
  assert.equal(balances.get('2'), 550);
  assert.equal([...balances.values()].reduce((sum, balance) => sum + balance, 0), 1550);
});

test('invoice payment status follows the amount already received', () => {
  assert.equal(getInvoicePaymentStatus(0, 100), 'unpaid');
  assert.equal(getInvoicePaymentStatus(0, 0), 'unpaid');
  assert.equal(getInvoicePaymentStatus(40, 100), 'deposit_paid');
  assert.equal(getInvoicePaymentStatus(100, 100), 'paid');
});

test('bank card numbers normalize Persian digits and are masked for display', () => {
  assert.equal(normalizeCardNumber('۶۱۰۴-۳۳۷۷ ۰۱۲۳ ۴۵۶۷'), '6104337701234567');
  assert.equal(normalizeCardNumber('123456789'), null);
  assert.equal(maskCardNumber('6104337701234567'), '•••• •••• •••• ۴۵۶۷');
});

test('cashbook period summary totals income, expenses, and transfer amounts by date', () => {
  const summary = summarizeCashTransactions([
    { transaction_type: 'income', amount: 100, transaction_date: '2026-10-01' },
    { transaction_type: 'expense', amount: 25, transaction_date: '2026-10-15' },
    { transaction_type: 'transfer', amount: 50, transaction_date: '2026-10-15' },
    { transaction_type: 'income', amount: 500, transaction_date: '2026-11-01' },
  ], '2026-10-01', '2026-10-31');

  assert.deepEqual(summary, { income: 100, expenses: 25, transfers: 50 });
});
