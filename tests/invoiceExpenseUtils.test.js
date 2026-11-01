import test from 'node:test';
import assert from 'node:assert/strict';
import { getInvoiceExpenses, sumInvoiceExpenses } from '../src/invoiceExpenseUtils.js';

test('sums only positive finite invoice expenses', () => {
  assert.equal(sumInvoiceExpenses([
    { amount: '120000' },
    { amount: 80000 },
    { amount: 0 },
    { amount: -10 },
    { amount: 'invalid' },
    {},
  ]), 200000);
});

test('returns zero when an invoice has no expenses', () => {
  assert.equal(sumInvoiceExpenses([]), 0);
});

test('selects only the expenses attached to the requested invoice', () => {
  const expenses = [
    { id: 1, invoice_id: 12, amount: 100 },
    { id: 2, invoice_id: '13', amount: 200 },
    { id: 3, invoice_id: '12', amount: 300 },
  ];

  assert.deepEqual(getInvoiceExpenses(expenses, '12').map((expense) => expense.id), [1, 3]);
});
