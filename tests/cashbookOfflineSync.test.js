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
  recordCashTransaction,
  setOfflineOrganization,
  setOfflineUser,
  syncPendingMutations,
} =
  await import('../src/offlineSync.js');
const { supabase } = await import('../src/supabaseClient.js');
await supabase.auth.stopAutoRefresh();

test('offline invoice receipts update local invoices and sync as one RPC with mapped IDs', async () => {
  setOfflineUser('cashbook-offline-test-user');
  setOfflineOrganization('cashbook-offline-test-organization');
  const accountResult = await insertRows('financial_accounts', [{
    account_name: 'صندوق اصلی',
    account_type: 'cash',
    opening_balance: 500,
    opening_date: '2026-09-23',
  }]);
  const invoiceResult = await insertRows('invoices', [{
    customer_name: 'مشتری',
    total_price: 1000,
    paid_amount: 100,
  }]);
  const accountId = accountResult.data[0].id;
  const invoiceId = invoiceResult.data[0].id;
  const paymentResult = await recordCashTransaction({
    transaction_type: 'income',
    amount: 250,
    account_id: accountId,
    invoice_id: invoiceId,
    transaction_date: '2026-09-24',
    description: 'بیعانه',
    reference_number: 'TRX-1042',
    receipt_note: 'واریز کارت به کارت',
  });

  assert.equal(paymentResult.offline, true);
  const optimisticInvoice = await readTable('invoices');
  assert.equal(optimisticInvoice.data[0].paid_amount, 350);
  assert.equal(optimisticInvoice.data[0].payment_status, 'deposit_paid');

  let rpcTransaction;
  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method || 'GET';
    requests.push({ method, url });
    if (method === 'POST' && url.pathname.endsWith('/financial_accounts')) {
      const [row] = JSON.parse(init.body);
      return new Response(JSON.stringify([{ ...row, id: 12 }]), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (method === 'POST' && url.pathname.endsWith('/invoices')) {
      const [row] = JSON.parse(init.body);
      return new Response(JSON.stringify([{ ...row, id: 24 }]), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (method === 'POST' && url.pathname.endsWith('/rpc/record_cash_transaction')) {
      rpcTransaction = JSON.parse(init.body).p_transaction;
      return new Response(JSON.stringify({
        transaction: {
          ...rpcTransaction,
          id: 36,
          account_id: 12,
          invoice_id: 24,
          created_at: '2026-09-24T00:00:00Z',
        },
        invoice: {
          id: 24,
          customer_name: 'مشتری',
          total_price: 1000,
          paid_amount: 350,
          payment_status: 'deposit_paid',
        },
        created: true,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected request: ${method} ${url.href}`);
  };
  globalThis.navigator.onLine = true;
  await syncPendingMutations();

  assert.equal(rpcTransaction.account_id, 12);
  assert.equal(rpcTransaction.invoice_id, 24);
  assert.equal(rpcTransaction.organization_id, 'cashbook-offline-test-organization');
  assert.equal(rpcTransaction.reference_number, 'TRX-1042');
  assert.equal(rpcTransaction.receipt_note, 'واریز کارت به کارت');
  assert.equal(requests.filter((request) => request.url.pathname.endsWith('/rpc/record_cash_transaction')).length, 1);

  globalThis.navigator.onLine = false;
  const syncedInvoice = await readTable('invoices');
  const syncedTransactions = await readTable('cash_transactions');
  assert.equal(syncedInvoice.data[0].paid_amount, 350);
  assert.equal(syncedTransactions.data.length, 1);
  assert.equal(syncedTransactions.data[0].account_id, accountId);
  assert.equal(syncedTransactions.data[0].invoice_id, invoiceId);
  assert.equal(syncedTransactions.data[0].reference_number, 'TRX-1042');
  assert.equal(syncedTransactions.data[0].receipt_note, 'واریز کارت به کارت');
});

test.after(async () => {
  await supabase.auth.stopAutoRefresh();
});
