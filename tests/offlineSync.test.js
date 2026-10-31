import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { onLine: false },
});
globalThis.document = {
  visibilityState: 'visible',
  addEventListener() {},
};
globalThis.window = {
  indexedDB: globalThis.indexedDB,
  addEventListener() {},
  dispatchEvent() {},
  setInterval() {},
  setTimeout,
  clearTimeout,
};

const {
  insertRows,
  readTable,
  setOfflineOrganization,
  setOfflineUser,
  syncPendingMutations,
  warmOfflineCache,
} = await import('../src/offlineSync.js');
const { supabase } = await import('../src/supabaseClient.js');
await supabase.auth.stopAutoRefresh();

test('offline invoice inserts are queued and duplicate quotation syncs reconcile to one invoice', async () => {
  setOfflineUser('offline-sync-test-user');
  setOfflineOrganization('offline-sync-test-organization');
  const quotationInsert = await insertRows('quotations', [{ customer_name: 'مشتری اول', total_price: 100 }]);
  const localQuotationId = quotationInsert.data[0].id;
  const firstInsert = await insertRows('invoices', [{ quotation_id: localQuotationId, customer_name: 'مشتری اول' }]);
  const secondInsert = await insertRows('invoices', [{ quotation_id: localQuotationId, customer_name: 'مشتری اول' }]);
  assert.equal(firstInsert.offline, true, JSON.stringify(firstInsert));
  assert.equal(secondInsert.offline, true, JSON.stringify(secondInsert));

  const offlineRows = await readTable('invoices');
  assert.equal(offlineRows.offline, true);
  assert.equal(offlineRows.data.length, 2);

  const existingInvoice = {
    id: 501,
    quotation_id: '55',
    customer_name: 'مشتری اول',
    offline_sync_id: 'server-invoice-55',
  };
  let insertCount = 0;
  let quotationPayload;
  const invoicePayloads = [];
  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method || 'GET';
    requests.push({ method, url });
    if (method === 'POST') {
      if (url.pathname.endsWith('/quotations')) {
        quotationPayload = JSON.parse(init.body)[0];
        return new Response(JSON.stringify([{ ...quotationPayload, id: 55 }]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      insertCount += 1;
      const invoicePayload = JSON.parse(init.body)[0];
      invoicePayloads.push(invoicePayload);
      if (insertCount === 1) {
        return new Response(JSON.stringify([{ ...invoicePayload, id: 501 }]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        code: '23505',
        message: 'duplicate key value violates unique constraint invoices_quotation_id_key',
      }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }
    if (method === 'GET' && url.searchParams.has('quotation_id')) {
      return new Response(JSON.stringify(existingInvoice), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected request: ${method} ${url.href}`);
  };
  globalThis.navigator.onLine = true;

  await syncPendingMutations();

  assert.ok(quotationPayload);
  assert.equal(quotationPayload.organization_id, 'offline-sync-test-organization');
  assert.equal(insertCount, 2);
  assert.deepEqual(invoicePayloads.map((row) => row.quotation_id), ['55', '55']);
  assert.ok(invoicePayloads.every((row) => row.organization_id === 'offline-sync-test-organization'));
  const duplicateLookup = requests.find((request) => request.method === 'GET');
  assert.equal(requests.filter((request) => request.method === 'GET').length, 1);
  assert.equal(duplicateLookup.url.searchParams.get('quotation_id'), 'eq.55');
  assert.equal(duplicateLookup.url.searchParams.get('organization_id'), 'eq.offline-sync-test-organization');
  globalThis.navigator.onLine = false;
  const synchronizedRows = await readTable('invoices');
  const synchronizedQuotations = await readTable('quotations');
  assert.equal(synchronizedRows.data.length, 1);
  assert.equal(synchronizedRows.data[0].id, firstInsert.data[0].id);
  assert.equal(synchronizedRows.data[0].quotation_id, localQuotationId);
  assert.equal(synchronizedQuotations.data[0].id, localQuotationId);
});

test('warmOfflineCache stores bot orders and inventory operations for offline access', async () => {
  setOfflineUser('offline-sync-test-user');
  setOfflineOrganization('offline-sync-test-organization');
  globalThis.navigator.onLine = true;
  const cachedOrder = { id: 901, status: 'pending', total_price: 2500 };
  const requestedTables = new Set();
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    const table = url.pathname.split('/').pop();
    requestedTables.add(table);
    const rows = table === 'bot_orders' ? [cachedOrder] : [];
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Range': rows.length ? '0-0/1' : '*/0',
      },
    });
  };

  await warmOfflineCache();
  assert.ok(requestedTables.has('bot_orders'));
  assert.ok(requestedTables.has('inventory_warehouses'));
  assert.ok(requestedTables.has('inventory_stock_movements'));
  assert.ok(requestedTables.has('inventory_reservations'));

  globalThis.navigator.onLine = false;
  const result = await readTable('bot_orders');
  assert.equal(result.offline, true);
  assert.deepEqual(result.data, [cachedOrder]);
});

test('offline stock movements remap warehouse IDs before synchronization', async () => {
  setOfflineUser('offline-inventory-sync-test-user');
  setOfflineOrganization('offline-inventory-sync-test-organization');
  globalThis.navigator.onLine = false;
  const warehouse = await insertRows('inventory_warehouses', [{ name: 'انبار دوم' }]);
  const movement = await insertRows('inventory_stock_movements', [{
    inventory_id: 17,
    warehouse_id: warehouse.data[0].id,
    movement_type: 'opening',
    quantity_delta: 4,
    source_type: 'manual',
  }]);
  assert.equal(warehouse.offline, true);
  assert.equal(movement.offline, true);

  const previousFetch = globalThis.fetch;
  let movementPayload;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const table = url.pathname.split('/').pop();
    const row = JSON.parse(init.body)[0];
    if (table === 'inventory_warehouses') {
      return new Response(JSON.stringify([{ ...row, id: 501 }]), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (table === 'inventory_stock_movements') {
      movementPayload = row;
      return new Response(JSON.stringify([{ ...row, id: 502 }]), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected request: ${table}`);
  };

  try {
    globalThis.navigator.onLine = true;
    await syncPendingMutations();
    assert.equal(movementPayload.warehouse_id, 501);
    assert.equal(movementPayload.inventory_id, 17);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.navigator.onLine = false;
  }
});

test('offline quotation and invoice items remap their inventory references', async () => {
  setOfflineUser('offline-invoice-inventory-sync-test-user');
  setOfflineOrganization('offline-invoice-inventory-sync-test-organization');
  globalThis.navigator.onLine = false;
  const inventory = await insertRows('inventory', [{ title: 'کالای اجاره‌ای', item_type: 'rent' }]);
  await insertRows('quotations', [{
    customer_name: 'مشتری',
    items_json: [{
      inventory_id: inventory.data[0].id,
      item_type: 'rent',
      qty: 1,
      rental_checkout_date: '2026-11-01',
      rental_return_date: '2026-11-03',
    }],
  }]);
  const quotationRows = await readTable('quotations');
  const offlineInvoice = await insertRows('invoices', [{
    quotation_id: quotationRows.data[0].id,
    items_data: [{
      inventory_id: inventory.data[0].id,
      item_type: 'rent',
      qty: 1,
      rental_checkout_date: '2026-11-01',
      rental_return_date: '2026-11-03',
    }],
  }]);

  const previousFetch = globalThis.fetch;
  const payloads = {};
  const serverIds = { inventory: 601, quotations: 602, invoices: 603 };
  globalThis.fetch = async (input, init = {}) => {
    const table = new URL(input).pathname.split('/').pop();
    const row = JSON.parse(init.body)[0];
    payloads[table] = row;
    return new Response(JSON.stringify([{ ...row, id: serverIds[table] }]), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    globalThis.navigator.onLine = true;
    await syncPendingMutations();
    assert.equal(payloads.inventory.id, undefined);
    assert.equal(payloads.quotations.items_json[0].inventory_id, 601);
    assert.equal(payloads.invoices.quotation_id, '602');
    assert.equal(payloads.invoices.items_data[0].inventory_id, 601);
    assert.equal(offlineInvoice.offline, true);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.navigator.onLine = false;
  }
});

test('unbounded table reads fetch every server page', async () => {
  setOfflineUser('offline-sync-pagination-test-user');
  setOfflineOrganization('offline-sync-pagination-test-organization');
  globalThis.navigator.onLine = true;
  const rows = Array.from({ length: 1001 }, (_, index) => ({ id: index + 1 }));
  const requestedRanges = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    if (!url.pathname.endsWith('/invoices')) {
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const range = new Headers(init.headers).get('range');
    const start = range
      ? Number(range.split('-')[0])
      : Number(url.searchParams.get('offset') || 0);
    const end = range
      ? Number(range.split('-')[1])
      : start + Number(url.searchParams.get('limit') || 1000) - 1;
    requestedRanges.push([start, end]);
    return new Response(JSON.stringify(rows.slice(start, end + 1)), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Range': `${start}-${Math.min(end, rows.length - 1)}/${rows.length}`,
      },
    });
  };

  try {
    const result = await readTable('invoices', { orderBy: 'id', ascending: true });
    assert.equal(result.error, null);
    assert.equal(result.data.length, 1001);
    assert.deepEqual(requestedRanges, [[0, 999], [1000, 1999]]);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.navigator.onLine = false;
  }
});

test('offline records are isolated between organizations for the same user', async () => {
  setOfflineUser('offline-sync-test-user');
  setOfflineOrganization('offline-sync-first-organization');
  const firstInsert = await insertRows('customers', [{ 'Full name': 'سازمان اول' }]);
  assert.equal(firstInsert.data[0].organization_id, 'offline-sync-first-organization');

  setOfflineOrganization('offline-sync-second-organization');
  const secondOrganizationRows = await readTable('customers');
  assert.deepEqual(secondOrganizationRows.data, []);

  setOfflineOrganization('offline-sync-first-organization');
  const firstOrganizationRows = await readTable('customers');
  assert.equal(firstOrganizationRows.data.length, 1);
  assert.equal(firstOrganizationRows.data[0]['Full name'], 'سازمان اول');
});

test.after(async () => {
  await supabase.auth.stopAutoRefresh();
});
