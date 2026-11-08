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
  const eventResult = await insertRows('events', [{
    customer_name: 'مراسم',
    event_date: '2026-09-25',
  }]);
  const invoiceResult = await insertRows('invoices', [{
    customer_name: 'مشتری',
    total_price: 1000,
    paid_amount: 100,
    event_id: eventResult.data[0].id,
  }]);
  const accountId = accountResult.data[0].id;
  const eventId = eventResult.data[0].id;
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
  const expenseResult = await recordCashTransaction({
    transaction_type: 'expense',
    amount: 50,
    account_id: accountId,
    event_id: eventId,
    category: 'تدارکات',
    transaction_date: '2026-09-25',
    description: 'هزینه مراسم',
  });

  assert.equal(paymentResult.offline, true);
  assert.equal(expenseResult.offline, true);
  const optimisticInvoice = await readTable('invoices');
  assert.equal(optimisticInvoice.data[0].paid_amount, 350);
  assert.equal(optimisticInvoice.data[0].payment_status, 'deposit_paid');

  const rpcTransactions = [];
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
    if (method === 'POST' && url.pathname.endsWith('/events')) {
      const [row] = JSON.parse(init.body);
      return new Response(JSON.stringify([{ ...row, id: 17 }]), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (method === 'POST' && url.pathname.endsWith('/invoices')) {
      const [row] = JSON.parse(init.body);
      return new Response(JSON.stringify([{ ...row, id: 24, event_id: 17 }]), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (method === 'POST' && url.pathname.endsWith('/rpc/record_cash_transaction')) {
      const rpcTransaction = JSON.parse(init.body).p_transaction;
      rpcTransactions.push(rpcTransaction);
      return new Response(JSON.stringify({
        transaction: {
          ...rpcTransaction,
          id: rpcTransactions.length === 1 ? 36 : 37,
          account_id: 12,
          invoice_id: rpcTransaction.invoice_id || null,
          event_id: rpcTransaction.event_id || null,
          created_at: '2026-09-24T00:00:00Z',
        },
        invoice: rpcTransaction.invoice_id ? {
          id: 24,
          customer_name: 'مشتری',
          total_price: 1000,
          paid_amount: 350,
          payment_status: 'deposit_paid',
          event_id: 17,
        } : null,
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

  assert.equal(rpcTransactions[0].account_id, 12);
  assert.equal(rpcTransactions[0].invoice_id, 24);
  assert.equal(rpcTransactions[0].event_id, undefined);
  assert.equal(rpcTransactions[1].event_id, 17);
  assert.equal(rpcTransactions[1].category, 'تدارکات');
  assert.equal(requests.filter((request) => request.url.pathname.endsWith('/events')).length, 1);
  assert.equal(rpcTransactions[0].organization_id, 'cashbook-offline-test-organization');
  assert.equal(rpcTransactions[0].reference_number, 'TRX-1042');
  assert.equal(rpcTransactions[0].receipt_note, 'واریز کارت به کارت');
  assert.equal(requests.filter((request) => request.url.pathname.endsWith('/rpc/record_cash_transaction')).length, 2);

  globalThis.navigator.onLine = false;
  const syncedInvoice = await readTable('invoices');
  const syncedTransactions = await readTable('cash_transactions');
  assert.equal(syncedInvoice.data[0].paid_amount, 350);
  assert.equal(syncedInvoice.data[0].event_id, eventId);
  assert.equal(syncedTransactions.data.length, 2);
  const syncedPayment = syncedTransactions.data.find((item) => item.transaction_type === 'income');
  const syncedExpense = syncedTransactions.data.find((item) => item.transaction_type === 'expense');
  assert.equal(syncedPayment.account_id, accountId);
  assert.equal(syncedPayment.invoice_id, invoiceId);
  assert.equal(syncedPayment.event_id, null);
  assert.equal(syncedPayment.reference_number, 'TRX-1042');
  assert.equal(syncedPayment.receipt_note, 'واریز کارت به کارت');
  assert.equal(syncedExpense.event_id, eventId);
  assert.equal(syncedExpense.category, 'تدارکات');
});

test.after(async () => {
  await supabase.auth.stopAutoRefresh();
});
