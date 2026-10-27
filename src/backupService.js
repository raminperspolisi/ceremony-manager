import { BACKUP_TABLES, validateBackupDocument } from './backupUtils.js';

const TABLE_LABELS = {
  customers: 'مشتریان',
  ceremonies: 'مراسم‌ها',
  events: 'رویدادها',
  inventory: 'کالاهای انبار',
  quotations: 'پیش‌فاکتورها',
  invoices: 'فاکتورهای رسمی',
  financial_accounts: 'حساب‌های صندوق و بانک',
  cash_transactions: 'گردش‌های مالی',
};

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
    const references = table === 'invoices'
      ? [['quotation_id', 'quotations']]
      : table === 'cash_transactions'
        ? [
          ['account_id', 'financial_accounts'],
          ['transfer_to_account_id', 'financial_accounts'],
          ['invoice_id', 'invoices'],
        ]
        : [];
    for (const [column, referencedTable] of references) {
      const mappedId = restoredIds.get(referencedTable).get(String(row[column]));
      if (mappedId !== undefined) row[column] = mappedId;
    }
    return row;
  };
  try {
    for (const table of BACKUP_TABLES) {
      const { data: existingRows, error: readError } = await readAllBackupRows(table, readTable);
      if (readError) throw new Error(`خواندن ${TABLE_LABELS[table]} ناموفق بود: ${readError.message}`);

      const existingIds = new Set((existingRows || []).map((row) => String(row.id)));
      const rowsToInsert = [];
      const sourceIdsToInsert = [];
      restoredCounts[table] = { updated: 0, inserted: 0 };
      for (const row of backup.tables[table]) {
        if (!existingIds.has(String(row.id))) {
          const insertRow = rewriteReferences(table, row);
          delete insertRow.id;
          rowsToInsert.push(insertRow);
          sourceIdsToInsert.push(String(row.id));
          continue;
        }
        restoredIds.get(table).set(String(row.id), row.id);
        if (table === 'cash_transactions') {
          const existingRow = existingRows.find((item) => String(item.id) === String(row.id));
          const immutableFields = [
            'transaction_type',
            'amount',
            'account_id',
            'transfer_to_account_id',
            'invoice_id',
            'category',
            'description',
            'transaction_date',
            'reference_number',
            'receipt_note',
            'offline_sync_id',
          ];
          const changed = immutableFields.some((field) => Object.hasOwn(row, field) && (
            String(existingRow[field] ?? '') !== String(row[field] ?? '')
          ));
          if (changed) throw new Error(`گردش مالی با شناسهٔ ${row.id} با دفتر ثبت موجود یکسان نیست و بازنویسی نشد.`);
          continue;
        }
        const { id, ...updates } = row;
        delete updates.organization_id;
        const { error } = await updateRows(table, updates, [{ column: 'id', operator: 'eq', value: id }]);
        if (error) throw new Error(`به‌روزرسانی ${TABLE_LABELS[table]} با شناسهٔ ${id} ناموفق بود: ${error.message}`);
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
        restoredCounts[table].inserted = rowsToInsert.length;
      }
    }
  } catch (error) {
    throw Object.assign(new Error(error.message), { restoredCounts });
  }

  return restoredCounts;
}
