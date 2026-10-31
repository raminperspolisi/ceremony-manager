import test from 'node:test';
import assert from 'node:assert/strict';
import { convertQuotationToInvoice, deleteSelectedDocuments, updateOfficialInvoice } from '../src/quotationInvoice.js';

test('conversion creates a linked invoice when no invoice exists', async () => {
  let inserted;
  const result = await convertQuotationToInvoice(
    {
      id: 12,
      customer_name: 'مشتری',
      total_price: 500,
      items_json: [{
        title: 'کالای اجاره‌ای',
        inventory_id: 81,
        item_type: 'rent',
        qty: 1,
        rental_checkout_date: '2026-11-01',
        rental_return_date: '2026-11-03',
      }],
    },
    {
      readTable: async () => ({ data: [], error: null }),
      insertRows: async (table, rows) => {
        inserted = { table, row: rows[0] };
        return { data: [rows[0]], error: null };
      },
    },
  );

  assert.equal(result.alreadyConverted, false);
  assert.equal(inserted.table, 'invoices');
  assert.equal(inserted.row.quotation_id, '12');
  assert.deepEqual(inserted.row.items_data, [{
    title: 'کالای اجاره‌ای',
    inventory_id: 81,
    item_type: 'rent',
    qty: 1,
    rental_checkout_date: '2026-11-01',
    rental_return_date: '2026-11-03',
  }]);
});

test('conversion does not insert a duplicate invoice', async () => {
  let insertCalled = false;
  const result = await convertQuotationToInvoice(
    { id: 12, customer_name: 'مشتری' },
    {
      readTable: async () => ({ data: [{ id: 40, quotation_id: '12' }], error: null }),
      insertRows: async () => {
        insertCalled = true;
        return { data: [], error: null };
      },
    },
  );

  assert.equal(result.alreadyConverted, true);
  assert.equal(result.invoice.id, 40);
  assert.equal(insertCalled, false);
});

test('bulk deletion groups quotation and official invoice IDs', async () => {
  const calls = [];
  await deleteSelectedDocuments(
    ['quotation-1', 'official-2'],
    [{ id: 1, type: 'quotation' }, { id: 2, type: 'official' }],
    { deleteRows: async (table, filters) => { calls.push({ table, filters }); return { error: null }; } },
  );

  assert.deepEqual(calls.map((call) => call.table), ['quotations', 'invoices']);
  assert.deepEqual(calls.map((call) => call.filters[0].value), [[1], [2]]);
});

test('invoice edit writes the supplied fields to the selected invoice', async () => {
  let call;
  await updateOfficialInvoice(40, { total_price: 900, payment_status: 'paid' }, {
    updateRows: async (...args) => {
      call = args;
      return { error: null };
    },
  });

  assert.deepEqual(call, [
    'invoices',
    { total_price: 900, payment_status: 'paid' },
    [{ column: 'id', operator: 'eq', value: 40 }],
  ]);
});

test('bulk deletion reports a partial result when the second table fails', async () => {
  await assert.rejects(
    deleteSelectedDocuments(
      ['quotation-1', 'official-2'],
      [{ id: 1, type: 'quotation' }, { id: 2, type: 'official' }],
      { deleteRows: async (table) => ({ error: table === 'invoices' ? { message: 'خطای سرور' } : null }) },
    ),
    (error) => error.partial === true && error.message === 'خطای سرور',
  );
});
