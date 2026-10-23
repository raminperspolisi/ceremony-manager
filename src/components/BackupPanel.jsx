import React, { useRef, useState } from 'react';
import { SUPABASE_URL } from '../supabaseClient';
import { BACKUP_TABLES, createBackupDocument, validateBackupDocument } from '../backupUtils';
import { readAllBackupRows, restoreBackupDocument } from '../backupService';
import { insertRows, readTable, updateRows } from '../offlineSync';

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

const actionButtonStyle = {
  minHeight: 42,
  padding: '9px 14px',
  border: '1px solid #d7e4df',
  borderRadius: 9,
  background: '#28645a',
  color: '#fff',
  fontWeight: 700,
};

export default function BackupPanel({ userId }) {
  const fileInput = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const exportBackup = async () => {
    setBusy(true);
    setMessage('');
    setErrorMessage('');
    try {
      const results = await Promise.all(BACKUP_TABLES.map((table) => readAllBackupRows(table, readTable)));
      const failed = results.find((result) => result.error);
      if (failed) throw new Error(failed.error.message);
      const tables = Object.fromEntries(BACKUP_TABLES.map((table, index) => [table, results[index].data || []]));
      const document = createBackupDocument(tables, {
        exportedAt: new Date().toISOString(),
        userId,
        projectUrl: SUPABASE_URL,
      });
      const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `ceremony-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('فایل پشتیبان شامل اطلاعات محلیِ همگام‌نشده نیز ساخته شد. آن را در محل امن نگهداری کنید.');
    } catch (error) {
      setErrorMessage(`ساخت پشتیبان ناموفق بود: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async (file) => {
    setBusy(true);
    setMessage('');
    setErrorMessage('');
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('حجم فایل از سقف ۲۵ مگابایت بیشتر است.');
      const backup = validateBackupDocument(JSON.parse(await file.text()));
      if (backup.userId !== userId) throw new Error('این فایل پشتیبان متعلق به حساب کاربری دیگری است.');
      if (backup.projectUrl !== SUPABASE_URL) throw new Error('این فایل برای پروژهٔ دیگری ساخته شده است.');
      const confirmed = window.confirm(
        'بازیابی، رکوردهای دارای شناسهٔ یکسان را به‌روزرسانی و رکوردهای جدید را اضافه می‌کند؛ هیچ رکوردی حذف نمی‌شود. ادامه می‌دهید؟',
      );
      if (!confirmed) return;

      const restoredCounts = await restoreBackupDocument(backup, {
        userId,
        projectUrl: SUPABASE_URL,
        readTable,
        insertRows,
        updateRows,
      });

      const summary = BACKUP_TABLES
        .filter((table) => restoredCounts[table].updated || restoredCounts[table].inserted)
        .map((table) => `${TABLE_LABELS[table]}: ${restoredCounts[table].updated} به‌روزرسانی، ${restoredCounts[table].inserted} افزودن`);
      setMessage(summary.length ? `بازیابی انجام شد؛ ${summary.join('؛ ')}.` : 'همهٔ رکوردهای فایل از قبل وجود داشتند؛ تغییری لازم نبود.');
      window.dispatchEvent(new Event('offline-data-updated'));
    } catch (error) {
      const completed = BACKUP_TABLES
        .filter((table) => error.restoredCounts?.[table]?.updated || error.restoredCounts?.[table]?.inserted)
        .map((table) => `${TABLE_LABELS[table]} (${error.restoredCounts[table].updated} به‌روزرسانی، ${error.restoredCounts[table].inserted} افزودن)`);
      const progress = completed.length ? ` انجام‌شده تا این مرحله: ${completed.join('؛ ')}.` : '';
      setErrorMessage(`بازیابی کامل نشد: ${error.message}${progress} فایل را نگه دارید و پس از رفع خطا دوباره بررسی کنید.`);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <section className="backup-panel" dir="rtl" aria-labelledby="backup-panel-title">
      <div>
        <p className="page-eyebrow">ایمنی اطلاعات</p>
        <h3 id="backup-panel-title">پشتیبان‌گیری و بازیابی</h3>
        <p>یک فایل JSON از مشتریان، کالاها، مراسم‌ها، پیش‌فاکتورها و فاکتورهای رسمی دریافت کنید.</p>
      </div>
      <div className="backup-panel-actions">
        <button type="button" style={actionButtonStyle} onClick={exportBackup} disabled={busy}>
          {busy ? 'در حال پردازش…' : 'دریافت فایل پشتیبان'}
        </button>
        <button
          type="button"
          style={{ ...actionButtonStyle, background: '#fff', color: '#28645a' }}
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          انتخاب فایل و بازیابی
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          aria-label="انتخاب فایل پشتیبان"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void restoreBackup(file);
          }}
        />
      </div>
      <p className="backup-panel-note">
        بازیابی فقط در همان حساب و پروژه مجاز است و با ادغام انجام می‌شود؛ شناسه‌های موجود به‌روزرسانی می‌شوند و داده‌های فعلی حذف نمی‌شوند.
      </p>
      {message && <p className="backup-panel-message" role="status">{message}</p>}
      {errorMessage && <p className="backup-panel-error" role="alert">{errorMessage}</p>}
    </section>
  );
}
