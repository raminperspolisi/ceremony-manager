import React, { useCallback, useEffect, useState } from 'react';
import { readTable, updateRows } from '../offlineSync';

const ORDER_STATUSES = [
  { value: 'pending', label: 'جدید' },
  { value: 'approved', label: 'تأییدشده؛ منتظر پرداخت' },
  { value: 'payment_review', label: 'نیازمند بررسی مدیر' },
  { value: 'rejected', label: 'ردشده' },
  { value: 'payment_review', label: 'نیازمند بررسی مدیر' },
  { value: 'processing', label: 'در حال پیگیری' },
  { value: 'completed', label: 'انجام‌شده' },
  { value: 'cancelled', label: 'لغوشده' },
];

const formatMoney = (value) => (
  value === null || value === undefined
    ? 'توافقی'
    : `${Number(value).toLocaleString('fa-IR')} تومان`
);

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('fa-IR');
};

export default function BotOrdersPanel() {
  const [orders, setOrders] = useState(null);
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [priceDrafts, setPriceDrafts] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [errorMessage, setErrorMessage] = useState('');
  const [feedback, setFeedback] = useState('');
  const [offlineData, setOfflineData] = useState(false);

  const refreshOrders = useCallback(async () => {
    const result = await readTable('bot_orders', {
      orderBy: 'created_at',
      ascending: false,
      limit: 300,
    });
    if (result.error) {
      setErrorMessage(`دریافت سفارش‌ها ناموفق بود: ${result.error.message}`);
      setOrders((current) => current ?? []);
    } else {
      setErrorMessage('');
      setOrders(result.data || []);
      setOfflineData(Boolean(result.offline));
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(refreshOrders, 0);
    const timer = window.setInterval(() => refreshOrders(), 30000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [refreshOrders]);

  const handleStatusChange = async (order, status) => {
    setBusyOrderId(order.id);
    setErrorMessage('');
    setFeedback('');
    try {
      const result = await updateRows(
        'bot_orders',
        { status },
        [{ column: 'id', operator: 'eq', value: order.id }],
      );
      if (result.error) throw new Error(result.error.message);
      setOrders((current) => current.map((item) => (
        String(item.id) === String(order.id) ? { ...item, status } : item
      )));
      setFeedback('وضعیت سفارش به‌روزرسانی شد.');
    } catch (error) {
      setErrorMessage(`تغییر وضعیت سفارش ناموفق بود: ${error.message}`);
    } finally {
      setBusyOrderId(null);
    }
  };

  const handlePriceSave = async (order) => {
    const rawAmount = priceDrafts[order.id] ?? '';
    const amount = Number(rawAmount);
    if (!rawAmount.trim() || !Number.isSafeInteger(amount) || amount < 0) {
      setErrorMessage('مبلغ نهایی باید عدد صحیح و نامنفی باشد.');
      return;
    }

    setBusyOrderId(order.id);
    setErrorMessage('');
    setFeedback('');
    try {
      const result = await updateRows(
        'bot_orders',
        { total_price: amount },
        [{ column: 'id', operator: 'eq', value: order.id }],
      );
      if (result.error) throw new Error(result.error.message);
      setOrders((current) => current.map((item) => (
        String(item.id) === String(order.id) ? { ...item, total_price: amount } : item
      )));
      setPriceDrafts((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
      setFeedback(
        'مبلغ نهایی ذخیره شد. آن را به مشتری اعلام کنید و وضعیت پرداخت را فقط پس از بررسی بانک تکمیل کنید.',
      );
    } catch (error) {
      setErrorMessage(`ذخیرهٔ مبلغ نهایی ناموفق بود: ${error.message}`);
    } finally {
      setBusyOrderId(null);
    }
  };

  const orderList = orders || [];
  const visibleOrders = statusFilter === 'all'
    ? orderList
    : orderList.filter((order) => order.status === statusFilter);

  return (
    <section className="bot-orders-panel" dir="rtl" aria-label="سفارش‌های ربات">
      <div className="bot-orders-toolbar">
        <div>
          <h3>سفارش‌های ربات</h3>
          <p>سفارش‌ها ثبت می‌شوند، اما موجودی انبار با آن‌ها تغییر نمی‌کند.</p>
        </div>
        <div className="bot-orders-controls">
          <label>
            نمایش
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">همهٔ سفارش‌ها</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => refreshOrders()} disabled={orders === null}>
            ↻ تازه‌سازی
          </button>
        </div>
      </div>

      {offlineData && (
        <p className="bot-orders-message" role="status">
          اتصال برقرار نیست؛ ممکن است فهرست سفارش‌های ذخیره‌شده در این دستگاه کامل نباشد.
        </p>
      )}
      {errorMessage && <p className="bot-orders-message error" role="alert">{errorMessage}</p>}
      {feedback && <p className="bot-orders-message success" role="status">{feedback}</p>}
      {!errorMessage && orders === null && (
        <div className="bot-orders-empty">در حال دریافت سفارش‌ها…</div>
      )}
      {!errorMessage && orders !== null && visibleOrders.length === 0 && (
        <div className="bot-orders-empty">
          هنوز سفارشی ثبت نشده است. بعد از اجرای migration سفارش‌ها، درخواست‌های بات در این قسمت دیده می‌شوند.
        </div>
      )}

      <div className="bot-orders-list">
        {visibleOrders.map((order) => {
          const status = ORDER_STATUSES.find((item) => item.value === order.status);
          const items = Array.isArray(order.items) ? order.items : [];
          return (
            <article className="bot-order-card" key={order.id}>
              <header className="bot-order-card-header">
                <div>
                  <strong>سفارش #{order.id}</strong>
                  <time dateTime={order.created_at}>{formatDate(order.created_at)}</time>
                </div>
                <label className={`bot-order-status status-${order.status}`}>
                  <span>وضعیت:</span>
                  <select
                    aria-label={`وضعیت سفارش ${order.id}`}
                    value={order.status}
                    disabled={String(busyOrderId) === String(order.id)}
                    onChange={(event) => handleStatusChange(order, event.target.value)}
                  >
                    {ORDER_STATUSES.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {!status && <span>{order.status}</span>}
                </label>
              </header>

              <div className="bot-order-customer">
                <strong>{order.customer_name || 'مشتری تلگرام'}</strong>
                {order.telegram_username && <span dir="ltr">@{order.telegram_username}</span>}
                {order.telegram_user_id && <small>شناسه تلگرام: {order.telegram_user_id}</small>}
              </div>

              <ul className="bot-order-items">
                {items.map((item, index) => (
                  <li key={`${item.id}-${index}`}>
                    <div>
                      <strong>{item.title || 'کالای حذف‌شده'}</strong>
                      {item.description && <p>{item.description}</p>}
                    </div>
                    <div className="bot-order-item-prices">
                      <span>تعداد: {item.quantity}</span>
                      {['price_level1', 'price_level2', 'price_level3'].some(
                        (key) => Object.prototype.hasOwnProperty.call(item, key),
                      ) ? (
                        <>
                          <span>قیمت سطح ۱: {formatMoney(item.price_level1)}</span>
                          <span>قیمت سطح ۲: {formatMoney(item.price_level2)}</span>
                          <span>قیمت سطح ۳: {formatMoney(item.price_level3)}</span>
                        </>
                      ) : (
                        <span>قیمت واحد: {formatMoney(item.unit_price)}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <footer className="bot-order-total">
                <span>{order.total_price === null ? 'قیمت نهایی' : 'جمع سفارش'}</span>
                <strong>{formatMoney(order.total_price)}</strong>
              </footer>
              {order.total_price === null && (
                <div className="bot-order-quote">
                  <label htmlFor={`bot-order-price-${order.id}`}>
                    مبلغ نهایی توافق‌شده (تومان)
                    <input
                      id={`bot-order-price-${order.id}`}
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={priceDrafts[order.id] ?? ''}
                      disabled={String(busyOrderId) === String(order.id)}
                      onChange={(event) => setPriceDrafts((current) => ({
                        ...current,
                        [order.id]: event.target.value,
                      }))}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => handlePriceSave(order)}
                    disabled={String(busyOrderId) === String(order.id)}
                  >
                    ثبت مبلغ
                  </button>
                  <small>
                    پس از ثبت، مبلغ و اطلاعات پرداخت را به مشتری اعلام کنید؛ انتقال بانکی خودکار تأیید نمی‌شود.
                  </small>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
