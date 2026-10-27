import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_TABLES, createBackupDocument, validateBackupDocument } from '../src/backupUtils.js';
import { restoreBackupDocument } from '../src/backupService.js';

test('backup document has a version and all supported tables', () => {
  const document = createBackupDocument({ customers: [{ id: 1 }] }, {
    exportedAt: '2026-10-23T00:00:00.000Z',
    userId: 'user-1',
    projectUrl: 'https://example.supabase.co',
    organizationId: 'organization-1',
  });

  assert.equal(document.version, 3);
  assert.deepEqual(Object.keys(document.tables), BACKUP_TABLES);
  assert.deepEqual(validateBackupDocument(document), document);
});

test('backup validation rejects unsupported and unidentifiable data', () => {
  assert.throws(() => validateBackupDocument({ format: 'other', version: 1 }), /قالب/);
  assert.throws(() => validateBackupDocument({
    format: 'ceremony-manager-backup',
    version: 2,
    userId: 'user-1',
    projectUrl: 'https://example.supabase.co',
    tables: Object.fromEntries(BACKUP_TABLES.map((table) => [table, table === 'inventory' ? [{}] : []])),
  }), /شناسه/);
});

test('backup validation rejects duplicate record IDs', () => {
  assert.throws(() => validateBackupDocument({
    format: 'ceremony-manager-backup',
    version: 2,
    userId: 'user-1',
    projectUrl: 'https://example.supabase.co',
    tables: Object.fromEntries(BACKUP_TABLES.map((table) => [
      table,
      table === 'customers' ? [{ id: 3 }, { id: '3' }] : [],
    ])),
  }), /تکراری/);
});

test('restore merges records by ID without deleting existing data', async () => {
  const tables = Object.fromEntries(BACKUP_TABLES.map((table) => [table, []]));
  tables.customers = [{ id: 1, 'Full name': 'به‌روزشده' }, { id: 2, 'Full name': 'جدید' }];
  const backup = createBackupDocument(tables, {
    exportedAt: '2026-10-23T00:00:00.000Z',
    userId: 'user-1',
    projectUrl: 'https://example.supabase.co',
    organizationId: 'organization-1',
  });
  const updates = [];
  const inserts = [];

  const counts = await restoreBackupDocument(backup, {
    userId: 'user-1',
    organizationId: 'organization-1',
    projectUrl: 'https://example.supabase.co',
    readTable: async (table) => ({
      data: table === 'customers' ? [{ id: 1, 'Full name': 'قدیمی' }] : [],
      error: null,
    }),
    updateRows: async (...args) => { updates.push(args); return { error: null }; },
    insertRows: async (...args) => {
      inserts.push(args);
      return { data: args[1].map((row, index) => ({ ...row, id: index + 10 })), error: null };
    },
  });

  assert.deepEqual(counts.customers, { updated: 1, inserted: 1 });
  assert.deepEqual(updates[0], [
    'customers',
    { 'Full name': 'به‌روزشده' },
    [{ column: 'id', operator: 'eq', value: 1 }],
  ]);
  assert.deepEqual(inserts[0], ['customers', [{ 'Full name': 'جدید' }]]);
});

test('restore remaps offline account and invoice IDs before importing cash transactions', async () => {
  const tables = Object.fromEntries(BACKUP_TABLES.map((table) => [table, []]));
  tables.financial_accounts = [{ id: 'offline:account', account_name: 'صندوق', account_type: 'cash' }];
  tables.invoices = [{ id: 'offline:invoice', customer_name: 'مشتری', total_price: 1000 }];
  tables.cash_transactions = [{
    id: 'offline:transaction',
    transaction_type: 'income',
    amount: 100,
    account_id: 'offline:account',
    invoice_id: 'offline:invoice',
    transfer_to_account_id: null,
    category: null,
    description: 'دریافت',
    transaction_date: '2026-09-23',
    offline_sync_id: 'f199a1d8-c6c4-4c62-8769-4fdce7318edc',
  }];
  const backup = createBackupDocument(tables, {
    exportedAt: '2026-10-23T00:00:00.000Z',
    userId: 'user-1',
    projectUrl: 'https://example.supabase.co',
    organizationId: 'organization-1',
  });
  const inserts = [];
  const ids = { financial_accounts: 10, invoices: 20, cash_transactions: 30 };

  await restoreBackupDocument(backup, {
    userId: 'user-1',
    organizationId: 'organization-1',
    projectUrl: 'https://example.supabase.co',
    readTable: async () => ({ data: [], error: null }),
    updateRows: async () => ({ error: null }),
    insertRows: async (table, rows) => {
      inserts.push({ table, rows });
      return { data: rows.map((row, index) => ({ ...row, id: ids[table] + index })), error: null };
    },
  });

  const restoredTransaction = inserts.find((entry) => entry.table === 'cash_transactions').rows[0];
  assert.equal(restoredTransaction.account_id, 10);
  assert.equal(restoredTransaction.invoice_id, 20);
  assert.equal(restoredTransaction.id, undefined);
});

test('restore rejects another account before reading or writing data', async () => {
  let accessed = false;
  const backup = createBackupDocument(Object.fromEntries(BACKUP_TABLES.map((table) => [table, []])), {
    exportedAt: '2026-10-23T00:00:00.000Z',
    userId: 'user-1',
    projectUrl: 'https://example.supabase.co',
    organizationId: 'organization-1',
  });

  await assert.rejects(
    restoreBackupDocument(backup, {
      userId: 'user-2',
      organizationId: 'organization-1',
      projectUrl: 'https://example.supabase.co',
      readTable: async () => { accessed = true; return { data: [], error: null }; },
      updateRows: async () => ({ error: null }),
      insertRows: async () => ({ error: null }),
    }),
    /حساب کاربری دیگری/,
  );
  assert.equal(accessed, false);
});

test('restore rejects a backup from another organization before reading or writing data', async () => {
  let accessed = false;
  const backup = createBackupDocument(
    Object.fromEntries(BACKUP_TABLES.map((table) => [table, []])),
    {
      exportedAt: '2026-10-23T00:00:00.000Z',
      userId: 'user-1',
      projectUrl: 'https://example.supabase.co',
      organizationId: 'organization-1',
    },
  );

  await assert.rejects(
    restoreBackupDocument(backup, {
      userId: 'user-1',
      organizationId: 'organization-2',
      projectUrl: 'https://example.supabase.co',
      readTable: async () => { accessed = true; return { data: [], error: null }; },
      updateRows: async () => ({ error: null }),
      insertRows: async () => ({ error: null }),
    }),
    /فضای کاری دیگری/,
  );
  assert.equal(accessed, false);
});
