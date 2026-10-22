import React, { useCallback, useEffect, useState } from 'react';
import { readTable } from '../offlineSync';
import moment from 'jalali-moment';
import html2canvas from 'html2canvas';
import { formatPersianDigits } from '../styles';

const getInvoiceItems = (invoice) => (
  [invoice.items_data, invoice.items_json, invoice.items]
    .find((items) => Array.isArray(items) && items.length > 0)
    ?.filter((item) => item && typeof item === 'object') || []
);

const INVOICE_PAGE_SIZE = 50;

const getUnitPrice = (item) => {
  const priceLevel = String(item.price_level || '1');
  if (priceLevel === '2') return Number(item.p2 || 0);
  if (priceLevel === '3') return Number(item.p3 || 0);
  return Number(item.p1 ?? item.unit_price ?? item.price ?? 0);
};

const formatMoney = (value) => `${Math.round(Number(value) || 0).toLocaleString('fa-IR')} تومان`;
const formatDate = (value) => {
  if (!value) return 'ثبت نشده';

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? 'تاریخ نامعتبر'
      : moment(value).locale('fa').format('jYYYY/jMM/jDD');
  }

  const normalized = String(value)
    .trim()
    .replace(/[۰-۹]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))
    .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit));
  const jalaliDate = /^(13|14)\d{2}[/-]/.test(normalized);
  const isoDate = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(normalized);
  const gregorianSlashDate = /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(normalized);
  const parsedDate = jalaliDate
    ? moment(normalized.replace(/-/g, '/'), 'jYYYY/jM/jD', true)
    : isoDate
      ? moment(normalized, moment.ISO_8601, true)
      : gregorianSlashDate
        ? moment(normalized, 'YYYY/M/D', true)
        : null;

  return parsedDate?.isValid()
    ? parsedDate.locale('fa').format('jYYYY/jMM/jDD')
    : 'تاریخ نامعتبر';
};

const getInvoiceSummary = (invoice) => {
  const total = Number(invoice.total_price || invoice.total_amount || 0);
  const paid = Number(invoice.paid_amount || 0);
  return {
    total,
    paid,
    remaining: Math.max(total - paid, 0),
    items: getInvoiceItems(invoice).map((item) => {
      const quantity = Math.max(Number(item.qty || item.quantity || item.requestedQuantity || 1), 0);
      const unitPrice = getUnitPrice(item);
      return {
        title: item.title || item.item_name || item.name || 'خدمت',
        type: ['rent', 'اجاره', 'اجاره‌ای'].includes(item.item_type || item.type) ? 'اجاره‌ای' : 'فروشی',
        quantity,
        unitPrice,
        amount: unitPrice * quantity,
      };
    }),
  };
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const createInvoiceImageMarkup = (invoice, businessName, logoUrl) => {
  const summary = getInvoiceSummary(invoice);
  const invoiceNumber = invoice.invoice_number || invoice.invoiceNumber || invoice.id;
  const statusLabels = {
    paid: 'تسویه شده',
    deposit_paid: 'بیعانه پرداخت شده',
    unpaid: 'تسویه نشده',
  };
  const rows = summary.items.length
    ? summary.items.map((item, index) => `
        <tr>
          <td>${(index + 1).toLocaleString('fa-IR')}</td>
          <td>${escapeHtml(item.title)}</td>
          <td>${item.type}</td>
          <td>${item.quantity.toLocaleString('fa-IR')}</td>
          <td>${formatMoney(item.unitPrice)}</td>
          <td>${formatMoney(item.amount)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="6">اقلام فاکتور ثبت نشده است.</td></tr>';

  return `
    <div style="box-sizing:border-box;width:900px;padding:38px;background:#fff;color:#1e293b;direction:rtl;font-family:Vazirmatn,Tahoma,sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:18px;padding-bottom:18px;border-bottom:3px solid #0f766e;">
        <div>
          <div style="font-size:25px;font-weight:800;color:#0f172a;">فاکتور رسمی فروش و اجاره ${escapeHtml(businessName)}</div>
          <div style="margin-top:8px;font-size:15px;color:#0f766e;">یادآوری مراسم و وضعیت فاکتور</div>
        </div>
        <img src="${escapeHtml(logoUrl)}" alt="لوگوی ${escapeHtml(businessName)}" style="width:82px;height:96px;object-fit:contain;">
      </div>
      <div style="margin:20px 0;padding:16px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;font-size:15px;line-height:2;">
        <div style="font-size:17px;font-weight:700;">سلام ${escapeHtml(invoice.customer_name || 'مشتری گرامی')} محترم،</div>
        <div>یادآوری مراسم شما را از طرف ${escapeHtml(businessName)} تقدیم می‌کنیم. مشتاق دیدار شما هستیم.</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px 28px;margin-top:8px;">
          <span><strong>شماره فاکتور:</strong> #${escapeHtml(formatPersianDigits(invoiceNumber))}</span>
          <span><strong>شماره تماس:</strong> ${escapeHtml(formatPersianDigits(invoice.customer_phone || invoice.phone || 'ثبت نشده'))}</span>
          <span><strong>تاریخ ثبت:</strong> ${escapeHtml(formatDate(invoice.order_date || invoice.created_at))}</span>
          <span><strong>تاریخ مراسم:</strong> ${escapeHtml(formatDate(invoice.ceremony_date))}</span>
        </div>
        ${(invoice.customer_address || invoice.address) ? `<div><strong>نشانی:</strong> ${escapeHtml(invoice.customer_address || invoice.address)}</div>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#e2e8f0;">
          <th style="padding:10px;border:1px solid #94a3b8;">ردیف</th>
          <th style="padding:10px;border:1px solid #94a3b8;">نام کالا / خدمت</th>
          <th style="padding:10px;border:1px solid #94a3b8;">نوع</th>
          <th style="padding:10px;border:1px solid #94a3b8;">تعداد</th>
          <th style="padding:10px;border:1px solid #94a3b8;">قیمت واحد</th>
          <th style="padding:10px;border:1px solid #94a3b8;">قیمت کل</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="display:grid;gap:9px;margin-top:20px;padding:18px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;font-size:15px;">
        <div style="display:flex;justify-content:space-between;"><strong>مبلغ کل فاکتور:</strong><strong>${formatMoney(summary.total)}</strong></div>
        <div style="display:flex;justify-content:space-between;"><strong>مبلغ پرداخت‌شده:</strong><strong>${formatMoney(summary.paid)}</strong></div>
        <div style="display:flex;justify-content:space-between;color:${summary.remaining ? '#b91c1c' : '#15803d'};"><strong>مانده بدهی:</strong><strong>${formatMoney(summary.remaining)}</strong></div>
        <div style="display:flex;justify-content:space-between;"><strong>وضعیت پرداخت:</strong><strong>${statusLabels[invoice.payment_status] || (summary.remaining ? 'تسویه نشده' : 'تسویه شده')}</strong></div>
      </div>
      <div style="margin-top:20px;padding-top:14px;border-top:1px solid #cbd5e1;text-align:center;color:#475569;font-size:13px;line-height:1.9;">
        برای هماهنگی‌های نهایی یا تسویه، با ما در تماس باشید.<br>        با احترام، ${escapeHtml(businessName)} 🙏
      </div>
    </div>`;
};

const renderInvoiceImage = async (invoice, businessName, logoUrl) => {
  const imageElement = document.createElement('div');
  imageElement.innerHTML = createInvoiceImageMarkup(invoice, businessName, logoUrl);
  Object.assign(imageElement.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    zIndex: '-1',
    width: '900px',
    background: '#fff',
  });
  document.body.appendChild(imageElement);
  try {
    await document.fonts?.ready;
    const logo = imageElement.querySelector('img');
    if (logo && !logo.complete) {
      await new Promise((resolve) => {
        logo.onload = resolve;
        logo.onerror = resolve;
      });
    }
    const canvas = await html2canvas(imageElement.firstElementChild, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
    });
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((imageBlob) => {
        if (imageBlob) resolve(imageBlob);
        else reject(new Error('ساخت فایل تصویر ناموفق بود.'));
      }, 'image/png');
    });
    return { blob, fileName: `Azho-invoice-${invoice.id}.png` };
  } finally {
    imageElement.remove();
  }
};

const normalizeTelegramPhone = (phone) => {
  let digits = String(phone || '')
    .replace(/[۰-۹]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))
    .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
    .replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `98${digits.slice(1)}`;
  else if (digits.startsWith('9') && digits.length === 10) digits = `98${digits}`;
  return digits;
};

export default function RemindersPanel({ businessName = 'تشریفات آژو', logoUrl = '/azho-logo.png' }) {
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMoreInvoices, setHasMoreInvoices] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [sharingInvoiceId, setSharingInvoiceId] = useState(null);
  const [preparedInvoiceImage, setPreparedInvoiceImage] = useState(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState(null);

  const fetchUpcomingCeremonies = useCallback(async (offset = 0, append = false) => {
    try {
      setLoading(true);
      setLoadError('');
      const { data, error } = await readTable('invoices', {
        orderBy: 'created_at',
        ascending: false,
        offset,
        limit: INVOICE_PAGE_SIZE,
      });

      if (error) throw error;
      const invoices = data || [];
      setUpcomingEvents((current) => append ? [...current, ...invoices] : invoices);
      setHasMoreInvoices(invoices.length === INVOICE_PAGE_SIZE);
    } catch (err) {
      setLoadError(`خطا در دریافت اطلاعات فاکتورها: ${err?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUpcomingCeremonies();
  }, [fetchUpcomingCeremonies]);

  useEffect(() => {
    const refreshWhenOnline = () => {
      if (navigator.onLine) fetchUpcomingCeremonies();
    };
    const refreshAfterSync = () => fetchUpcomingCeremonies();
    window.addEventListener('online', refreshWhenOnline);
    window.addEventListener('offline-data-updated', refreshAfterSync);
    return () => {
      window.removeEventListener('online', refreshWhenOnline);
      window.removeEventListener('offline-data-updated', refreshAfterSync);
    };
  }, [fetchUpcomingCeremonies]);

  const prepareInvoiceImage = async (invoice) => {
    setSharingInvoiceId(invoice.id);
    setShareStatus('');
    try {
      const image = await renderInvoiceImage(invoice, businessName, logoUrl);
      setPreparedInvoiceImage({ invoiceId: invoice.id, ...image });
      setShareStatus('تصویر آماده شد. حالا «بازکردن فهرست اشتراک» را بزنید تا برنامه‌های در دسترس دستگاه نمایش داده شوند.');
    } catch (error) {
      setShareStatus(`ساخت تصویر فاکتور ناموفق بود: ${error.message}`);
    } finally {
      setSharingInvoiceId(null);
    }
  };

  const openTelegramChatWithInvoice = (invoice) => {
    if (!preparedInvoiceImage || preparedInvoiceImage.invoiceId !== invoice.id) {
      setShareStatus('ابتدا تصویر همین فاکتور را بسازید.');
      return;
    }
    const phone = normalizeTelegramPhone(invoice.customer_phone || invoice.phone);
    if (!phone) {
      setShareStatus('شمارهٔ مشتری در فاکتور ثبت نشده است؛ برای بازکردن چت مستقیم، ابتدا شماره را در فاکتور ذخیره کنید.');
      return;
    }
    const draftText = `سلام ${invoice.customer_name || 'مشتری گرامی'} عزیز، تصویر فاکتور و یادآوری مراسم شما از طرف ${businessName} تقدیم می‌شود.`;
    const file = new File(
      [preparedInvoiceImage.blob],
      preparedInvoiceImage.fileName,
      { type: 'image/png' },
    );
    const shareData = {
      files: [file],
      title: `فاکتور ${invoice.customer_name || ''}`,
      text: draftText,
    };
    const supportsImageClipboard = Boolean(
      window.isSecureContext &&
      navigator.clipboard?.write &&
      typeof ClipboardItem !== 'undefined' &&
      (!ClipboardItem.supports || ClipboardItem.supports('image/png'))
    );

    if (!supportsImageClipboard) {
      if (navigator.share && navigator.canShare?.(shareData)) {
        navigator.share(shareData)
          .then(() => setShareStatus('فاکتور تصویری به فهرست اشتراک گوشی فرستاده شد؛ تلگرام را انتخاب کنید و در گفت‌وگو ارسال را بزنید.'))
          .catch((error) => {
            if (error.name === 'AbortError') setShareStatus('اشتراک‌گذاری لغو شد.');
            else setShareStatus(`گوشی نتوانست تصویر را کپی یا به اشتراک بگذارد: ${error.message}`);
          });
        return;
      }
      setShareStatus('این مرورگر کپی تصویر را پشتیبانی نمی‌کند. از دکمهٔ «بازکردن فهرست اشتراک» استفاده کنید تا تصویر به تلگرام فرستاده شود؛ اگر آن هم در دسترس نبود، مرورگر/سیستم‌عامل باید از اشتراک فایل پشتیبانی کند.');
      return;
    }

    let clipboardWrite;
    try {
      clipboardWrite = navigator.clipboard.write([
        new ClipboardItem({ 'image/png': preparedInvoiceImage.blob }),
      ]);
    } catch (error) {
      setShareStatus(`مرورگر اجازهٔ کپی تصویر را نداد: ${error.message}`);
      return;
    }

    const telegramWindow = window.open(
      `https://t.me/+${phone}?text=${encodeURIComponent(draftText)}`,
      '_blank',
    );
    if (telegramWindow) telegramWindow.opener = null;
    clipboardWrite.then(() => {
      setShareStatus(telegramWindow
        ? `چت شمارهٔ ${formatPersianDigits(invoice.customer_phone || invoice.phone)} باز شد و تصویر کپی شد؛ داخل تلگرام در کادر پیام Paste کنید و ارسال بزنید. هیچ فایلی ذخیره نشد. اگر چت باز نشد، تنظیم حریم خصوصی تلگرام اجازهٔ پیدا کردن شما با این شماره را نمی‌دهد.`
        : 'تصویر کپی شد اما مرورگر بازشدن تلگرام را مسدود کرد؛ تلگرام را دستی باز کنید و تصویر را Paste کنید. هیچ فایلی ذخیره نشد.');
    }).catch((error) => {
      setShareStatus(`چت تلگرام باز شد، اما مرورگر/گوشی کپی تصویر را رد کرد: ${error.message}. هیچ فایلی ذخیره نشده است؛ از «بازکردن فهرست اشتراک» برای فرستادن تصویر به تلگرام استفاده کنید.`);
    });
  };

  return (
    <div className="reminders-panel" style={{ padding: '20px', fontFamily: 'IRANSans, Tahoma, sans-serif', direction: 'rtl', background: '#f9fafb', borderRadius: '12px' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '8px', color: '#1f2937' }}>
        🔔 یادآوری‌ها و مراسم‌های پیش‌رو (پیگیری و تسویه)
      </h2>
      <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '0.85rem', lineHeight: 1.8 }}>
        جزئیات فاکتور، اقلام، تاریخ مراسم، مبلغ پرداختی و مانده بدهی را ببینید و متن کامل را برای مشتری بفرستید.
      </p>
      <button
        type="button"
        onClick={fetchUpcomingCeremonies}
        disabled={loading}
        className="refresh-button"
        style={{ marginBottom: '16px' }}
      >
        {loading ? 'در حال بارگذاری...' : '↻ تازه‌سازی فاکتورها'}
      </button>

      {shareStatus && (
        <div role="status" style={{ background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem', fontWeight: 'bold' }}>
          {shareStatus}
        </div>
      )}
      {loadError && (
        <div role="alert" style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>
          {loadError}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#6b7280' }}>در حال بارگذاری اطلاعات...</p>
      ) : upcomingEvents.length === 0 ? (
        <p style={{ color: '#6b7280' }}>هیچ فاکتوری ثبت نشده است.</p>
      ) : (
        <>
        <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '12px' }}>
          {formatPersianDigits(upcomingEvents.length)} فاکتور بارگذاری شده است.
        </p>
        <div className="reminders-mobile-list">
          {upcomingEvents.map((invoice) => {
            const summary = getInvoiceSummary(invoice);
            const isExpanded = expandedInvoiceId === invoice.id;
            const isPreparing = sharingInvoiceId === invoice.id;
            return (
              <article className="reminders-mobile-card" key={invoice.id}>
                <div className="reminders-mobile-card-heading">
                  <div>
                    <strong>{invoice.customer_name || 'نامشخص'}</strong>
                    <span>فاکتور #{String(invoice.invoice_number || invoice.invoiceNumber || invoice.id).toLocaleString('fa-IR')}</span>
                  </div>
                  <span className={`reminders-mobile-debt ${summary.remaining ? 'has-debt' : ''}`}>
                    {summary.remaining ? `بدهی: ${formatMoney(summary.remaining)}` : 'تسویه شده'}
                  </span>
                </div>
                <div className="reminders-mobile-meta">
                  <span><strong>تماس:</strong> {invoice.customer_phone || invoice.phone || 'ثبت نشده'}</span>
                  <span><strong>مراسم:</strong> {formatDate(invoice.ceremony_date)}</span>
                  <span><strong>مبلغ:</strong> {formatMoney(summary.total)}</span>
                  <span><strong>پرداختی:</strong> {formatMoney(summary.paid)}</span>
                </div>
                <div className="reminders-mobile-actions">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedInvoiceId(isExpanded ? null : invoice.id)}
                    className="reminders-mobile-button details"
                  >
                    {isExpanded ? 'بستن جزئیات' : 'نمایش جزئیات فاکتور'}
                  </button>
                  <button
                    type="button"
                    disabled={isPreparing}
                    onClick={() => prepareInvoiceImage(invoice)}
                    className="reminders-mobile-button prepare"
                  >
                    {isPreparing ? 'در حال ساخت تصویر...' : preparedInvoiceImage?.invoiceId === invoice.id ? 'بازسازی تصویر فاکتور' : '🖼️ ساخت تصویر فاکتور'}
                  </button>
                  {preparedInvoiceImage?.invoiceId === invoice.id && (
                    <button
                      type="button"
                      onClick={() => openTelegramChatWithInvoice(invoice)}
                      className="reminders-mobile-button share"
                    >
                      ✈️ بازکردن چت تلگرام و کپی تصویر
                    </button>
                  )}
                </div>
                {isExpanded && (
                  <div className="reminders-mobile-details">
                    <div className="reminders-mobile-meta">
                      <span><strong>تاریخ ثبت:</strong> {formatDate(invoice.order_date || invoice.created_at)}</span>
                      {(invoice.customer_address || invoice.address) && <span><strong>نشانی:</strong> {invoice.customer_address || invoice.address}</span>}
                    </div>
                    {summary.items.length ? (
                      <div className="reminders-mobile-items">
                        {summary.items.map((item, index) => (
                          <div className="reminders-mobile-item" key={`${invoice.id}-mobile-${index}`}>
                            <strong>{(index + 1).toLocaleString('fa-IR')}. {item.title}</strong>
                            <span>{item.type} · تعداد: {item.quantity.toLocaleString('fa-IR')}</span>
                            <span>واحد: {formatMoney(item.unitPrice)} · جمع: {formatMoney(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="reminders-mobile-no-items">ریز اقلام فاکتور ثبت نشده است.</p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
        <div className="reminders-desktop-table" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '850px', borderCollapse: 'collapse', background: '#fff', borderRadius: '8px', overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: '#f3f4f6', color: '#374151', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '12px' }}>شماره فاکتور</th>
                <th style={{ padding: '12px' }}>نام مشتری و تماس</th>
                <th style={{ padding: '12px' }}>تاریخ ثبت</th>
                <th style={{ padding: '12px' }}>تاریخ مراسم</th>
                <th style={{ padding: '12px' }}>مبلغ کل</th>
                <th style={{ padding: '12px' }}>پرداخت‌شده</th>
                <th style={{ padding: '12px' }}>مانده بدهی</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>جزئیات و ارسال</th>
              </tr>
            </thead>
            <tbody>
              {upcomingEvents.map((invoice) => {
                const summary = getInvoiceSummary(invoice);
                const isExpanded = expandedInvoiceId === invoice.id;
                return (
                  <React.Fragment key={invoice.id}>
                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '12px', fontWeight: '700' }}>#{String(invoice.invoice_number || invoice.invoiceNumber || invoice.id).toLocaleString('fa-IR')}</td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: '600' }}>{invoice.customer_name || 'نامشخص'}</div>
                        <div dir="ltr" style={{ marginTop: '4px', color: '#64748b', textAlign: 'right' }}>{invoice.customer_phone || invoice.phone || 'شماره ثبت نشده'}</div>
                      </td>
                      <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>{formatDate(invoice.order_date || invoice.created_at)}</td>
                      <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>{formatDate(invoice.ceremony_date)}</td>
                      <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>{formatMoney(summary.total)}</td>
                      <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>{formatMoney(summary.paid)}</td>
                      <td style={{ padding: '12px', whiteSpace: 'nowrap', color: summary.remaining ? '#b91c1c' : '#15803d', fontWeight: '700' }}>{formatMoney(summary.remaining)}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={() => setExpandedInvoiceId(isExpanded ? null : invoice.id)}
                            style={{ background: '#e0f2fe', color: '#075985', border: '1px solid #bae6fd', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            {isExpanded ? 'بستن جزئیات' : 'نمایش فاکتور'}
                          </button>
                          <button
                            type="button"
                            disabled={sharingInvoiceId === invoice.id}
                            onClick={() => prepareInvoiceImage(invoice)}
                            style={{ background: '#0f766e', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: sharingInvoiceId === invoice.id ? 'wait' : 'pointer', fontWeight: 'bold', opacity: sharingInvoiceId === invoice.id ? 0.7 : 1 }}
                          >
                            {sharingInvoiceId === invoice.id ? 'در حال ساخت تصویر...' : preparedInvoiceImage?.invoiceId === invoice.id ? 'بازسازی تصویر فاکتور' : '🖼️ ساخت تصویر فاکتور'}
                          </button>
                          {preparedInvoiceImage?.invoiceId === invoice.id && (
                            <>
                              <button
                                type="button"
                                onClick={() => openTelegramChatWithInvoice(invoice)}
                                style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                              >
                                ✈️ بازکردن چت تلگرام و کپی تصویر
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan="8" style={{ padding: '16px', borderBottom: '2px solid #cbd5e1', background: '#f8fafc' }}>
                          <div style={{ display: 'grid', gap: '12px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', color: '#475569', fontSize: '0.9rem' }}>
                              <span><strong>مشتری:</strong> {invoice.customer_name || 'ثبت نشده'}</span>
                              <span><strong>شماره تماس:</strong> {invoice.customer_phone || invoice.phone || 'ثبت نشده'}</span>
                              <span><strong>تاریخ ثبت فاکتور:</strong> {formatDate(invoice.order_date || invoice.created_at)}</span>
                              <span><strong>تاریخ مراسم:</strong> {formatDate(invoice.ceremony_date)}</span>
                              {(invoice.customer_address || invoice.address) && <span><strong>نشانی:</strong> {invoice.customer_address || invoice.address}</span>}
                            </div>
                            {summary.items.length ? (
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', minWidth: '650px', borderCollapse: 'collapse', background: '#fff' }}>
                                  <thead>
                                    <tr style={{ background: '#e2e8f0', color: '#334155', textAlign: 'right' }}>
                                      <th style={{ padding: '9px', border: '1px solid #cbd5e1' }}>ردیف</th>
                                      <th style={{ padding: '9px', border: '1px solid #cbd5e1' }}>شرح کالا / خدمت</th>
                                      <th style={{ padding: '9px', border: '1px solid #cbd5e1' }}>نوع</th>
                                      <th style={{ padding: '9px', border: '1px solid #cbd5e1' }}>تعداد</th>
                                      <th style={{ padding: '9px', border: '1px solid #cbd5e1' }}>قیمت واحد</th>
                                      <th style={{ padding: '9px', border: '1px solid #cbd5e1' }}>مبلغ</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {summary.items.map((item, index) => (
                                      <tr key={`${invoice.id}-${index}`}>
                                        <td style={{ padding: '9px', border: '1px solid #e2e8f0' }}>{(index + 1).toLocaleString('fa-IR')}</td>
                                        <td style={{ padding: '9px', border: '1px solid #e2e8f0' }}>{item.title}</td>
                                        <td style={{ padding: '9px', border: '1px solid #e2e8f0' }}>{item.type}</td>
                                        <td style={{ padding: '9px', border: '1px solid #e2e8f0' }}>{item.quantity.toLocaleString('fa-IR')}</td>
                                        <td style={{ padding: '9px', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{formatMoney(item.unitPrice)}</td>
                                        <td style={{ padding: '9px', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{formatMoney(item.amount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p style={{ margin: 0, color: '#92400e' }}>ریز اقلام برای این فاکتور ثبت نشده است؛ مبلغ‌های کل و تسویه بر اساس اطلاعات ثبت‌شدهٔ فاکتور هستند.</p>
                            )}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', padding: '12px', borderRadius: '8px', background: '#fff', color: '#334155' }}>
                              <span><strong>مبلغ کل:</strong> {formatMoney(summary.total)}</span>
                              <span><strong>پرداخت‌شده:</strong> {formatMoney(summary.paid)}</span>
                              <span style={{ color: summary.remaining ? '#b91c1c' : '#15803d' }}><strong>مانده بدهی:</strong> {formatMoney(summary.remaining)}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {hasMoreInvoices && (
          <button
            type="button"
            onClick={() => fetchUpcomingCeremonies(upcomingEvents.length, true)}
            disabled={loading}
            className="refresh-button"
            style={{ marginTop: '16px' }}
          >
            {loading ? 'در حال بارگذاری...' : 'نمایش فاکتورهای بیشتر'}
          </button>
        )}
        </>
      )}
      <p style={{ margin: '12px 0 0', color: '#64748b', fontSize: '0.8rem', lineHeight: 1.8 }}>
        پس از ساخت تصویر، «بازکردن چت تلگرام و کپی تصویر» را بزنید؛ چت شمارهٔ ثبت‌شده باز می‌شود و تصویر بدون دانلود کپی می‌شود. در تلگرام داخل کادر پیام Paste و ارسال کنید. بازشدن چت با شماره به تنظیمات حریم خصوصی تلگرام مشتری وابسته است.
      </p>
    </div>
  );
}
