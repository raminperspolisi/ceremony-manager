import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateInvoiceItemsTotal,
  getInvoiceItemDetails,
  getInvoiceItems,
  summarizeCeremonyProfit,
  summarizeInvoiceRevenue,
} from '../src/financialReportUtils.js';

test('invoice items use their selected price level and total only billable quantities', () => {
  assert.deepEqual(getInvoiceItemDetails({
    item_type: 'sale',
    price_level: '2',
    p1: 100,
    p2: 150,
    cost: 80,
    qty: 2,
  }), {
    category: 'sale',
    quantity: 2,
    unitPrice: 150,
    total: 300,
  });
  assert.equal(calculateInvoiceItemsTotal([
    { unit_price: 250, qty: 2 },
    { price: 100, qty: 1 },
  ]), 600);
});

test('invoice revenue is reported by known item category without calling revenue profit', () => {
  assert.deepEqual(summarizeInvoiceRevenue([
    {
      total_price: 700,
      items_json: [
        { item_type: 'اجاره‌ای', unit_price: 200, qty: 2 },
        { item_type: 'sale', unit_price: 100, cost: 80, qty: 1 },
      ],
    },
    { total_amount: 250, items_data: [] },
    {
      total_price: 50,
      items_data: [{ item_type: 'service', unit_price: 50, qty: 1 }],
    },
  ]), {
    totalRevenue: 1000,
    rentRevenue: 400,
    saleRevenue: 100,
    unclassifiedRevenue: 300,
  });
});

test('invoice items fall back to populated legacy data when the current array is empty', () => {
  assert.deepEqual(getInvoiceItems({
    items_data: [],
    items_json: [{ title: 'اجاره', item_type: 'rent' }],
  }), [{ title: 'اجاره', item_type: 'rent' }]);
});

test('ceremony profit groups multiple invoices and expenses without double-counting paid invoice costs', () => {
  const report = summarizeCeremonyProfit([
    { id: 8, customer_name: 'مراسم الف', event_date: '2026-11-08' },
    { id: 9, customer_name: 'مراسم ب' },
  ], [
    { id: 21, event_id: 8, total_price: 1000, items_data: [{ item_type: 'sale', qty: 1, total_cost: 200 }] },
    { id: 22, event_id: 8, total_price: 500, items_data: [] },
    { id: 23, total_price: 300, items_data: [] },
  ], [
    { id: 31, invoice_id: 21, amount: 100, cash_transaction_id: 51 },
    { id: 32, invoice_id: 22, amount: 50 },
    { id: 33, invoice_id: 23, amount: 30 },
  ], [
    { id: 51, transaction_type: 'expense', amount: 100, event_id: null },
    { id: 52, transaction_type: 'expense', amount: 80, event_id: 8 },
    { id: 53, transaction_type: 'expense', amount: 40, event_id: null },
    { id: 54, transaction_type: 'income', amount: 60, event_id: 8, invoice_id: null },
    { id: 55, transaction_type: 'income', amount: 200, event_id: null, invoice_id: 21 },
    { id: 56, transaction_type: 'transfer', amount: 500, event_id: null },
  ]);

  assert.deepEqual(report.rows, [{
    eventId: 8,
    eventName: 'مراسم الف',
    eventType: '',
    eventDate: '2026-11-08',
    invoiceCount: 2,
    revenue: 1560,
    invoiceExpenses: 150,
    otherExpenses: 80,
    goodsCost: 200,
    totalExpenses: 430,
    profit: 1130,
  }]);
  assert.deepEqual(report.totals, {
    revenue: 1860,
    expenses: 500,
    profit: 1360,
  });
  assert.deepEqual(report.unassigned, {
    revenue: 300,
    expenses: 70,
    profit: 230,
  });
});
