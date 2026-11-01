export const BACKUP_FORMAT = 'ceremony-manager-backup';
export const BACKUP_VERSION = 6;
export const BACKUP_TABLES = [
  'customers',
  'ceremonies',
  'events',
  'event_tasks',
  'inventory',
  'quotations',
  'invoices',
  'financial_accounts',
  'cash_transactions',
  'inventory_warehouses',
  'inventory_suppliers',
  'inventory_purchase_receipts',
  'inventory_transfers',
  'inventory_reservations',
  'inventory_stock_movements',
  'invoice_expenses',
];
const PRE_CASHBOOK_TABLES = ['customers', 'ceremonies', 'events', 'inventory', 'quotations', 'invoices'];
const PRE_INVENTORY_TABLES = [
  'customers',
  'ceremonies',
  'events',
  'inventory',
  'quotations',
  'invoices',
  'financial_accounts',
  'cash_transactions',
];
const PRE_INVOICE_EXPENSES_TABLES = BACKUP_TABLES.filter(
  (table) => !['invoice_expenses', 'event_tasks'].includes(table),
);
const PRE_EVENT_TASKS_TABLES = BACKUP_TABLES.filter((table) => table !== 'event_tasks');

export function createBackupDocument(tables, { exportedAt, userId, projectUrl, organizationId }) {
  const backupTables = Object.fromEntries(BACKUP_TABLES.map((table) => {
    const rows = tables[table] || [];
    if (table !== 'inventory_stock_movements') return [table, rows];
    return [table, rows.filter((row) => (
      !['purchase', 'transfer'].includes(row.source_type)
      && !(row.source_type === 'invoice' && row.movement_type === 'sale_issue' && !row.reservation_id)
    ))];
  }));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    userId,
    projectUrl,
    organizationId,
    tables: backupTables,
  };
}

export function validateBackupDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ساختار فایل پشتیبان معتبر نیست.');
  }
  if (value.format !== BACKUP_FORMAT || ![1, 2, 3, 4, 5, BACKUP_VERSION].includes(value.version)) {
    throw new Error('نسخه یا قالب فایل پشتیبان پشتیبانی نمی‌شود.');
  }
  if (!value.userId || !value.projectUrl || !value.tables || typeof value.tables !== 'object') {
    throw new Error('اطلاعات حساب یا جدول‌های فایل پشتیبان ناقص است.');
  }
  if (value.version === BACKUP_VERSION && typeof value.organizationId !== 'string') {
    throw new Error('شناسهٔ فضای کاری در فایل پشتیبان وجود ندارد.');
  }

  const requiredTables = value.version === 1
    ? PRE_CASHBOOK_TABLES
    : value.version === BACKUP_VERSION
      ? BACKUP_TABLES
      : value.version === 4
        ? PRE_INVOICE_EXPENSES_TABLES
        : value.version === 5
          ? PRE_EVENT_TASKS_TABLES
          : PRE_INVENTORY_TABLES;
  const compatibleTables = value.version === BACKUP_VERSION
    ? value.tables
    : {
      ...Object.fromEntries(BACKUP_TABLES.map((table) => [table, []])),
      ...value.tables,
      ...(value.version === 1 ? { financial_accounts: [], cash_transactions: [] } : {}),
    };
  for (const table of requiredTables) {
    const rows = compatibleTables[table];
    if (!Array.isArray(rows)) throw new Error(`فهرست ${table} در فایل پشتیبان معتبر نیست.`);
    if (rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row) || row.id === undefined || row.id === null)) {
      throw new Error(`هر ردیف ${table} باید یک شناسهٔ معتبر داشته باشد.`);
    }
    if (new Set(rows.map((row) => String(row.id))).size !== rows.length) {
      throw new Error(`شناسهٔ تکراری در فهرست ${table} فایل پشتیبان وجود دارد.`);
    }
  }

  return { ...value, version: BACKUP_VERSION, tables: compatibleTables };
}
