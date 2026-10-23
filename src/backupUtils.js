export const BACKUP_FORMAT = 'ceremony-manager-backup';
export const BACKUP_VERSION = 2;
export const BACKUP_TABLES = [
  'customers',
  'ceremonies',
  'events',
  'inventory',
  'quotations',
  'invoices',
  'financial_accounts',
  'cash_transactions',
];
const PRE_CASHBOOK_TABLES = ['customers', 'ceremonies', 'events', 'inventory', 'quotations', 'invoices'];

export function createBackupDocument(tables, { exportedAt, userId, projectUrl }) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    userId,
    projectUrl,
    tables: Object.fromEntries(BACKUP_TABLES.map((table) => [table, tables[table] || []])),
  };
}

export function validateBackupDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ساختار فایل پشتیبان معتبر نیست.');
  }
  if (value.format !== BACKUP_FORMAT || ![1, BACKUP_VERSION].includes(value.version)) {
    throw new Error('نسخه یا قالب فایل پشتیبان پشتیبانی نمی‌شود.');
  }
  if (!value.userId || !value.projectUrl || !value.tables || typeof value.tables !== 'object') {
    throw new Error('اطلاعات حساب یا جدول‌های فایل پشتیبان ناقص است.');
  }

  const compatibleTables = value.version === 1
    ? { ...value.tables, financial_accounts: [], cash_transactions: [] }
    : value.tables;
  for (const table of value.version === 1 ? PRE_CASHBOOK_TABLES : BACKUP_TABLES) {
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
