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
  editCashTransaction,
  reverseCashTransaction,
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
  const editRequests = [];
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
    if (method === 'POST' && url.pathname.endsWith('/rpc/reverse_cash_transaction')) {
      const request = JSON.parse(init.body);
      assert.equal(request.p_transaction_id, 36);
      assert.equal(request.p_reason, 'ثبت اشتباه');
      return new Response(JSON.stringify({
        transaction: {
          id: 38,
          transaction_type: 'expense',
          amount: 250,
          account_id: 12,
          reversal_of_transaction_id: 36,
          organization_id: 'cashbook-offline-test-organization',
          transaction_date: '2026-09-26',
          description: 'برگشت گردش #36 - ثبت اشتباه',
        },
        reversed_transaction_id: 36,
        invoice: {
          id: 24,
          customer_name: 'مشتری',
          total_price: 1000,
          paid_amount: 100,
          payment_status: 'deposit_paid',
          event_id: 17,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (method === 'POST' && url.pathname.endsWith('/rpc/edit_cash_transaction')) {
      const request = JSON.parse(init.body);
      editRequests.push(request);
      const edited = request.p_transaction;
      const isInvoiceReceipt = request.p_transaction_id === 36;
      return new Response(JSON.stringify({
        transaction: {
          ...edited,
          id: request.p_transaction_id,
          account_id: 12,
          event_id: isInvoiceReceipt ? null : 17,
          invoice_id: isInvoiceReceipt ? 24 : null,
          offline_sync_id: isInvoiceReceipt ? 'invoice-sync-id' : 'expense-sync-id',
          created_at: '2026-09-26T00:00:00Z',
        },
        invoice: isInvoiceReceipt ? {
          id: 24,
          customer_name: 'مشتری',
          total_price: 1000,
          paid_amount: 110,
          payment_status: 'deposit_paid',
          event_id: 17,
        } : null,
        invoice_expense: null,
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

  globalThis.navigator.onLine = true;
  const reversalResult = await reverseCashTransaction(paymentResult.data.id, 'ثبت اشتباه');
  assert.equal(reversalResult.error, null);
  assert.equal(reversalResult.data.reversed_transaction_id, 36);
  globalThis.navigator.onLine = false;
  const reversedTransactions = await readTable('cash_transactions');
  const reversal = reversedTransactions.data.find((item) => item.reversal_of_transaction_id);
  assert.equal(reversal.reversal_of_transaction_id, paymentResult.data.id);
  const reversedInvoice = await readTable('invoices');
  assert.equal(reversedInvoice.data[0].paid_amount, 100);

  globalThis.navigator.onLine = true;
  const editResult = await editCashTransaction(expenseResult.data.id, {
    transaction_type: 'expense',
    amount: 75,
    account_id: 12,
    event_id: 17,
    category: 'تدارکات',
    description: 'هزینه اصلاح‌شده',
    transaction_date: '2026-09-25',
  }, 'اصلاح مبلغ');
  assert.equal(editResult.error, null);
  assert.equal(editRequests[0].p_transaction_id, 37);
  assert.equal(editRequests[0].p_reason, 'اصلاح مبلغ');
  assert.equal(editRequests[0].p_transaction.amount, 75);
  assert.equal(editRequests[0].p_transaction.event_id, 17);
  const editedTransactions = await readTable('cash_transactions');
  assert.equal(editedTransactions.data.find((item) => item.id === expenseResult.data.id).amount, 75);

  const invoiceEditResult = await editCashTransaction(paymentResult.data.id, {
    transaction_type: 'income',
    amount: 260,
    account_id: 12,
    description: 'دریافت اصلاح‌شده',
    transaction_date: '2026-09-24',
  }, 'اصلاح دریافت');
  assert.equal(invoiceEditResult.error, null);
  assert.equal(editRequests[1].p_transaction_id, 36);
  const editedInvoice = await readTable('invoices');
  assert.equal(editedInvoice.data[0].paid_amount, 110);
  globalThis.navigator.onLine = false;
});

test.after(async () => {
  await supabase.auth.stopAutoRefresh();
});
