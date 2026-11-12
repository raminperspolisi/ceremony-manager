import React, { useCallback, useEffect, useMemo, useState } from 'react';
import moment from 'jalali-moment';
import { readTable } from '../offlineSync';
import { formatDisplay, formatMoney, formatPersianDigits } from '../styles';
import { formatDashboardDate, getPendingEventTasks, toDashboardIsoDate } from '../dashboardUtils';
import BusinessContactCard from './BusinessContactCard';
import DashboardTaskNotebook from './DashboardTaskNotebook';

const PAGE_SIZE = 1000;
const money = (value) => formatMoney(value);

function DashboardListSkeleton() {
  return (
    <div className="home-dashboard-skeleton" role="status" aria-label="در حال بارگذاری">
      <span />
      <span />
      <span />
    </div>
  );
}

async function readAllRows(table, orderBy) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await readTable(table, { orderBy, ascending: false, offset, limit: PAGE_SIZE });
    if (result.error) return result;
    rows.push(...(result.data || []));
    if ((result.data || []).length < PAGE_SIZE) return { data: rows, error: null };
  }
}

export default function DashboardPanel({
  onNavigate,
  businessName,
  businessContact,
  onEditProfile,
  canViewBusinessContacts = false,
  canViewCalendar = false,
}) {
  const [invoices, setInvoices] = useState([]);
  const [ceremonies, setCeremonies] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [businessContactCount, setBusinessContactCount] = useState(0);
  const [events, setEvents] = useState([]);
  const [eventTasks, setEventTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    const [invoiceResult, ceremonyResult, customerResult, eventResult, eventTaskResult, businessContactResult] = await Promise.all([
      readAllRows('invoices', 'created_at'),
      readAllRows('ceremonies', 'ceremony_date'),
      readAllRows('customers', 'created_at'),
      canViewCalendar ? readAllRows('events', 'event_date') : Promise.resolve({ data: [], error: null }),
      canViewCalendar ? readAllRows('event_tasks', 'created_at') : Promise.resolve({ data: [], error: null }),
      canViewBusinessContacts
        ? readAllRows('business_contacts', 'created_at')
        : Promise.resolve({ data: [], error: null }),
    ]);
    const failures = [
      invoiceResult.error && `فاکتورها: ${invoiceResult.error.message}`,
      ceremonyResult.error && `مراسم‌ها: ${ceremonyResult.error.message}`,
      customerResult.error && `مشتری‌ها: ${customerResult.error.message}`,
      eventResult.error && `مراسم‌ها: ${eventResult.error.message}`,
      eventTaskResult.error && `کارهای مراسم: ${eventTaskResult.error.message}`,
      businessContactResult.error && `مخاطبان کاری: ${businessContactResult.error.message}`,
    ].filter(Boolean);
    setLoadError(failures.join('؛ '));
    if (!invoiceResult.error) setInvoices(invoiceResult.data || []);
    if (!ceremonyResult.error) setCeremonies(ceremonyResult.data || []);
    if (!customerResult.error) setCustomers(customerResult.data || []);
    if (!eventResult.error) setEvents(eventResult.data || []);
    if (!eventTaskResult.error) setEventTasks(eventTaskResult.data || []);
    if (!businessContactResult.error) setBusinessContactCount(businessContactResult.data?.length || 0);
    setLoading(false);
  }, [canViewBusinessContacts, canViewCalendar]);

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
  }, [refresh]);

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

  const pendingEventTasks = useMemo(() => (
    getPendingEventTasks(eventTasks, events, moment().format('YYYY-MM-DD'))
  ), [eventTasks, events]);

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
        {canViewBusinessContacts && (
          <button type="button" className="home-metric-card home-metric-customers" onClick={() => navigate('business-contacts')}>
            <span>مخاطبان کاری</span>
            <strong>{loading ? '—' : formatDisplay(businessContactCount)}</strong>
            <small>رفتن به دفترچهٔ مخاطبان کاری</small>
          </button>
        )}
        {canViewCalendar && (
          <button type="button" className="home-metric-card home-metric-tasks" onClick={() => navigate('calendar')}>
            <span>کارهای باقی‌ماندهٔ مراسم</span>
            <strong>{loading ? '—' : formatDisplay(pendingEventTasks.length)}</strong>
            <small>پیگیری در تقویم مراسم‌ها</small>
          </button>
        )}
        <DashboardTaskNotebook />
      </section>

      <div className="home-dashboard-columns">
        <section className="home-dashboard-card">
          <div className="home-dashboard-card-heading">
            <div><span>پیگیری</span><h4>یادآوری‌های مالی</h4></div>
            <button type="button" onClick={() => navigate('reminders')}>همهٔ یادآوری‌ها</button>
          </div>
          {loading ? <DashboardListSkeleton /> : pendingReminders.length === 0 ? (
            <div className="home-dashboard-empty-state">
              <span aria-hidden="true">✓</span>
              <p>موردی برای پیگیری پرداخت وجود ندارد.</p>
              <button type="button" onClick={() => navigate('reminders')}>مشاهدهٔ یادآوری‌ها</button>
            </div>
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
          {loading ? <DashboardListSkeleton /> : upcomingCeremonies.length === 0 ? (
            <div className="home-dashboard-empty-state">
              <span aria-hidden="true">▦</span>
              <p>تا ۳۰ روز آینده مراسمی ثبت نشده است.</p>
              <button type="button" onClick={() => navigate('calendar')}>ثبت مراسم جدید</button>
            </div>
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

      {canViewCalendar && (
        <section className="home-dashboard-card home-dashboard-task-card">
          <div className="home-dashboard-card-heading">
            <div><span>پروندهٔ اجرایی</span><h4>کارهای انجام‌نشدهٔ مراسم</h4></div>
            <button type="button" onClick={() => navigate('calendar')}>تقویم مراسم‌ها</button>
          </div>
          {loading ? <DashboardListSkeleton /> : pendingEventTasks.length === 0 ? (
            <div className="home-dashboard-empty-state">
              <span aria-hidden="true">✓</span>
              <p>همهٔ کارهای ثبت‌شده انجام شده‌اند.</p>
              <button type="button" onClick={() => navigate('calendar')}>تقویم مراسم‌ها</button>
            </div>
          ) : (
            <div className="home-event-task-list">
              {pendingEventTasks.map((task) => (
                <button
                  type="button"
                  className="home-reminder-item home-event-task-item"
                  key={task.id}
                  onClick={() => navigate('calendar')}
                >
                  <span className="home-reminder-dot" />
                  <span className="home-reminder-content">
                    <strong>{task.title}</strong>
                    <small>
                      {task.customer_name} · {task.event_type}
                      {task.assignee ? ` · مسئول: ${task.assignee}` : ''}
                    </small>
                  </span>
                  <span className="home-ceremony-date">{formatDashboardDate(task.event_date)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="home-dashboard-shortcuts" aria-label="دسترسی سریع">
        <h4>دسترسی سریع</h4>
        <div>
          {canViewCalendar && (
            <button type="button" className="home-dashboard-shortcut-primary" onClick={() => navigate('calendar')}>
              ثبت مراسم جدید
            </button>
          )}
          <button type="button" onClick={() => navigate('customers')}>ثبت یا جستجوی مشتری</button>
          {canViewBusinessContacts && <button type="button" onClick={() => navigate('business-contacts')}>ثبت مخاطب کاری</button>}
          <button type="button" onClick={() => navigate('official')}>فاکتورهای رسمی</button>
          <button type="button" onClick={() => navigate('cashbook')}>صندوق و بانک</button>
          <button type="button" onClick={() => navigate('quotations')}>ساخت پیش‌فاکتور</button>
        </div>
      </section>

      <BusinessContactCard
        businessName={businessName}
        contact={businessContact}
        onEdit={onEditProfile}
      />
    </div>
  );
}
