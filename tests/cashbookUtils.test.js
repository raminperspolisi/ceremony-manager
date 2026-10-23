import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAccountBalances,
  formatJalaliDate,
  getInvoicePaymentStatus,
  parseJalaliDate,
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
