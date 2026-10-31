import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateInvoiceItemsTotal,
  getInvoiceItemDetails,
  getInvoiceItems,
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
