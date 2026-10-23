import React, { useEffect, useMemo, useState } from 'react';
import moment from 'jalali-moment';
import { readTable } from '../offlineSync';
import { formatDisplay, formatPersianDigits } from '../styles';
import { formatDashboardDate, toDashboardIsoDate } from '../dashboardUtils';

const PAGE_SIZE = 1000;
const money = (value) => `${formatDisplay(Math.round(Number(value) || 0))} تومان`;

async function readAllRows(table, orderBy) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await readTable(table, { orderBy, ascending: false, offset, limit: PAGE_SIZE });
    if (result.error) return result;
    rows.push(...(result.data || []));
    if ((result.data || []).length < PAGE_SIZE) return { data: rows, error: null };
  }
}

export default function DashboardPanel({ onNavigate }) {
  const [invoices, setInvoices] = useState([]);
  const [ceremonies, setCeremonies] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const refresh = async () => {
    const [invoiceResult, ceremonyResult, customerResult] = await Promise.all([
      readAllRows('invoices', 'created_at'),
      readAllRows('ceremonies', 'ceremony_date'),
      readAllRows('customers', 'created_at'),
    ]);
    const failures = [
      invoiceResult.error && `فاکتورها: ${invoiceResult.error.message}`,
      ceremonyResult.error && `مراسم‌ها: ${ceremonyResult.error.message}`,
      customerResult.error && `مشتری‌ها: ${customerResult.error.message}`,
    ].filter(Boolean);
    setLoadError(failures.join('؛ '));
    if (!invoiceResult.error) setInvoices(invoiceResult.data || []);
    if (!ceremonyResult.error) setCeremonies(ceremonyResult.data || []);
    if (!customerResult.error) setCustomers(customerResult.data || []);
    setLoading(false);
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void refresh(); }, 0);
    const handleUpdate = () => { void refresh(); };
    window.addEventListener('offline-data-updated', handleUpdate);
    window.addEventListener('focus', handleUpdate);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener('offline-data-updated', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
    };
  }, []);

  const { receivables, pendingReminders, upcomingCeremonies } = useMemo(() => {
    const today = moment().format('YYYY-MM-DD');
    const nextMonth = moment().add(30, 'days').format('YYYY-MM-DD');
    const receivableInvoices = invoices.map((invoice) => {
      const total = Number(invoice.total_price || invoice.total_amount || 0);
      const paid = Number(invoice.paid_amount || 0);
      return { ...invoice, total, paid, remaining: Math.max(total - paid, 0) };
    });
    const paymentReminders = receivableInvoices
      .filter((invoice) => invoice.remaining > 0)
      .sort((first, second) => second.remaining - first.remaining)
      .map((invoice) => ({ ...invoice, reminderType: 'payment' }));
    const checklistReminders = receivableInvoices.flatMap((invoice) => (
      (Array.isArray(invoice.checklist) ? invoice.checklist : [])
        .filter((task) => task && !task.done)
        .map((task, index) => ({
          ...invoice,
          id: `${invoice.id}-task-${index}`,
          reminderType: 'task',
          taskTitle: task.title || task.text || 'پیگیری مراسم',
        }))
    ));

    const byCustomerDate = new Map();
    for (const invoice of receivableInvoices) {
      const date = toDashboardIsoDate(invoice.ceremony_date);
      if (!date || date < today || date > nextMonth) continue;
      const key = `${invoice.customer_id || invoice.customer_name || invoice.customer_phone || ''}:${date}`;
      byCustomerDate.set(key, {
        id: `invoice-${invoice.id}`,
        customer_name: invoice.customer_name || 'مشتری بدون نام',
        ceremony_type: invoice.ceremony_type || 'مراسم',
        ceremony_date: invoice.ceremony_date,
        date,
      });
    }
    const customerById = new Map(customers.map((customer) => [String(customer.id), customer]));
    for (const ceremony of ceremonies) {
      const date = toDashboardIsoDate(ceremony.ceremony_date);
      if (!date || date < today || date > nextMonth) continue;
      const customer = customerById.get(String(ceremony.customer_id));
      const name = ceremony.customer_name || customer?.['Full name'] || 'مشتری بدون نام';
      const key = `${ceremony.customer_id || name}:${date}`;
      if (!byCustomerDate.has(key)) {
        byCustomerDate.set(key, {
          id: `ceremony-${ceremony.id}`,
          customer_name: name,
          ceremony_type: ceremony.ceremony_type || 'مراسم',
          ceremony_date: ceremony.ceremony_date,
          date,
        });
      }
    }
    return {
      receivables: receivableInvoices.reduce((sum, invoice) => sum + invoice.remaining, 0),
      pendingReminders: [...checklistReminders, ...paymentReminders].slice(0, 8),
      upcomingCeremonies: [...byCustomerDate.values()].sort((first, second) => first.date.localeCompare(second.date)).slice(0, 8),
    };
  }, [ceremonies, customers, invoices]);

  const navigate = (section) => onNavigate(section);

  return (
    <div className="home-dashboard" dir="rtl">
      <section className="home-dashboard-welcome">
        <div>
          <span className="home-dashboard-eyebrow">نمای کلی کسب‌وکار</span>
          <h3>خوش آمدید</h3>
          <p>یادآوری‌ها، مراسم‌های نزدیک و وضعیت مطالبات شما در یک نگاه.</p>
          <span className="home-dashboard-today">{formatDashboardDate(new Date().toISOString())}</span>
        </div>
        <button type="button" className="home-dashboard-refresh" onClick={() => { setLoading(true); void refresh(); }} disabled={loading}>
          {loading ? 'در حال به‌روزرسانی…' : 'تازه‌سازی'}
        </button>
      </section>

      {loadError && <div className="cashbook-alert cashbook-alert-error" role="alert">{loadError}</div>}

      <section className="home-dashboard-metrics" aria-label="خلاصهٔ کسب‌وکار">
        <button type="button" className="home-metric-card home-metric-receivables" onClick={() => navigate('reminders')}>
          <span>مطالبات از مشتریان</span>
          <strong>{loading ? '—' : money(receivables)}</strong>
          <small>برای پیگیری و ثبت دریافت</small>
        </button>
        <button type="button" className="home-metric-card home-metric-events" onClick={() => navigate('calendar')}>
          <span>مراسم‌های ۳۰ روز آینده</span>
          <strong>{loading ? '—' : formatDisplay(upcomingCeremonies.length)}</strong>
          <small>مشاهده در تقویم مراسم‌ها</small>
        </button>
        <button type="button" className="home-metric-card home-metric-customers" onClick={() => navigate('customers')}>
          <span>مشتریان ثبت‌شده</span>
          <strong>{loading ? '—' : formatDisplay(customers.length)}</strong>
          <small>رفتن به فهرست مشتریان</small>
        </button>
      </section>

      <div className="home-dashboard-columns">
        <section className="home-dashboard-card">
          <div className="home-dashboard-card-heading">
            <div><span>پیگیری</span><h4>یادآوری‌های مالی</h4></div>
            <button type="button" onClick={() => navigate('reminders')}>همهٔ یادآوری‌ها</button>
          </div>
          {loading ? <p className="home-dashboard-empty">در حال بارگذاری…</p> : pendingReminders.length === 0 ? (
            <p className="home-dashboard-empty">موردی برای پیگیری پرداخت وجود ندارد.</p>
          ) : (
            <div className="home-reminder-list">
              {pendingReminders.map((invoice) => (
                <button type="button" className="home-reminder-item" key={`${invoice.reminderType}-${invoice.id}`} onClick={() => navigate(invoice.reminderType === 'task' ? 'official' : 'reminders')}>
                  <span className="home-reminder-dot" />
                  <span className="home-reminder-content">
                    <strong>{invoice.customer_name || 'مشتری بدون نام'}</strong>
                    <small>{invoice.reminderType === 'task'
                      ? invoice.taskTitle
                      : `ماندهٔ فاکتور ${formatPersianDigits(invoice.invoice_number || invoice.invoiceNumber || invoice.id)}`}</small>
                  </span>
                  {invoice.reminderType === 'payment' && <strong className="home-reminder-amount">{money(invoice.remaining)}</strong>}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="home-dashboard-card">
          <div className="home-dashboard-card-heading">
            <div><span>برنامه‌ریزی</span><h4>مراسم‌های نزدیک</h4></div>
            <button type="button" onClick={() => navigate('calendar')}>تقویم</button>
          </div>
          {loading ? <p className="home-dashboard-empty">در حال بارگذاری…</p> : upcomingCeremonies.length === 0 ? (
            <p className="home-dashboard-empty">تا ۳۰ روز آینده مراسمی ثبت نشده است.</p>
          ) : (
            <div className="home-ceremony-list">
              {upcomingCeremonies.map((ceremony) => (
                <button type="button" className="home-ceremony-item" key={ceremony.id} onClick={() => navigate('calendar')}>
                  <span className="home-ceremony-date">{formatDashboardDate(ceremony.ceremony_date)}</span>
                  <span className="home-ceremony-info"><strong>{ceremony.customer_name}</strong><small>{ceremony.ceremony_type}</small></span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="home-dashboard-shortcuts" aria-label="دسترسی سریع">
        <h4>دسترسی سریع</h4>
        <div>
          <button type="button" onClick={() => navigate('customers')}>ثبت یا جستجوی مشتری</button>
          <button type="button" onClick={() => navigate('official')}>فاکتورهای رسمی</button>
          <button type="button" onClick={() => navigate('cashbook')}>صندوق و بانک</button>
          <button type="button" onClick={() => navigate('quotations')}>ساخت پیش‌فاکتور</button>
        </div>
      </section>
    </div>
  );
}
