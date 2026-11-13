import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { readTable, updateRows } from '../offlineSync';
import FormattedNumberInput from './FormattedNumberInput';
import { getInvoicePaymentStatus } from '../cashbookUtils';
import {
  calculateInvoiceItemsTotal,
  getInvoiceItems,
  getInvoiceItemDetails,
  summarizeCeremonyProfit,
  summarizeInvoiceRevenue,
} from '../financialReportUtils';
import { formatPersianDate } from '../dateUtils';
import { toGregorianISODate } from '../calendarDateUtils';
import { useToast } from './useToast';

const formatNumber = (value) => Number(value || 0).toLocaleString('fa-IR');
const formatEventDate = (value) => {
  const isoDate = toGregorianISODate(value);
  return isoDate ? formatPersianDate(isoDate) : 'ثبت نشده';
};
const toPersianDigits = (value) => String(value).replace(/[0-9٠-٩]/g, (digit) => {
  const asciiDigit = digit >= '٠' && digit <= '٩'
    ? String(digit.charCodeAt(0) - 1632)
    : digit;
  return String.fromCharCode(asciiDigit.charCodeAt(0) + 1728);
});

export default function FinancialReportPanel({ businessName = 'تشریفات آژو', logoUrl = '/azho-logo.png' }) {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState([]);
  const [events, setEvents] = useState([]);
  const [cashTransactions, setCashTransactions] = useState([]);
  const [invoiceExpenses, setInvoiceExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expenseLoadError, setExpenseLoadError] = useState('');
  const [profitabilityLoadError, setProfitabilityLoadError] = useState('');
  const [invoiceLinkError, setInvoiceLinkError] = useState('');
  const [savingInvoiceLinkId, setSavingInvoiceLinkId] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemType, setNewItemType] = useState('rent');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState('');

  const fetchFinancialData = useCallback(async () => {
    const [invoiceResult, expenseResult, eventResult, transactionResult] = await Promise.all([
      readTable('invoices', { orderBy: 'created_at', ascending: true }),
      readTable('invoice_expenses', { orderBy: 'expense_date', ascending: true }),
      readTable('events', { orderBy: 'event_date', ascending: true }),
      readTable('cash_transactions', { orderBy: 'transaction_date', ascending: true }),
    ]);

    if (invoiceResult.error) {
      setLoadError(`بارگذاری فاکتورهای مالی ناموفق بود: ${invoiceResult.error.message}`);
    } else {
      setInvoices(invoiceResult.data || []);
      setLoadError('');
    }
    if (expenseResult.error) {
      setExpenseLoadError(`بارگذاری هزینه‌های فاکتورها ناموفق بود: ${expenseResult.error.message}`);
    } else {
      setInvoiceExpenses(expenseResult.data || []);
      setExpenseLoadError('');
    }
    const reportErrors = [
      eventResult.error && `مراسم‌ها: ${eventResult.error.message}`,
      transactionResult.error && `گردش‌های مالی: ${transactionResult.error.message}`,
    ].filter(Boolean);
    setProfitabilityLoadError(reportErrors.join('؛ '));
    if (!eventResult.error) setEvents(eventResult.data || []);
    if (!transactionResult.error) setCashTransactions(transactionResult.data || []);
    setLoading(false);
  }, []);

  const handleInvoiceEventChange = async (invoice, eventId) => {
    setSavingInvoiceLinkId(invoice.id);
    setInvoiceLinkError('');
    const result = await updateRows('invoices', {
      event_id: eventId || null,
    }, [{ column: 'id', operator: 'eq', value: invoice.id }]);
    setSavingInvoiceLinkId(null);
    if (result.error) {
      setInvoiceLinkError(`اتصال فاکتور به مراسم ذخیره نشد: ${result.error.message}`);
      return;
    }
    setInvoices((current) => current.map((item) => (
      String(item.id) === String(invoice.id)
        ? { ...item, event_id: eventId || null }
        : item
    )));
    window.dispatchEvent(new Event('offline-data-updated'));
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void fetchFinancialData(); }, 0);
    window.addEventListener('offline-data-updated', fetchFinancialData);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener('offline-data-updated', fetchFinancialData);
    };
  }, [fetchFinancialData]);

  useEffect(() => {
    const handleAppEscape = (event) => {
      if (!selectedInvoice) return;
      event.preventDefault();
      setSelectedInvoice(null);
    };
    window.addEventListener('app-escape', handleAppEscape);
    return () => window.removeEventListener('app-escape', handleAppEscape);
  }, [selectedInvoice]);

  async function handleAddItem(e) {
    e.preventDefault();
    if (!newItemTitle.trim()) return;

    const currentItems = getInvoiceItems(selectedInvoice);
    const updatedItems = [
      ...currentItems,
      {
        title: newItemTitle.trim(),
        item_type: newItemType,
        qty: Number(newItemQty) || 1,
        unit_price: Number(newItemPrice) || 0
      }
    ];

    const saved = await saveInvoiceItems(updatedItems);
    if (saved) {
      setNewItemTitle('');
      setNewItemQty(1);
      setNewItemPrice('');
    }
  }

  async function handleDeleteItem(indexToRemove) {
    const currentItems = getInvoiceItems(selectedInvoice);
    const updatedItems = currentItems.filter((_, idx) => idx !== indexToRemove);
    await saveInvoiceItems(updatedItems);
  }

  async function saveInvoiceItems(updatedItems) {
    const newTotal = calculateInvoiceItemsTotal(updatedItems);
    const paidAmount = Number(selectedInvoice.paid_amount || 0);
    if (newTotal < paidAmount) {
      toast('error', 'مبلغ کل فاکتور نمی‌تواند از مبلغی که تاکنون دریافت شده کمتر باشد.');
      return false;
    }

    const { error } = await updateRows('invoices', {
      items_data: updatedItems,
      total_price: newTotal,
      payment_status: getInvoicePaymentStatus(paidAmount, newTotal),
    }, [{ column: 'id', operator: 'eq', value: selectedInvoice.id }]);

    if (error) {
      toast('error', `خطا در ذخیره‌سازی اقلام فاکتور: ${error.message}`);
      return false;
    }

    const updatedInvoiceObj = {
      ...selectedInvoice,
      items_data: updatedItems,
      total_price: newTotal,
      payment_status: getInvoicePaymentStatus(paidAmount, newTotal),
    };

    setSelectedInvoice(updatedInvoiceObj);
    setInvoices(invoices.map(inv => inv.id === selectedInvoice.id ? updatedInvoiceObj : inv));
    toast('success', 'اقلام فاکتور ذخیره شد.');
    return true;
  }

  function handlePrintInvoice() {
    if (!selectedInvoice) return;

    const items = getInvoiceItems(selectedInvoice);
    const invoiceNumber = selectedInvoice.invoiceNumber || '---';
    const customerName = selectedInvoice.customer_name || 'مشتری محترم';
    const customerPhone = toPersianDigits(selectedInvoice.customer_phone || selectedInvoice.phone || 'ثبت نشده');
    const ceremonyDate = selectedInvoice.ceremony_date ? formatEventDate(selectedInvoice.ceremony_date) : 'تعیین نشده';
    const registerDate = selectedInvoice.created_at ? new Date(selectedInvoice.created_at).toLocaleDateString('fa-IR') : '---';
    const totalAmount = formatNumber(selectedInvoice.total_price || selectedInvoice.total_amount);
    const safeBusinessName = String(businessName).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
    const safeLogoUrl = String(logoUrl).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));

    let itemsHtml = '';
    if (items.length === 0) {
      itemsHtml = `<tr><td colspan="6" style="text-align: center; padding: 15px; color: #64748b;">هیچ قلمی ثبت نشده است.</td></tr>`;
    } else {
      items.forEach((it, idx) => {
        const q = Number(it.qty || it.requestedQuantity || 1);
        const p = Number(it.unit_price || it.p1 || it.price || 0);
        const rowTotal = p * q;
        const typeStr = it.item_type === 'sale' ? 'فروشی' : 'اجاره‌ای';
        itemsHtml += `
          <tr>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${formatNumber(idx + 1)}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">${it.title || it.name || 'محصول'}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${typeStr}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${formatNumber(q)}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">${formatNumber(p)}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: bold; color: #0369a1;">${formatNumber(rowTotal)}</td>
          </tr>
        `;
      });
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast('warning', 'مرورگر شما جلوی باز شدن پنجره چاپ را گرفت. لطفاً اجازه Pop-up را بدهید.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>فاکتور رسمی ${safeBusinessName} - #${formatNumber(invoiceNumber)}</title>
        <style>
          @font-face { font-family: 'IRANSans'; src: url('https://cdn.fontcdn.ir/Font/Persian/IRANSans/IRANSans.woff2') format('woff2'); font-weight: 100 900; font-display: swap; }
          body { font-family: 'IRANSans', Tahoma, sans-serif; direction: rtl; padding: 20px; color: #1e293b; background: #fff; }
          .header { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px; }
          .company-logo { width: 72px; height: 94px; object-fit: contain; }
          .title { font-size: 20px; font-weight: bold; color: #0f172a; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; font-size: 13px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
          th { background: #e2e8f0; color: #334155; padding: 10px; border: 1px solid #cbd5e1; text-align: right; }
          td { padding: 8px; border: 1px solid #cbd5e1; }
          .total-box { display: flex; justify-content: space-between; align-items: center; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px 15px; border-radius: 6px; font-size: 15px; font-weight: bold; color: #166534; margin-bottom: 40px; }
          .signatures { display: flex; justify-content: space-between; margin-top: 50px; font-size: 13px; }
          .sig-box { text-align: center; width: 200px; border-top: 1px dashed #64748b; padding-top: 10px; }
          @media print {
            body { padding: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">صورتحساب رسمی خدمات ${safeBusinessName}</div>
            <div style="font-size: 12px; color: #0369a1; margin-top: 4px;">شماره فاکتور: #${formatNumber(invoiceNumber)}</div>
          </div>
          <img class="company-logo" src="${safeLogoUrl}" alt="لوگوی ${safeBusinessName}">
          <div style="text-align: left; font-size: 12px; color: #64748b;">تاریخ ثبت: ${registerDate}</div>
        </div>

        <div class="meta-grid">
          <div><strong>نام مشتری:</strong> ${customerName}</div>
          <div><strong>تاریخ مراسم:</strong> ${ceremonyDate}</div>
          <div><strong>شماره تماس:</strong> ${customerPhone}</div>
          <div><strong>وضعیت فاکتور:</strong> رسمی / تایید شده</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">ردیف</th>
              <th>شرح کالا یا خدمت</th>
              <th style="text-align: center;">نوع</th>
              <th style="text-align: center;">تعداد</th>
              <th style="text-align: left;">فی (تومان)</th>
              <th style="text-align: left;">مجموع (تومان)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="total-box">
          <span>مبلغ کل قابل پرداخت:</span>
          <span style="color: #15803d;">${totalAmount} تومان</span>
        </div>

        <div class="signatures">
          <div class="sig-box">امضا و مهر مدیر تشریفات</div>
          <div class="sig-box">امضا و تایید مشتری</div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  const revenueSummary = summarizeInvoiceRevenue(invoices);
  const totalRevenue = revenueSummary.totalRevenue;
  const totalSaleRevenue = revenueSummary.saleRevenue;
  const totalRentRevenue = revenueSummary.rentRevenue;
  const unclassifiedRevenue = revenueSummary.unclassifiedRevenue;
  const profitReport = summarizeCeremonyProfit(events, invoices, invoiceExpenses, cashTransactions);
  const profitTotals = profitReport.totals;

  const ceremonyStats = {};
  const productPerformance = {};

  invoices.forEach((inv, index) => {
    const invTotal = Number(inv.total_price || inv.total_amount || 0);
    const customerName = inv.customer_name || `مشتری #${formatNumber(index + 1)}`;
    if (!ceremonyStats[customerName]) {
      ceremonyStats[customerName] = { total: 0, count: 0 };
    }
    ceremonyStats[customerName].total += invTotal;
    ceremonyStats[customerName].count += 1;

    const items = getInvoiceItems(inv);
    if (Array.isArray(items) && items.length > 0) {
      items.forEach(item => {
        const { category, quantity: qty, total: itemTotal } = getInvoiceItemDetails(item);
        const itemName = String(item.title || item.name || 'محصول ناشناخته').trim();

        if (!productPerformance[itemName]) {
          productPerformance[itemName] = { rentalCount: 0, saleCount: 0, rentalRevenue: 0, saleRevenue: 0 };
        }
        if (category === 'sale') {
          productPerformance[itemName].saleCount += qty;
          productPerformance[itemName].saleRevenue += itemTotal;
        } else if (category === 'rent') {
          productPerformance[itemName].rentalCount += qty;
          productPerformance[itemName].rentalRevenue += itemTotal;
        }
      });
    }
  });

  const topCeremonies = Object.entries(ceremonyStats)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const topProducts = Object.entries(productPerformance)
    .map(([name, data]) => ({ 
      name, 
      ...data, 
      totalRevenue: data.rentalRevenue + data.saleRevenue,
      totalCount: data.rentalCount + data.saleCount 
    }))
    .sort((a, b) => {
      if (b.totalCount !== a.totalCount) {
        return b.totalCount - a.totalCount;
      }
      return b.totalRevenue - a.totalRevenue;
    })
    .slice(0, 5);

  return (
    <div className="financial-report-panel" style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', fontFamily: '"IRANSans", Tahoma, sans-serif', direction: 'rtl' }}>
      <h3 style={{ margin: '0 0 15px 0', color: '#1e293b', fontSize: '16px' }}>گزارش مالی و تحلیل پیشرفته تشریفات</h3>
      {loadError && <p role="alert" style={{ color: '#b91c1c' }}>{loadError}</p>}

      <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '15px', borderRadius: '8px', marginBottom: '25px' }}>
        <h4 style={{ margin: '0 0 12px 0', color: '#0f172a', fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
          📊 تحلیل هوشمند و عملکرد مراسم‌ها و محصولات
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#0369a1', marginBottom: '8px' }}>🏆 بالاترین مبلغ فاکتور به تفکیک مشتری</div>
            {topCeremonies.length === 0 ? (
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>داده‌ای ثبت نشده است.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {topCeremonies.map((cer, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderBottom: '1px dashed #f1f5f9', paddingBottom: '4px' }}>
                    <span style={{ color: '#334155', fontWeight: 'bold' }}>{formatNumber(idx + 1)}. {cer.name}</span>
                    <span style={{ color: '#059669', fontWeight: 'bold' }}>{formatNumber(cer.total)} تومان</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#7c3aed', marginBottom: '8px' }}>📦 مقایسه اجاره و فروش محصولات</div>
            {topProducts.length === 0 ? (
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>محصولی در فاکتورها ثبت نشده است.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {topProducts.map((prod, idx) => (
                  <div key={idx} style={{ fontSize: '11px', borderBottom: '1px dashed #f1f5f9', paddingBottom: '6px' }}>
                    <div style={{ fontWeight: 'bold', color: '#1e293b', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{formatNumber(idx + 1)}. {prod.name} (مجموع: {formatNumber(prod.totalCount)} بار)</span>
                      <span style={{ color: '#0284c7' }}>{formatNumber(prod.totalRevenue)} ت</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '10px', marginTop: '3px', background: '#f8fafc', padding: '4px 6px', borderRadius: '4px' }}>
                      <span>تعداد اجاره: <strong style={{ color: '#2563eb' }}>{formatNumber(prod.rentalCount)} بار</strong></span>
                      <span>تعداد فروش: <strong style={{ color: '#16a34a' }}>{formatNumber(prod.saleCount)} بار</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '25px' }}>
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '15px', borderRadius: '6px' }}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>مجموع کل درآمد فاکتورهای رسمی</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0369a1' }}>{formatNumber(totalRevenue)} تومان</div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '15px', borderRadius: '6px' }}>
          <div style={{ fontSize: '12px', color: '#166534', marginBottom: '8px' }}>درآمد اقلام اجاره‌ای</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#15803d' }}>{formatNumber(totalRentRevenue)} تومان</div>
        </div>

        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '15px', borderRadius: '6px' }}>
          <div style={{ fontSize: '12px', color: '#1e40af', marginBottom: '8px' }}>درآمد اقلام فروشی</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1d4ed8' }}>{formatNumber(totalSaleRevenue)} تومان</div>
        </div>

        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '15px', borderRadius: '6px' }}>
          <div style={{ fontSize: '12px', color: '#991b1b', marginBottom: '8px' }}>درآمد بدون دسته‌بندی</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc2626' }}>{formatNumber(unclassifiedRevenue)} تومان</div>
        </div>
      </div>
      <p style={{ margin: '-12px 0 20px', color: '#64748b', fontSize: '11px' }}>
        این ارقام درآمد فاکتور هستند، نه سود خالص؛ هزینه‌های جاری، بهای تمام‌شدهٔ اجاره و مبالغ وصول‌شده در این جمع کسر یا محاسبه نشده‌اند.
      </p>

      <section aria-labelledby="ceremony-profit-title" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '15px', borderRadius: '8px', marginBottom: '25px' }}>
        <h4 id="ceremony-profit-title" style={{ margin: '0 0 8px', color: '#0f172a', fontSize: '14px' }}>
          سود و زیان هر مراسم
        </h4>
        <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '11px' }}>
          درآمد فاکتور بر مبنای مبلغ کل فاکتور است، نه مبلغ وصول‌شده؛ درآمدهای متفرقهٔ ثبت‌شده، هزینه‌های فاکتور، هزینه‌های صندوق/بانک و بهای تمام‌شدهٔ اقلام فروشی هم محاسبه می‌شوند. انتقال بین حساب‌ها درآمد یا هزینه نیست و هزینهٔ پرداخت‌شدهٔ فاکتور دوباره‌شماری نمی‌شود.
        </p>
        {expenseLoadError && <p role="alert" style={{ color: '#b91c1c' }}>{expenseLoadError}</p>}
        {profitabilityLoadError && <p role="alert" style={{ color: '#b91c1c' }}>بارگذاری اطلاعات سود و زیان ناموفق بود: {profitabilityLoadError}</p>}
        {invoiceLinkError && <p role="alert" style={{ color: '#b91c1c' }}>{invoiceLinkError}</p>}
        {!expenseLoadError && !profitabilityLoadError && !loading && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', fontSize: '12px' }}>
              <span style={{ background: '#eff6ff', padding: '7px 10px', borderRadius: '6px' }}>کل درآمد: <strong>{formatNumber(profitTotals.revenue)} تومان</strong></span>
              <span style={{ background: '#fff7ed', padding: '7px 10px', borderRadius: '6px' }}>کل هزینه: <strong>{formatNumber(profitTotals.expenses)} تومان</strong></span>
              <span style={{ background: profitTotals.profit >= 0 ? '#f0fdf4' : '#fef2f2', padding: '7px 10px', borderRadius: '6px' }}>
                سود/زیان کل: <strong>{formatNumber(profitTotals.profit)} تومان</strong>
              </span>
            </div>
            {(profitReport.unassigned.revenue > 0 || profitReport.unassigned.expenses > 0) && (
              <p style={{ margin: '0 0 12px', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '9px', borderRadius: '6px', fontSize: '11px' }}>
                موارد بدون اتصال به مراسم — درآمد: {formatNumber(profitReport.unassigned.revenue)} تومان، هزینه: {formatNumber(profitReport.unassigned.expenses)} تومان؛ این مبالغ در سود کل حساب شده‌اند. از جدول فاکتورها و دفتر صندوق/بانک، موارد مربوط را به مراسم وصل کنید.
              </p>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', background: '#fff' }}>
                <thead>
                  <tr style={{ background: '#e2e8f0' }}>
                    <th style={{ padding: '8px' }}>تاریخ مراسم</th>
                    <th style={{ padding: '8px' }}>مراسم / مشتری</th>
                    <th style={{ padding: '8px' }}>تعداد فاکتور</th>
                    <th style={{ padding: '8px' }}>درآمد</th>
                    <th style={{ padding: '8px' }}>هزینه‌های ثبت‌شده</th>
                    <th style={{ padding: '8px' }}>بهای کالای فروشی</th>
                    <th style={{ padding: '8px' }}>کل هزینه</th>
                    <th style={{ padding: '8px' }}>سود/زیان</th>
                  </tr>
                </thead>
                <tbody>
                  {profitReport.rows.length ? profitReport.rows.map((row) => (
                    <tr key={row.eventId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px' }}>
                        {formatEventDate(row.eventDate)}
                      </td>
                      <td style={{ padding: '8px' }}>{row.eventName}{row.eventType ? ` · ${row.eventType}` : ''}</td>
                      <td style={{ padding: '8px' }}>{formatNumber(row.invoiceCount)}</td>
                      <td style={{ padding: '8px' }}>{formatNumber(row.revenue)}</td>
                      <td style={{ padding: '8px' }}>{formatNumber(row.invoiceExpenses + row.otherExpenses)}</td>
                      <td style={{ padding: '8px' }}>{formatNumber(row.goodsCost)}</td>
                      <td style={{ padding: '8px' }}>{formatNumber(row.totalExpenses)}</td>
                      <td style={{ padding: '8px', fontWeight: 'bold', color: row.profit >= 0 ? '#15803d' : '#b91c1c' }}>
                        {formatNumber(row.profit)}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="8" style={{ padding: '14px', textAlign: 'center', color: '#64748b' }}>هنوز درآمد یا هزینه‌ای به مراسم‌ها وصل نشده است.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>💡 لیست فاکتورهای صادر شده:</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '10px' }}>شماره فاکتور</th>
              <th style={{ padding: '10px' }}>نام مشتری</th>
              <th style={{ padding: '10px' }}>تاریخ ثبت رسمی</th>
              <th style={{ padding: '10px' }}>مبلغ کل (تومان)</th>
              <th style={{ padding: '10px' }}>اتصال به مراسم</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>در حال بارگذاری اطلاعات...</td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>هیچ فاکتور رسمی تاکنون صادر نشده است.</td>
              </tr>
            ) : (
              invoices.map((inv, idx) => {
                const invoiceNumber = inv.invoice_number || inv.id;
                return (
                  <tr 
                    key={inv.id || idx} 
                    style={{ borderBottom: '1px solid #f1f5f9', background: selectedInvoice?.id === inv.id ? '#e0f2fe' : 'transparent' }}
                  >
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#334155' }}>#{formatNumber(invoiceNumber)}</td>
                    <td style={{ padding: '10px' }}>
                      <span 
                        onClick={() => setSelectedInvoice({ ...inv, invoiceNumber })}
                        style={{ fontWeight: 'bold', color: '#0284c7', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {inv.customer_name || 'مشتری آزاد'}
                      </span>
                    </td>
                    <td style={{ padding: '10px' }}>{new Date(inv.created_at).toLocaleDateString('fa-IR')}</td>
                    <td style={{ padding: '10px', color: '#0369a1', fontWeight: 'bold' }}>{formatNumber(inv.total_price || inv.total_amount)}</td>
                    <td style={{ padding: '10px' }}>
                      <select
                        aria-label={`اتصال فاکتور ${formatNumber(invoiceNumber)} به مراسم`}
                        value={inv.event_id || ''}
                        disabled={String(savingInvoiceLinkId) === String(inv.id)}
                        onChange={(event) => { void handleInvoiceEventChange(inv, event.target.value); }}
                      >
                        <option value="">بدون اتصال به مراسم</option>
                        {events.map((event) => (
                          <option key={event.id} value={event.id}>
                            {event.customer_name || event.event_type || 'مراسم بدون نام'}
                            {event.event_date ? ` · ${formatEventDate(event.event_date)}` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <button 
                        onClick={() => setSelectedInvoice({ ...inv, invoiceNumber })}
                        style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        مشاهده و مدیریت فاکتور
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedInvoice && createPortal(
        <div className="financial-report-invoice-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedInvoice(null);
        }}>
          <div className="financial-report-invoice-modal" role="dialog" aria-modal="true" aria-labelledby="financial-report-invoice-title" dir="rtl">
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '12px', marginBottom: '15px' }}>
              <div>
                <h2 id="financial-report-invoice-title" style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>جزئیات فاکتور رسمی مراسم و تشریفات</h2>
                <div style={{ fontSize: '12px', color: '#0369a1', fontWeight: 'bold', marginTop: '4px' }}>شماره فاکتور: #{formatNumber(selectedInvoice.invoiceNumber)}</div>
              </div>
              <button 
                onClick={() => setSelectedInvoice(null)}
                style={{ background: '#ef4444', color: '#fff', border: 'none', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '6px', fontSize: '12px', marginBottom: '15px' }}>
              <div><strong>نام مشتری:</strong> {selectedInvoice.customer_name || 'ثبت نشده'}</div>
              <div><strong>تاریخ ثبت فاکتور:</strong> {new Date(selectedInvoice.created_at).toLocaleDateString('fa-IR')}</div>
              <div><strong>شماره تماس:</strong> {toPersianDigits(selectedInvoice.customer_phone || selectedInvoice.phone || 'ثبت نشده')}</div>
              <div><strong>تاریخ مراسم:</strong> {selectedInvoice.ceremony_date ? formatEventDate(selectedInvoice.ceremony_date) : 'تعیین نشده'}</div>
            </div>

            <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#334155' }}>اقلام و خدمات فاکتور:</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', marginBottom: '15px' }}>
              <thead>
                <tr style={{ background: '#e2e8f0', color: '#334155' }}>
                  <th style={{ padding: '8px' }}>ردیف</th>
                  <th style={{ padding: '8px' }}>نام کالا / خدمت</th>
                  <th style={{ padding: '8px' }}>نوع</th>
                  <th style={{ padding: '8px' }}>تعداد</th>
                  <th style={{ padding: '8px' }}>فی (تومان)</th>
                  <th style={{ padding: '8px' }}>مجموع (تومان)</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {(!selectedInvoice.items_data && !selectedInvoice.items_json && !selectedInvoice.items) || 
                 (Array.isArray(selectedInvoice.items_data || selectedInvoice.items_json || selectedInvoice.items) && 
                  (selectedInvoice.items_data || selectedInvoice.items_json || selectedInvoice.items).length === 0) ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '15px', color: '#64748b' }}>هیچ قلمی ثبت نشده است.</td>
                  </tr>
                ) : (
                  (selectedInvoice.items_data || selectedInvoice.items_json || selectedInvoice.items).map((it, i) => {
                    const q = Number(it.qty || it.requestedQuantity || 1);
                    const p = Number(it.unit_price || it.p1 || it.price || 0);
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px' }}>{formatNumber(i + 1)}</td>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{it.title || it.name || 'محصول'}</td>
                        <td style={{ padding: '8px' }}>{it.item_type === 'sale' ? 'فروشی' : 'اجاره‌ای'}</td>
                        <td style={{ padding: '8px' }}>{formatNumber(q)}</td>
                        <td style={{ padding: '8px' }}>{formatNumber(p)}</td>
                        <td style={{ padding: '8px', color: '#0369a1', fontWeight: 'bold' }}>{formatNumber(p * q)}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <button 
                            onClick={() => handleDeleteItem(i)}
                            style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '3px 8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}
                          >
                            حذف
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            <form onSubmit={handleAddItem} style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '12px', borderRadius: '6px', marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>➕ افزودن قلم یا کالا به این فاکتور:</div>
              <div className="accounting-form-grid invoice-item-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                <div className="accounting-field">
                <label htmlFor="invoice-item-title">عنوان کالا یا خدمت</label>
                <input 
                  id="invoice-item-title"
                  type="text" 
                  placeholder="عنوان کالا یا خدمت" 
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11px' }}
                  required
                />
                </div>
                <div className="accounting-field">
                <label htmlFor="invoice-item-type">نوع کالا</label>
                <select 
                  id="invoice-item-type"
                  value={newItemType}
                  onChange={(e) => setNewItemType(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11px', background: '#fff' }}
                >
                  <option value="rent">اجاره‌ای</option>
                  <option value="sale">فروشی</option>
                </select>
                </div>
                <div className="accounting-field">
                <label htmlFor="invoice-item-quantity">تعداد</label>
                <FormattedNumberInput
                  id="invoice-item-quantity"
                  allowDecimal={false}
                  placeholder="تعداد"
                  value={newItemQty}
                  onValueChange={setNewItemQty}
                  style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11px', background: '#fff' }}
                />
                </div>
                <div className="accounting-field">
                <label htmlFor="invoice-item-price">قیمت واحد (تومان)</label>
                <FormattedNumberInput
                  id="invoice-item-price"
                  placeholder="مبلغ"
                  value={newItemPrice}
                  onValueChange={setNewItemPrice}
                  emptyWhenZero
                  style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11px', background: '#fff' }}
                />
                </div>
                <button 
                  type="submit"
                  style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '7px 12px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  افزودن
                </button>
              </div>
            </form>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderTop: '1px solid #e2e8f0', paddingTop: '15px', marginTop: '15px' }}>
              <button 
                onClick={handlePrintInvoice}
                style={{ background: '#0ea5e9', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                چاپ فاکتور
              </button>
              <button 
                onClick={() => setSelectedInvoice(null)}
                style={{ background: '#64748b', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
              >
                بستن پنجره
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}