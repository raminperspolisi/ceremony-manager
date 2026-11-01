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

  assert.equal(document.version, 6);
  assert.deepEqual(Object.keys(document.tables), BACKUP_TABLES);
  assert.deepEqual(validateBackupDocument(document), document);
});

test('version 3 backups are upgraded with empty inventory-operation tables', () => {
  const legacyTables = Object.fromEntries([
    'customers',
    'ceremonies',
    'events',
    'inventory',
    'quotations',
    'invoices',
    'financial_accounts',
    'cash_transactions',
  ].map((table) => [table, []]));
  const backup = validateBackupDocument({
    format: 'ceremony-manager-backup',
    version: 3,
    userId: 'user-1',
    projectUrl: 'https://example.supabase.co',
    tables: legacyTables,
  });

  assert.equal(backup.version, 6);
  assert.ok(BACKUP_TABLES
    .filter((table) => !Object.hasOwn(legacyTables, table))
    .every((table) => Array.isArray(backup.tables[table])));
});

test('version 4 backups are upgraded with an empty invoice-expense table', () => {
  const legacyTables = Object.fromEntries(BACKUP_TABLES
    .filter((table) => !['invoice_expenses', 'event_tasks'].includes(table))
    .map((table) => [table, []]));
  const backup = validateBackupDocument({
    format: 'ceremony-manager-backup',
    version: 4,
    userId: 'user-1',
    projectUrl: 'https://example.supabase.co',
    organizationId: 'organization-1',
    tables: legacyTables,
  });

  assert.equal(backup.version, 6);
  assert.deepEqual(backup.tables.invoice_expenses, []);
});

test('version 5 backups are upgraded with an empty event-task table', () => {
  const legacyTables = Object.fromEntries(BACKUP_TABLES
    .filter((table) => table !== 'event_tasks')
    .map((table) => [table, []]));
  const backup = validateBackupDocument({
    format: 'ceremony-manager-backup',
    version: 5,
    userId: 'user-1',
    projectUrl: 'https://example.supabase.co',
    organizationId: 'organization-1',
    tables: legacyTables,
  });

  assert.equal(backup.version, 6);
  assert.deepEqual(backup.tables.event_tasks, []);
});

test('generated purchase and transfer movements are rebuilt from their source records', () => {
  const document = createBackupDocument({
    inventory_stock_movements: [
      { id: 1, source_type: 'purchase' },
      { id: 2, source_type: 'transfer' },
      { id: 3, source_type: 'manual' },
      { id: 4, source_type: 'invoice', movement_type: 'sale_issue', reservation_id: null },
      { id: 5, source_type: 'invoice', movement_type: 'rental_issue', reservation_id: 7 },
    ],
  }, {
    exportedAt: '2026-10-23T00:00:00.000Z',
    userId: 'user-1',
    projectUrl: 'https://example.supabase.co',
    organizationId: 'organization-1',
  });

  assert.deepEqual(document.tables.inventory_stock_movements.map((row) => row.id), [3, 5]);
});

test('restore remaps event IDs before importing event tasks', async () => {
  const tables = Object.fromEntries(BACKUP_TABLES.map((table) => [table, []]));
  tables.events = [{ id: 'offline:event', event_type: 'عروسی' }];
  tables.event_tasks = [{
    id: 'offline:task',
    event_id: 'offline:event',
    title: 'هماهنگی',
    completed: false,
  }];
  const backup = createBackupDocument(tables, {
    exportedAt: '2026-10-23T00:00:00.000Z',
    userId: 'user-1',
    projectUrl: 'https://example.supabase.co',
    organizationId: 'organization-1',
  });
  const inserts = [];
  await restoreBackupDocument(backup, {
    userId: 'user-1',
    organizationId: 'organization-1',
    projectUrl: 'https://example.supabase.co',
    readTable: async () => ({ data: [], error: null }),
    updateRows: async () => ({ error: null }),
    insertRows: async (table, rows) => {
      inserts.push({ table, rows });
      return { data: rows.map((row) => ({ ...row, id: table === 'events' ? 45 : 70 })), error: null };
    },
  });

  const restoredTask = inserts.find((entry) => entry.table === 'event_tasks').rows[0];
  assert.equal(restoredTask.event_id, 45);
  assert.equal(restoredTask.id, undefined);
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

test('restore remaps invoice expense account and cash transaction references', async () => {
  const tables = Object.fromEntries(BACKUP_TABLES.map((table) => [table, []]));
  tables.invoices = [{ id: 'offline:invoice', customer_name: 'مشتری', total_price: 1000 }];
  tables.financial_accounts = [{ id: 'offline:account', account_name: 'صندوق', account_type: 'cash' }];
  tables.cash_transactions = [{
    id: 'offline:expense-transaction',
    transaction_type: 'expense',
    amount: 250,
    account_id: 'offline:account',
    invoice_id: null,
    transfer_to_account_id: null,
    category: 'حمل‌ونقل',
    description: 'فاکتور رسمی',
    transaction_date: '2026-09-23',
    offline_sync_id: 'b6f299d8-f05b-4c8f-a12a-ddf30487a2fd',
  }];
  tables.invoice_expenses = [{
    id: 'offline:invoice-expense',
    invoice_id: 'offline:invoice',
    category: 'حمل‌ونقل',
    description: 'ارسال تجهیزات',
    amount: 250,
    expense_date: '2026-09-22',
    is_paid: true,
    payment_date: '2026-09-23',
    account_id: 'offline:account',
    cash_transaction_id: 'offline:expense-transaction',
  }];
  const backup = createBackupDocument(tables, {
    exportedAt: '2026-10-23T00:00:00.000Z',
    userId: 'user-1',
    projectUrl: 'https://example.supabase.co',
    organizationId: 'organization-1',
  });
  const inserts = [];
  const ids = { invoices: 20, financial_accounts: 10, cash_transactions: 30, invoice_expenses: 40 };

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

  const restoredExpense = inserts.find((entry) => entry.table === 'invoice_expenses').rows[0];
  assert.equal(restoredExpense.invoice_id, 20);
  assert.equal(restoredExpense.account_id, 10);
  assert.equal(restoredExpense.cash_transaction_id, 30);
});

test('restore applies stock records in dependency order and remaps warehouse references', async () => {
  const tables = Object.fromEntries(BACKUP_TABLES.map((table) => [table, []]));
  tables.inventory = [{ id: 100, title: 'کالا', item_type: 'rent' }];
  tables.inventory_warehouses = [
    { id: 2, name: 'انبار اصلی', is_default: true },
    { id: 6, name: 'انبار دوم', is_default: false },
  ];
  tables.inventory_suppliers = [{ id: 3, name: 'تأمین‌کننده' }];
  tables.inventory_purchase_receipts = [{
    id: 4,
    inventory_id: 100,
    warehouse_id: 2,
    supplier_id: 3,
    quantity: 5,
    unit_cost: 1200,
    purchase_date: '2026-10-25',
    offline_sync_id: 'receipt-sync-id',
  }];
  tables.inventory_stock_movements = [
    {
      id: 9,
      inventory_id: 100,
      warehouse_id: 2,
      reservation_id: null,
      movement_type: 'opening',
      quantity_delta: 2,
      source_type: 'manual',
      offline_sync_id: 'opening-sync-id',
    },
    {
      id: 10,
      inventory_id: 100,
      warehouse_id: 2,
      reservation_id: 7,
      movement_type: 'rental_issue',
      quantity_delta: -1,
      source_type: 'manual',
      offline_sync_id: 'issue-sync-id',
    },
  ];
  tables.inventory_transfers = [{
    id: 5,
    inventory_id: 100,
    from_warehouse_id: 2,
    to_warehouse_id: 6,
    quantity: 1,
    offline_sync_id: 'transfer-sync-id',
  }];
  tables.inventory_reservations = [{
    id: 7,
    inventory_id: 100,
    warehouse_id: 2,
    source_type: 'manual',
    source_id: 'booking-7',
    reservation_type: 'rent',
    quantity: 1,
    starts_on: '2026-11-01',
    ends_on: '2026-11-02',
    status: 'issued',
    offline_sync_id: 'reservation-sync-id',
  }];
  const backup = createBackupDocument(tables, {
    exportedAt: '2026-10-23T00:00:00.000Z',
    userId: 'user-1',
    projectUrl: 'https://example.supabase.co',
    organizationId: 'organization-1',
  });
  const insertIds = {
    inventory: 101,
    inventory_warehouses: 61,
    inventory_suppliers: 31,
    inventory_purchase_receipts: 41,
    inventory_transfers: 51,
    inventory_reservations: 71,
    inventory_stock_movements: 91,
  };
  const inserted = [];
  const updateCalls = [];

  await restoreBackupDocument(backup, {
    userId: 'user-1',
    organizationId: 'organization-1',
    projectUrl: 'https://example.supabase.co',
    readTable: async (table) => ({
      data: table === 'inventory_warehouses'
        ? [{ id: 20, name: 'انبار اصلی', is_default: true, offline_sync_id: 'target-default-id' }]
        : [],
      error: null,
    }),
    updateRows: async (...args) => { updateCalls.push(args); return { error: null }; },
    insertRows: async (table, rows) => {
      inserted.push({ table, rows });
      return {
        data: rows.map((row, index) => ({ ...row, id: insertIds[table] + index })),
        error: null,
      };
    },
  });

  const purchase = inserted.find((entry) => entry.table === 'inventory_purchase_receipts').rows[0];
  const transfer = inserted.find((entry) => entry.table === 'inventory_transfers').rows[0];
  const reservation = inserted.find((entry) => entry.table === 'inventory_reservations').rows[0];
  const opening = inserted.find((entry) => (
    entry.table === 'inventory_stock_movements' && entry.rows[0].movement_type === 'opening'
  )).rows[0];
  const issue = inserted.find((entry) => (
    entry.table === 'inventory_stock_movements' && entry.rows[0].movement_type === 'rental_issue'
  )).rows[0];

  assert.equal(purchase.inventory_id, 101);
  assert.equal(purchase.warehouse_id, 20);
  assert.equal(purchase.supplier_id, 31);
  assert.equal(transfer.from_warehouse_id, 20);
  assert.equal(transfer.to_warehouse_id, 61);
  assert.equal(reservation.inventory_id, 101);
  assert.equal(reservation.warehouse_id, 20);
  assert.equal(reservation.status, 'reserved');
  assert.equal(opening.warehouse_id, 20);
  assert.equal(issue.reservation_id, 71);
  assert.ok(updateCalls.some((args) => args[0] === 'inventory_warehouses'
    && args[2][0].value === 20));
});

test('restore remaps inventory IDs embedded in invoices and invoice reservation sources', async () => {
  const tables = Object.fromEntries(BACKUP_TABLES.map((table) => [table, []]));
  tables.inventory = [{ id: 100, title: 'کالای اجاره‌ای', item_type: 'rent' }];
  tables.inventory_warehouses = [{ id: 2, name: 'انبار اصلی', is_default: true }];
  tables.invoices = [{
    id: 5,
    items_data: [{
      inventory_id: 100,
      item_type: 'rent',
      qty: 1,
      rental_checkout_date: '2026-11-01',
      rental_return_date: '2026-11-03',
    }],
  }];
  tables.inventory_reservations = [{
    id: 7,
    inventory_id: 100,
    warehouse_id: 2,
    source_type: 'invoice',
    source_id: '5:100',
    reservation_type: 'rent',
    quantity: 1,
    starts_on: '2026-11-01',
    ends_on: '2026-11-03',
    status: 'reserved',
  }];
  const backup = createBackupDocument(tables, {
    exportedAt: '2026-10-23T00:00:00.000Z',
    userId: 'user-1',
    projectUrl: 'https://example.supabase.co',
    organizationId: 'organization-1',
  });
  const inserted = [];
  const idByTable = {
    inventory: 101,
    inventory_warehouses: 20,
    invoices: 50,
    inventory_reservations: 70,
  };

  await restoreBackupDocument(backup, {
    userId: 'user-1',
    organizationId: 'organization-1',
    projectUrl: 'https://example.supabase.co',
    readTable: async (table) => ({
      data: table === 'inventory_warehouses'
        ? [{ id: 20, name: 'انبار اصلی', is_default: true, offline_sync_id: 'target-default-id' }]
        : [],
      error: null,
    }),
    updateRows: async () => ({ error: null }),
    insertRows: async (table, rows) => {
      inserted.push({ table, rows });
      return {
        data: rows.map((row, index) => ({ ...row, id: idByTable[table] + index })),
        error: null,
      };
    },
  });

  const invoice = inserted.find((entry) => entry.table === 'invoices').rows[0];
  const reservation = inserted.find((entry) => entry.table === 'inventory_reservations').rows[0];
  assert.equal(invoice.items_data[0].inventory_id, 101);
  assert.equal(reservation.inventory_id, 101);
  assert.equal(reservation.warehouse_id, 20);
  assert.equal(reservation.source_id, '50:101');
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
