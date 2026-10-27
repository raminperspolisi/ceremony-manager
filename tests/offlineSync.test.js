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

test('warmOfflineCache stores bot orders for offline access', async () => {
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

  globalThis.navigator.onLine = false;
  const result = await readTable('bot_orders');
  assert.equal(result.offline, true);
  assert.deepEqual(result.data, [cachedOrder]);
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
