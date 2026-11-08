import { BACKUP_TABLES, validateBackupDocument } from './backupUtils.js';

const TABLE_LABELS = {
  customers: 'مشتریان',
  ceremonies: 'مراسم‌ها',
  events: 'رویدادها',
  inventory: 'کالاهای انبار',
  inventory_warehouses: 'انبارها',
  inventory_suppliers: 'تأمین‌کنندگان',
  inventory_purchase_receipts: 'رسیدهای خرید',
  inventory_transfers: 'انتقال‌های انبار',
  inventory_reservations: 'رزروهای موجودی',
  inventory_stock_movements: 'گردش‌های موجودی',
  quotations: 'پیش‌فاکتورها',
  invoices: 'فاکتورهای رسمی',
  financial_accounts: 'حساب‌های صندوق و بانک',
  cash_transactions: 'گردش‌های مالی',
  invoice_expenses: 'هزینه‌های فاکتور',
};
const IMMUTABLE_TABLES = new Set([
  'cash_transactions',
  'inventory_purchase_receipts',
  'inventory_transfers',
  'inventory_reservations',
  'inventory_stock_movements',
]);
const RESTORE_STEPS = [
  'customers',
  'ceremonies',
  'events',
  'event_tasks',
  'inventory',
  'quotations',
  'inventory_warehouses',
  'inventory_suppliers',
  'inventory_purchase_receipts',
  {
    table: 'inventory_stock_movements',
    filter: (row) => !row.reservation_id
      && !(row.source_type === 'invoice' && row.movement_type === 'sale_issue'),
  },
  'inventory_transfers',
  { table: 'inventory_reservations', filter: (row) => row.source_type !== 'invoice' },
  'invoices',
  { table: 'inventory_reservations', filter: (row) => row.source_type === 'invoice' },
  { table: 'inventory_stock_movements', filter: (row) => Boolean(row.reservation_id) },
  'financial_accounts',
  'cash_transactions',
  'invoice_expenses',
];

export async function readAllBackupRows(table, readTable) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const result = await readTable(table, {
      orderBy: 'id',
      ascending: true,
      limit: pageSize,
      offset,
    });
    if (result.error) return result;
    rows.push(...(result.data || []));
    if ((result.data || []).length < pageSize) return { data: rows, error: null };
  }
}

export async function restoreBackupDocument(
  value,
  { userId, organizationId, projectUrl, readTable, insertRows, updateRows },
) {
  const backup = validateBackupDocument(value);
  if (backup.userId !== userId) throw new Error('این فایل پشتیبان متعلق به حساب کاربری دیگری است.');
  if (backup.projectUrl !== projectUrl) throw new Error('این فایل برای پروژهٔ دیگری ساخته شده است.');
  if (backup.organizationId && backup.organizationId !== organizationId) {
    throw new Error('این فایل پشتیبان متعلق به فضای کاری دیگری است.');
  }

  const restoredCounts = {};
  const restoredIds = new Map(BACKUP_TABLES.map((table) => [table, new Map()]));
  const rewriteReferences = (table, source) => {
    const row = { ...source };
    delete row.organization_id;
    if (table === 'quotations' || table === 'invoices') {
      const itemsField = table === 'quotations' ? 'items_json' : 'items_data';
      if (Array.isArray(row[itemsField])) {
        row[itemsField] = row[itemsField].map((item) => {
          if (item.inventory_id === undefined || item.inventory_id === null) return item;
          const inventoryId = restoredIds.get('inventory').get(String(item.inventory_id));
          return inventoryId === undefined ? item : { ...item, inventory_id: inventoryId };
        });
      }
    }
    if (table === 'inventory_reservations'
      && ['issued', 'fulfilled', 'returned'].includes(row.status)) {
      row.status = 'reserved';
    }
    if (row.source_type === 'invoice' && typeof row.source_id === 'string') {
      const [invoiceId, inventoryId] = row.source_id.split(':');
      const mappedInvoiceId = restoredIds.get('invoices').get(invoiceId);
      const mappedInventoryId = restoredIds.get('inventory').get(inventoryId);
      row.source_id = `${mappedInvoiceId ?? invoiceId}:${mappedInventoryId ?? inventoryId}`;
    }
    const references = table === 'event_tasks'
      ? [['event_id', 'events']]
      : table === 'invoices'
      ? [['quotation_id', 'quotations'], ['event_id', 'events']]
      : table === 'cash_transactions'
        ? [
          ['account_id', 'financial_accounts'],
          ['transfer_to_account_id', 'financial_accounts'],
          ['invoice_id', 'invoices'],
          ['event_id', 'events'],
        ]
        : table === 'invoice_expenses'
          ? [
            ['invoice_id', 'invoices'],
            ['account_id', 'financial_accounts'],
            ['cash_transaction_id', 'cash_transactions'],
          ]
        : table === 'inventory_purchase_receipts'
          ? [
            ['inventory_id', 'inventory'],
            ['warehouse_id', 'inventory_warehouses'],
            ['supplier_id', 'inventory_suppliers'],
          ]
          : table === 'inventory_transfers'
            ? [
              ['inventory_id', 'inventory'],
              ['from_warehouse_id', 'inventory_warehouses'],
              ['to_warehouse_id', 'inventory_warehouses'],
            ]
            : table === 'inventory_reservations'
              ? [
                ['inventory_id', 'inventory'],
                ['warehouse_id', 'inventory_warehouses'],
              ]
              : table === 'inventory_stock_movements'
                ? [
                  ['inventory_id', 'inventory'],
                  ['warehouse_id', 'inventory_warehouses'],
                  ['reservation_id', 'inventory_reservations'],
                ]
                : [];
    for (const [column, referencedTable] of references) {
      const mappedId = restoredIds.get(referencedTable).get(String(row[column]));
      if (mappedId !== undefined) row[column] = mappedId;
    }
    return row;
  };
  try {
    for (const step of RESTORE_STEPS) {
      const table = typeof step === 'string' ? step : step.table;
      const sourceRows = backup.tables[table].filter(
        typeof step === 'string' ? () => true : step.filter,
      );
      const { data: existingRows, error: readError } = await readAllBackupRows(table, readTable);
      if (readError) throw new Error(`خواندن ${TABLE_LABELS[table]} ناموفق بود: ${readError.message}`);

      const rowsToInsert = [];
      const sourceIdsToInsert = [];
      restoredCounts[table] ||= { updated: 0, inserted: 0 };
      for (const row of sourceRows) {
        let existingRow = existingRows.find((item) => String(item.id) === String(row.id));
        if (!existingRow && table === 'inventory_reservations' && row.source_type === 'invoice') {
          const mappedRow = rewriteReferences(table, row);
          existingRow = existingRows.find((item) => (
            item.source_type === 'invoice'
            && item.source_id === mappedRow.source_id
            && String(item.inventory_id) === String(mappedRow.inventory_id)
            && String(item.warehouse_id) === String(mappedRow.warehouse_id)
            && item.reservation_type === mappedRow.reservation_type
          ));
        }
        if (!existingRow && table === 'inventory_warehouses' && row.is_default) {
          existingRow = existingRows.find((item) => item.is_default);
        }
        if (!existingRow) {
          const insertRow = rewriteReferences(table, row);
          delete insertRow.id;
          rowsToInsert.push(insertRow);
          sourceIdsToInsert.push(String(row.id));
          continue;
        }
        restoredIds.get(table).set(String(row.id), existingRow.id);
        if (IMMUTABLE_TABLES.has(table)
          || (table === 'invoice_expenses' && (existingRow.is_paid || row.is_paid))) {
          const comparableRow = rewriteReferences(table, row);
          const changed = Object.keys(comparableRow)
            .filter((field) => !['organization_id', 'id', 'offline_sync_id', 'created_at']
              .includes(field) && !(table === 'cash_transactions' && field === 'event_id'))
            .some((field) => String(existingRow[field] ?? '') !== String(comparableRow[field] ?? ''));
          if (changed) {
            throw new Error(`${TABLE_LABELS[table]} با شناسهٔ ${row.id} با دفتر ثبت موجود یکسان نیست و بازنویسی نشد.`);
          }
          if (table === 'cash_transactions'
            && Object.hasOwn(comparableRow, 'event_id')
            && String(existingRow.event_id ?? '') !== String(comparableRow.event_id ?? '')) {
            const { error } = await updateRows(table, {
              event_id: comparableRow.event_id ?? null,
            }, [{ column: 'id', operator: 'eq', value: existingRow.id }]);
            if (error) {
              throw new Error(`اتصال گردش مالی ${row.id} به مراسم بازیابی نشد: ${error.message}`);
            }
            restoredCounts[table].updated += 1;
          }
          continue;
        }
        const { ...updates } = row;
        delete updates.id;
        delete updates.organization_id;
        const { error } = await updateRows(
          table,
          updates,
          [{ column: 'id', operator: 'eq', value: existingRow.id }],
        );
        if (error) {
          throw new Error(`به‌روزرسانی ${TABLE_LABELS[table]} با شناسهٔ ${existingRow.id} ناموفق بود: ${error.message}`);
        }
        restoredCounts[table].updated += 1;
      }
      if (rowsToInsert.length) {
        const { data, error } = await insertRows(table, rowsToInsert);
        if (error) throw new Error(`افزودن ${TABLE_LABELS[table]} ناموفق بود: ${error.message}`);
        if (!data || data.length !== sourceIdsToInsert.length) {
          throw new Error(`تعداد رکوردهای افزوده‌شده در ${TABLE_LABELS[table]} با فایل پشتیبان هم‌خوانی ندارد.`);
        }
        sourceIdsToInsert.forEach((sourceId, index) => {
          restoredIds.get(table).set(sourceId, data[index].id);
        });
        restoredCounts[table].inserted += rowsToInsert.length;
      }
    }
  } catch (error) {
    throw Object.assign(new Error(error.message), { restoredCounts });
  }

  return restoredCounts;
}
