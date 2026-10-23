import React, { useState, useEffect } from 'react';
import { deleteRows, readTable, updateRows } from '../offlineSync';
import { formatDisplay, formatPersianDigits } from '../styles';
import FormattedNumberInput from './FormattedNumberInput';
import { updateOfficialInvoice } from '../quotationInvoice';
import { getInvoicePaymentStatus } from '../cashbookUtils';

// مقادیر مجاز وضعیت پرداخت
const PAYMENT_STATUSES = [
  { value: 'unpaid', label: 'تسویه نشده', color: '#dc2626', bg: '#fee2e2' },
  { value: 'deposit_paid', label: 'بیعانه پرداخت شده', color: '#a16207', bg: '#fef9c3' },
  { value: 'paid', label: 'تسویه شده', color: '#16a34a', bg: '#dcfce7' }
];

const getStatusMeta = (status) =>
  PAYMENT_STATUSES.find(s => s.value === status) || PAYMENT_STATUSES[0];

export default function OfficialInvoicesPanel({ businessName = 'تشریفات آژو', logoUrl = '/azho-logo.png' }) {
  const [invoices, setInvoices] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAction, setBulkAction] = useState('');
  const [detailsInvoice, setDetailsInvoice] = useState(null);

  // حالت ویرایش فاکتور
  const [editingId, setEditingId] = useState(null);
  const [orderDate, setOrderDate] = useState('');
  const [ceremonyDate, setCeremonyDate] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerListOpen, setIsCustomerListOpen] = useState(false);
  const [customerLoadError, setCustomerLoadError] = useState('');
  const [editableItems, setEditableItems] = useState([]);
  const [paidAmount, setPaidAmount] = useState('');

  // حالت نمایش چک‌لیست برای هر فاکتور
  const [checklistOpenId, setChecklistOpenId] = useState(null);
  const [newChecklistTask, setNewChecklistTask] = useState('');

  // پاپ‌آپ‌های عملیات فاکتور
  const [printInvoice, setPrintInvoice] = useState(null);
  const [whatsAppInvoice, setWhatsAppInvoice] = useState(null);
  const [whatsAppPhone, setWhatsAppPhone] = useState('');

  useEffect(() => {
    fetchOfficialInvoices();
    const fetchCustomers = async () => {
      const { data, error } = await readTable('customers', { columns: 'id, "Full name", phone, address' });
      if (error) {
        setCustomerLoadError(`بارگذاری فهرست مشتریان ناموفق بود: ${error.message}`);
        return;
      }
      setCustomers(data || []);
      setCustomerLoadError('');
    };
    fetchCustomers();
    const refreshData = () => {
      fetchOfficialInvoices();
      fetchCustomers();
    };
    window.addEventListener('offline-data-updated', refreshData);
    return () => window.removeEventListener('offline-data-updated', refreshData);
  }, []);

  useEffect(() => {
    const handleAppEscape = () => {
      if (isCustomerListOpen) {
        setIsCustomerListOpen(false);
        return;
      }
      if (editingId !== null) {
        handleCancelEdit();
        return;
      }
      if (checklistOpenId !== null) {
        setChecklistOpenId(null);
        return;
      }
      if (printInvoice) {
        setPrintInvoice(null);
        return;
      }
      if (whatsAppInvoice) {
        setWhatsAppInvoice(null);
        return;
      }
      if (detailsInvoice) setDetailsInvoice(null);
    };
    window.addEventListener('app-escape', handleAppEscape);
    return () => window.removeEventListener('app-escape', handleAppEscape);
  }, [checklistOpenId, detailsInvoice, editingId, isCustomerListOpen, printInvoice, whatsAppInvoice]);

  const filteredCustomers = customers.filter((customer) => {
    const query = customerSearch.trim().toLocaleLowerCase('fa-IR');
    return query && [customer['Full name'], customer.phone].some((value) =>
      String(value || '').toLocaleLowerCase('fa-IR').includes(query)
    );
  }).slice(0, 8);

  // محاسبه مانده بدهی
  const calcRemaining = (total, paid) => Math.max(0, Number(total || 0) - Number(paid || 0));

  async function fetchOfficialInvoices() {
    const { data, error } = await readTable('invoices', { orderBy: 'created_at', ascending: false });
    if (data) setInvoices(data);
    if (error) console.error("Error fetching invoices:", error.message);
    setSelectedIds([]);
  }

  const handleToggleSelect = (id) => {
    const nextIds = selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
    setSelectedIds(nextIds);
    if (nextIds.length > 1 && bulkAction !== 'delete') setBulkAction('');
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(invoices.map(inv => inv.id));
      if (invoices.length > 1 && bulkAction !== 'delete') setBulkAction('');
    } else {
      setSelectedIds([]);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`آیا از حذف ${formatDisplay(selectedIds.length)} فاکتور انتخاب‌شده مطمئن هستید؟`)) return;

    const { error } = await deleteRows('invoices', [{ column: 'id', operator: 'in', value: selectedIds }]);
    if (error) {
      alert("خطا در حذف گروهی فاکتورها: " + error.message);
    } else {
      fetchOfficialInvoices();
    }
  };

  // انجام عملیات انتخاب‌شده روی یک فاکتور مشخص (دابل‌کلیک روی ردیف یا دکمهٔ «انجام»)
  const runInvoiceAction = async (action, invoice) => {
    if (!action) {
      alert('ابتدا از فهرست «عملیات» یک مورد را انتخاب کنید، سپس روی ردیف فاکتور دابل‌کلیک کنید.');
      return;
    }

    if (action === 'delete') {
      if (!window.confirm(`آیا از حذف فاکتور #${formatPersianDigits(invoice.id)} اطمینان دارید؟`)) return;
      const { error } = await deleteRows('invoices', [{ column: 'id', operator: 'eq', value: invoice.id }]);
      if (error) alert('خطا در حذف فاکتور: ' + error.message);
      else fetchOfficialInvoices();
      return;
    }

    if (action === 'edit') handleStartEdit(invoice);
    if (action === 'print') setPrintInvoice(invoice);
    if (action === 'whatsapp') {
      setWhatsAppPhone(invoice.customer_phone || invoice.phone || '');
      setWhatsAppInvoice(invoice);
    }
    if (action === 'checklist') setChecklistOpenId(invoice.id);
  };

  const handleApplyBulkAction = async () => {
    if (!bulkAction) {
      alert('ابتدا یک عملیات را انتخاب کنید.');
      return;
    }
    if (!selectedIds.length) {
      alert('ابتدا حداقل یک فاکتور را انتخاب کنید.');
      return;
    }
    if (bulkAction === 'delete') {
      await handleDeleteSelected();
      return;
    }
    if (selectedIds.length !== 1) {
      alert('این عملیات فقط برای یک فاکتور قابل انجام است؛ فقط یک مورد را انتخاب کنید.');
      return;
    }

    const invoice = invoices.find((item) => item.id === selectedIds[0]);
    if (!invoice) {
      alert('فاکتور انتخاب‌شده پیدا نشد. فهرست را تازه‌سازی کنید.');
      return;
    }
    await runInvoiceAction(bulkAction, invoice);
  };

  // ساخت متن پیام واتساپ برای پیش‌نمایش و ارسال
  const buildWhatsAppMessage = (inv) => {
    const paid = Number(inv.paid_amount || 0);
    const total = Number(inv.total_price || 0);
    const remaining = calcRemaining(total, paid);
    const statusMeta = getStatusMeta(inv.payment_status);

    return `سلام ${inv.customer_name || 'مشتری عزیز'} عزیز،\n` +
      `با تشکر از انتخاب ${businessName} 🕊️\n` +
      `جزئیات فاکتور شماره #${formatPersianDigits(inv.id)}:\n` +
      `📅 تاریخ مراسم: ${inv.ceremony_date || 'تعیین نشده'}\n` +
      `💰 مبلغ کل: ${formatDisplay(total)} تومان\n` +
      `✅ مبلغ پرداختی (بیعانه): ${formatDisplay(paid)} تومان\n` +
      `📌 مانده بدهی: ${formatDisplay(remaining)} تومان\n` +
      `🔖 وضعیت پرداخت: ${statusMeta.label}\n` +
      `در صورت داشتن هرگونه سوال در خدمت شما هستیم.`;
  };

  // ارسال پیام مستقیم به واتساپ مشتری از پاپ‌آپ
  const handleSendWhatsApp = () => {
    const digits = String(whatsAppPhone || '').replace(/\D/g, '');
    if (!digits) {
      alert('لطفا شماره موبایل مشتری را وارد کنید.');
      return;
    }

    const cleanPhone = digits.startsWith('0') ? `98${digits.slice(1)}` : digits;
    const text = encodeURIComponent(buildWhatsAppMessage(whatsAppInvoice));
    window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
    setWhatsAppInvoice(null);
  };

  // مدیریت چک‌لیست مراسم
  const getDefaultChecklist = () => [
    { id: 1, title: 'تماس یادآوری و هماهنگی اولیه با مشتری (۲ روز مانده)', done: false },
    { id: 2, title: 'بارگیری و آماده‌سازی اقلام در انبار (۱ روز مانده)', done: false },
    { id: 3, title: 'اجرای کامل مراسم در محل (روز مراسم)', done: false }
  ];

  const handleToggleChecklistItem = async (inv, itemIndex) => {
    let currentChecklist = inv.checklist;
    if (!currentChecklist || !Array.isArray(currentChecklist)) {
      currentChecklist = getDefaultChecklist();
    }

    const updatedChecklist = currentChecklist.map((item, idx) =>
      idx === itemIndex ? { ...item, done: !item.done } : item
    );

    const { error } = await updateRows('invoices', { checklist: updatedChecklist }, [{ column: 'id', operator: 'eq', value: inv.id }]);

    if (error) {
      alert("خطا در بروزرسانی چک‌لیست: " + error.message);
    } else {
      fetchOfficialInvoices();
    }
  };

  const handleAddChecklistItem = async (event, inv) => {
    event.preventDefault();
    const title = newChecklistTask.trim();
    if (!title) return;

    const currentChecklist = Array.isArray(inv.checklist)
      ? inv.checklist
      : getDefaultChecklist();
    const updatedChecklist = [...currentChecklist, { title, done: false }];
    const { error } = await updateRows('invoices', { checklist: updatedChecklist }, [{ column: 'id', operator: 'eq', value: inv.id }]);

    if (error) {
      alert("خطا در افزودن کار به چک‌لیست: " + error.message);
      return;
    }

    setNewChecklistTask('');
    fetchOfficialInvoices();
  };

  // کمکی برای گرفتن قیمت فعال بر اساس سطح انتخابی کالا
  const getActiveUnitPrice = (item) => {
    const lvl = String(item.price_level || '1');
    if (lvl === '2') return Number(item.p2 ?? 0);
    if (lvl === '3') return Number(item.p3 ?? 0);
    return Number(item.p1 ?? item.price ?? 0);
  };

  const calculateInvoiceProfit = (items) => {
    if (!items || !Array.isArray(items)) return 0;
    return items.reduce((sum, item) => {
      const qty = Number(item.qty || 1);
      const isRent = item.item_type === 'rent';
      const unitPrice = getActiveUnitPrice(item);

      if (isRent) {
        return sum + (unitPrice * qty);
      } else {
        const buyCost = Number(item.base_cost ?? item.cost ?? item.unit_cost ?? 0);
        const profitPerItem = Math.max(0, unitPrice - buyCost);
        return sum + (profitPerItem * qty);
      }
    }, 0);
  };

  const handleStartEdit = (inv) => {
    setEditingId(inv.id);
    setCustomerName(inv.customer_name || '');
    setCustomerSearch(inv.customer_name || '');
    setIsCustomerListOpen(false);
    setCustomerPhone(inv.customer_phone || inv.phone || '');
    setOrderDate(inv.order_date || '');
    setCeremonyDate(inv.ceremony_date || '');
    setCustomerAddress(inv.customer_address || '');
    setPaidAmount(inv.paid_amount || '');

    const normalizedItems = (inv.items_data || []).map(item => {
      const lvl = String(item.price_level || '1');
      return {
        ...item,
        item_type: item.item_type || 'sale',
        price_level: lvl,
        p1: Number(item.p1 || item.price || 0),
        p2: Number(item.p2 || 0),
        p3: Number(item.p3 || 0),
        base_cost: Number(item.base_cost ?? item.cost ?? item.unit_cost ?? 0),
        qty: Number(item.qty || 1)
      };
    });

    setEditableItems(normalizedItems);
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...editableItems];
    updated[index][field] = value;
    setEditableItems(updated);
  };

  const handlePriceLevelChange = (index, level) => {
    const updated = [...editableItems];
    updated[index].price_level = String(level);
    setEditableItems(updated);
  };

  const handleUnitPriceChange = (index, value) => {
    const updated = [...editableItems];
    const item = updated[index];
    const lvl = String(item.price_level || '1');

    if (lvl === '2') item.p2 = value;
    else if (lvl === '3') item.p3 = value;
    else item.p1 = value;

    setEditableItems(updated);
  };

  const handleAddEditableItem = () => {
    setEditableItems([
      ...editableItems,
      { title: '', item_type: 'sale', price_level: '1', qty: 1, p1: '', p2: '', p3: '', base_cost: '' }
    ]);
  };

  const handleRemoveEditableItem = (index) => {
    setEditableItems(editableItems.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async (id) => {
    const normalizedItems = editableItems.map((item) => ({
      ...item,
      p1: Number(item.p1) || 0,
      p2: Number(item.p2) || 0,
      p3: Number(item.p3) || 0,
      base_cost: Number(item.base_cost) || 0,
      qty: Number(item.qty) || 1,
    }));
    const newTotalPrice = normalizedItems.reduce((sum, item) => {
      const q = Number(item.qty || 1);
      const p = getActiveUnitPrice(item);
      return sum + (q * p);
    }, 0);
    if (newTotalPrice < Number(paidAmount || 0)) {
      alert('مبلغ کل فاکتور نمی‌تواند از مبلغی که تاکنون در صندوق یا بانک دریافت شده کمتر باشد.');
      return;
    }

    try {
      await updateOfficialInvoice(id, {
        customer_name: customerName,
        customer_phone: customerPhone,
        order_date: orderDate,
        ceremony_date: ceremonyDate,
        customer_address: customerAddress,
        items_data: normalizedItems,
        total_price: newTotalPrice,
        payment_status: getInvoicePaymentStatus(paidAmount, newTotalPrice),
      }, { updateRows });
      setEditingId(null);
      setIsCustomerListOpen(false);
      fetchOfficialInvoices();
    } catch (error) {
      alert("خطا در ذخیره اطلاعات: " + error.message);
    }
  };

  // ================= چاپ فاکتور رسمی A4 =================
  const buildInvoiceHtml = (inv, autoPrint = false) => {
    const items = inv.items_data || [];
    const paid = Number(inv.paid_amount || 0);
    const total = Number(inv.total_price || 0);
    const remaining = calcRemaining(total, paid);
    const statusMeta = getStatusMeta(inv.payment_status);
    const safeBusinessName = String(businessName).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
    const safeLogoUrl = String(logoUrl).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));

    return `
      <html dir="rtl">
        <head>
          <style>
            @page { size: A4; margin: 15mm; }
            body { font-family: Tahoma, sans-serif; padding: 30px; direction: rtl; }
            .header-container { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 2px solid #334155; padding-bottom: 10px; margin-bottom: 15px; }
            .company-logo { width: 72px; height: 94px; object-fit: contain; }
            h2 { margin: 0; font-size: 18px; color: #1e293b; }
            .invoice-number { font-size: 14px; font-weight: bold; color: #0369a1; background: #f0f9ff; padding: 5px 10px; border: 1px solid #bae6fd; border-radius: 4px; }
            .info-box { border: 1px solid #cbd5e1; background: #f8fafc; padding: 12px; margin-bottom: 20px; font-size: 13px; line-height: 1.8; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #000; padding: 8px; text-align: center; font-size: 12px; }
            th { background-color: #f2f2f2; }
            .badge-sale { background-color: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px; font-size: 10px; }
            .badge-rent { background-color: #fef9c3; color: #854d0e; padding: 2px 6px; border-radius: 4px; font-size: 10px; }
            .payment-box { margin-top: 20px; border: 1px solid #cbd5e1; background: #f8fafc; padding: 15px; border-radius: 6px; font-size: 13px; line-height: 2; }
            .payment-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
            .total { margin-top: 20px; font-weight: bold; font-size: 14px; text-align: left; line-height: 1.8; }
            .signature-section { margin-top: 60px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 13px; }
            .signature-box { text-align: center; width: 45%; border-top: 1px dashed #334155; padding-top: 10px; color: #334155; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header-container">
            <img class="company-logo" src="${safeLogoUrl}" alt="لوگوی ${safeBusinessName}">
            <h2>فاکتور رسمی فروش و اجاره ${safeBusinessName}</h2>
            <div class="invoice-number">شماره فاکتور: #${formatPersianDigits(inv.id)}</div>
          </div>
          <div class="info-box">
            <div class="info-row">
              <div><strong>نام مشتری:</strong> ${inv.customer_name}</div>
              <div><strong>تاریخ صدور سیستم:</strong> ${new Date(inv.created_at).toLocaleDateString('fa-IR')}</div>
            </div>
            <div class="info-row">
              <div><strong>تاریخ سفارش:</strong> ${inv.order_date ? formatPersianDigits(inv.order_date) : 'وارد نشده'}</div>
              <div><strong>تاریخ مراسم:</strong> ${inv.ceremony_date ? formatPersianDigits(inv.ceremony_date) : 'وارد نشده'}</div>
            </div>
            <div><strong>آدرس مشتری:</strong> ${inv.customer_address || 'وارد نشده'}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>ردیف</th>
                <th>نام کالا / خدمت</th>
                <th>نوع کالا</th>
                <th>سطح قیمت</th>
                <th>تعداد</th>
                <th>قیمت واحد (تومان)</th>
                <th>مجموع (تومان)</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item, idx) => {
                const isRent = item.item_type === 'rent';
                const qty = Number(item.qty || 1);
                const price = getActiveUnitPrice(item);
                const levelText = item.price_level === '2' ? 'درجه ۲' : item.price_level === '3' ? 'درجه ۳' : 'درجه ۱';
                return `
                  <tr>
                    <td>${formatDisplay(idx + 1)}</td>
                    <td>${item.title}</td>
                    <td><span class="${isRent ? 'badge-rent' : 'badge-sale'}">${isRent ? 'اجاره‌ای' : 'فروشی'}</span></td>
                    <td>${levelText}</td>
                    <td>${formatDisplay(qty)}</td>
                    <td>${formatDisplay(price)}</td>
                    <td>${formatDisplay(qty * price)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div class="payment-box">
            <div class="payment-row"><span><strong>مبلغ کل فاکتور:</strong></span><span>${formatDisplay(total)} تومان</span></div>
            <div class="payment-row"><span><strong>مبلغ پرداختی (بیعانه):</strong></span><span>${formatDisplay(paid)} تومان</span></div>
            <div class="payment-row"><span><strong>مانده بدهی:</strong></span><span style="color:${remaining > 0 ? '#dc2626' : '#16a34a'}; font-weight:bold;">${formatDisplay(remaining)} تومان</span></div>
            <div class="payment-row"><span><strong>وضعیت تسویه:</strong></span><span style="background:${statusMeta.bg}; color:${statusMeta.color}; padding: 2px 8px; border-radius: 4px; font-weight: bold;">${statusMeta.label}</span></div>
          </div>

          <div class="signature-section">
            <div class="signature-box">امضا و مهر فروشنده</div>
            <div class="signature-box">امضای مشتری</div>
          </div>

          ${autoPrint ? '<script>window.onload = function() { window.print(); window.close(); };</script>' : ''}
        </body>
      </html>
    `;
  };

  // باز کردن پنجرهٔ چاپ مرورگر با همان قالب پیش‌نمایش
  const handlePrint = (inv) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('مرورگر اجازهٔ باز کردن پنجرهٔ چاپ را نداد؛ لطفا اجازهٔ پاپ‌آپ را فعال کنید.');
      return;
    }
    printWindow.document.write(buildInvoiceHtml(inv, true));
    printWindow.document.close();
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setIsCustomerListOpen(false);
  };

  // داده‌های پاپ‌آپ‌ها
  const checklistInvoice = invoices.find((invoice) => invoice.id === checklistOpenId) || null;
  const checklistItems = Array.isArray(checklistInvoice?.checklist)
    ? checklistInvoice.checklist
    : getDefaultChecklist();
  const editableTotal = editableItems.reduce((sum, item) => sum + (Number(item.qty || 1) * getActiveUnitPrice(item)), 0);
  const whatsAppMessage = whatsAppInvoice ? buildWhatsAppMessage(whatsAppInvoice) : '';

  // ================= رابط کاربری =================
  return (
    <div style={{ background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
      <div className="official-invoices-toolbar">
        <h3 style={{ margin: 0, color: '#1e293b', fontSize: '15px' }}>لیست فاکتورهای رسمی</h3>
        <div className="official-invoices-bulk-actions">
          <label className="official-invoices-action-select-label" htmlFor="official-invoices-action">عملیات</label>
          <select
            id="official-invoices-action"
            value={bulkAction}
            onChange={(event) => setBulkAction(event.target.value)}
            aria-label="عملیات روی فاکتورهای انتخاب‌شده"
          >
            <option value="">انتخاب عملیات</option>
            <option value="print" disabled={selectedIds.length > 1}>چاپ فاکتور</option>
            <option value="whatsapp" disabled={selectedIds.length > 1}>ارسال در واتساپ</option>
            <option value="checklist" disabled={selectedIds.length > 1}>نمایش چک‌لیست</option>
            <option value="edit" disabled={selectedIds.length > 1}>ویرایش فاکتور</option>
            <option value="delete">حذف فاکتور</option>
          </select>
          <button type="button" className="official-invoices-apply-button" onClick={handleApplyBulkAction}>
            انجام
          </button>
          <span className="official-invoices-hint">💡 دابل‌کلیک روی ردیف = انجام همین عملیات</span>
          <span className="official-invoices-selected-count">
            {selectedIds.length > 1
              ? `${formatDisplay(selectedIds.length)} انتخاب‌شده؛ این عملیات فقط برای یک فاکتور است`
              : `${formatDisplay(selectedIds.length)} انتخاب‌شده`}
          </span>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="official-invoices-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '10px', width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  onChange={handleSelectAll}
                  checked={invoices.length > 0 && selectedIds.length === invoices.length}
                />
              </th>
              <th style={{ padding: '10px' }}>شماره</th>
              <th style={{ padding: '10px' }}>نام مشتری</th>
              <th style={{ padding: '10px' }}>تاریخ مراسم</th>
              <th style={{ padding: '10px' }}>مبلغ کل (تومان)</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>وضعیت پرداخت</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>جزئیات</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>هیچ فاکتور رسمی ثبت نشده است.</td>
              </tr>
            ) : (
              invoices.map((inv) => {
                const statusMeta = getStatusMeta(inv.payment_status || 'unpaid');

                return (
                  <tr
                    key={inv.id}
                    onDoubleClick={() => void runInvoiceAction(bulkAction, inv)}
                    title="دابل‌کلیک: انجام عملیات انتخاب‌شده در فهرست «عملیات»"
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: selectedIds.includes(inv.id) ? '#f8fafc' : 'transparent',
                      cursor: 'pointer',
                      touchAction: 'manipulation'
                    }}
                  >
                    <td style={{ padding: '10px', textAlign: 'center' }} onDoubleClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(inv.id)}
                        onChange={() => handleToggleSelect(inv.id)}
                      />
                    </td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#0284c7' }}>#{formatPersianDigits(inv.id)}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold' }}>
                      <div>
                        <div>{inv.customer_name}</div>
                        {inv.customer_phone && <div style={{ fontSize: '10px', color: '#64748b' }}>{formatPersianDigits(inv.customer_phone)}</div>}
                        {inv.quotation_id && (
                          <div style={{ fontSize: '10px', color: '#15803d' }}>
                            صادرشده از پیش‌فاکتور #{formatPersianDigits(inv.quotation_id)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      {inv.ceremony_date ? formatPersianDigits(inv.ceremony_date) : <span style={{ color: '#94a3b8' }}>ثبت نشده</span>}
                    </td>
                    <td style={{ padding: '10px', color: '#0369a1' }}>
                      {formatDisplay(inv.total_price || 0)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <span style={{
                        background: statusMeta.bg,
                        color: statusMeta.color,
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap'
                      }}>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="official-invoices-actions-cell" style={{ padding: '10px', textAlign: 'center' }} onDoubleClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="official-invoice-details-button"
                        aria-label={`نمایش جزئیات فاکتور ${formatPersianDigits(inv.id)}`}
                        title="نمایش همهٔ جزئیات فاکتور"
                        onClick={() => setDetailsInvoice(inv)}
                      >
                        ◉
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* پایین: پاپ‌آپ‌های عملیات فاکتور */}

      {/* پاپ‌آپ ویرایش فاکتور */}
      {editingId !== null && (
        <div
          className="invoice-details-backdrop official-invoice-backdrop"
          onMouseDown={(event) => { if (event.target === event.currentTarget) handleCancelEdit(); }}
        >
          <section className="invoice-details-modal official-invoice-modal official-invoice-modal-wide" role="dialog" aria-modal="true" aria-labelledby="official-invoice-edit-title" dir="rtl">
            <div className="invoice-details-heading">
              <div>
                <span className="page-eyebrow">ویرایش فاکتور</span>
                <h3 id="official-invoice-edit-title">فاکتور شماره #{formatPersianDigits(editingId)}</h3>
              </div>
              <button type="button" className="invoice-details-close" onClick={handleCancelEdit} aria-label="بستن ویرایش فاکتور">×</button>
            </div>

            <div className="official-invoice-edit-grid">
              <label className="official-invoice-edit-field">
                <span>نام مشتری</span>
                <input
                  type="text"
                  value={customerName}
                  onFocus={() => {
                    setCustomerSearch(customerName);
                    setIsCustomerListOpen(true);
                  }}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setCustomerSearch(e.target.value);
                    setIsCustomerListOpen(true);
                  }}
                  placeholder="جست‌وجوی مشتری"
                  autoComplete="off"
                />
                {isCustomerListOpen && (
                  <div className="official-invoice-customer-list">
                    {customerLoadError ? (
                      <div role="alert" className="official-invoice-customer-error">{customerLoadError}</div>
                    ) : filteredCustomers.length ? filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        className="official-invoice-customer-option"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          const name = customer['Full name'] || '';
                          setCustomerName(name);
                          setCustomerSearch(name);
                          setCustomerPhone(customer.phone || '');
                          setCustomerAddress(customer.address || '');
                          setIsCustomerListOpen(false);
                        }}
                      >
                        <span>{customer['Full name'] || 'بدون نام'}</span>
                        <small dir="ltr">{customer.phone ? formatPersianDigits(customer.phone) : 'بدون شماره'}</small>
                      </button>
                    )) : (
                      <div className="official-invoice-customer-hint">
                        {customerSearch.trim() ? 'مشتری پیدا نشد؛ نام را می‌توانید دستی وارد کنید.' : 'برای جست‌وجو نام یا شماره را بنویسید.'}
                      </div>
                    )}
                  </div>
                )}
              </label>
              <label className="official-invoice-edit-field">
                <span>موبایل</span>
                <input type="text" dir="ltr" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="09..." />
              </label>
              <label className="official-invoice-edit-field">
                <span>تاریخ سفارش</span>
                <input type="text" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} placeholder="1405/02/15" />
              </label>
              <label className="official-invoice-edit-field">
                <span>تاریخ مراسم</span>
                <input type="text" value={ceremonyDate} onChange={(e) => setCeremonyDate(e.target.value)} placeholder="1405/02/15" />
              </label>
              <label className="official-invoice-edit-field official-invoice-edit-field-wide">
                <span>نشانی مشتری</span>
                <input type="text" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="آدرس مشتری" />
              </label>
            </div>

            <div className="official-invoice-items-head">
              <h4 className="invoice-details-items-title">مدیریت اقلام فاکتور</h4>
              <button type="button" className="official-invoice-add-item" onClick={handleAddEditableItem}>
                + افزودن قلم جدید
              </button>
            </div>

            <div className="invoice-details-items-wrap">
              <table className="invoice-details-items official-invoice-edit-items">
                <thead>
                  <tr>
                    <th>نام کالا / خدمت</th>
                    <th>نوع کالا</th>
                    <th>سطح قیمت فعال</th>
                    <th>تعداد</th>
                    <th>قیمت واحد فعال (تومان)</th>
                    <th style={{ textAlign: 'center' }}>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {editableItems.map((item, itemIdx) => (
                    <tr key={itemIdx}>
                      <td>
                        <input
                          type="text"
                          value={item.title || ''}
                          onChange={(e) => handleItemChange(itemIdx, 'title', e.target.value)}
                          style={{ width: '100%', padding: '5px', fontSize: '12px' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <select
                          value={item.item_type || 'sale'}
                          onChange={(e) => handleItemChange(itemIdx, 'item_type', e.target.value)}
                          style={{ padding: '5px', fontSize: '12px' }}>
                          <option value="sale">فروشی</option>
                          <option value="rent">اجاره‌ای</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <select
                          value={item.price_level || '1'}
                          onChange={(e) => handlePriceLevelChange(itemIdx, e.target.value)}
                          style={{ padding: '5px', fontSize: '12px' }}>
                          <option value="1">درجه ۱ (پایه: {formatDisplay(item.p1 || 0)})</option>
                          <option value="2">درجه ۲ (پایه: {formatDisplay(item.p2 || 0)})</option>
                          <option value="3">درجه ۳ (پایه: {formatDisplay(item.p3 || 0)})</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <FormattedNumberInput
                          allowDecimal={false}
                          value={item.qty || 1}
                          onValueChange={(value) => handleItemChange(itemIdx, 'qty', Number(value))}
                          style={{ width: '60px', padding: '5px', fontSize: '12px', textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <FormattedNumberInput
                          value={getActiveUnitPrice(item)}
                          onValueChange={(value) => handleUnitPriceChange(itemIdx, value)}
                          emptyWhenZero
                          style={{ width: '110px', padding: '5px', fontSize: '12px', textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="official-invoice-remove-item"
                          onClick={() => handleRemoveEditableItem(itemIdx)}>
                          حذف قلم
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="official-invoice-payment-summary">
              <div>
                <strong style={{ color: '#0369a1' }}>مبلغ کل فاکتور:</strong>{' '}
                <span style={{ color: '#0369a1', fontWeight: 'bold' }}>{formatDisplay(editableTotal)} تومان</span>
              </div>
              <div>
                <strong style={{ color: '#0d9488' }}>مبلغ پرداختی (بیعانه):</strong>{' '}
                <span style={{ color: '#0d9488', fontWeight: 'bold' }}>{formatDisplay(paidAmount)} تومان</span>
                <small style={{ display: 'block', color: '#64748b', marginTop: 4 }}>برای ثبت دریافت و انتخاب حساب، از بخش «صندوق و بانک» استفاده کنید.</small>
              </div>
              <div>
                <strong style={{ color: '#dc2626' }}>مانده بدهی:</strong>{' '}
                <span style={{ color: '#dc2626', fontWeight: 'bold' }}>{formatDisplay(calcRemaining(editableTotal, paidAmount))} تومان</span>
              </div>
              <div>
                <strong style={{ color: '#334155' }}>وضعیت تسویه:</strong>{' '}
                <span style={{ color: getStatusMeta(getInvoicePaymentStatus(paidAmount, editableTotal)).color, fontWeight: 'bold' }}>
                  {getStatusMeta(getInvoicePaymentStatus(paidAmount, editableTotal)).label}
                </span>
              </div>
            </div>

            <div className="official-invoice-modal-actions">
              <button type="button" className="official-invoices-apply-button" onClick={() => handleSaveEdit(editingId)}>ذخیره تغییرات</button>
              <button type="button" className="official-invoices-cancel-button" onClick={handleCancelEdit}>انصراف</button>
            </div>
          </section>
        </div>
      )}

      {/* پاپ‌آپ چک‌لیست مراسم */}
      {checklistInvoice && (
        <div
          className="invoice-details-backdrop official-invoice-backdrop"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setChecklistOpenId(null); }}
        >
          <section className="invoice-details-modal official-invoice-modal official-invoice-modal-narrow" role="dialog" aria-modal="true" aria-labelledby="official-invoice-checklist-title" dir="rtl">
            <div className="invoice-details-heading">
              <div>
                <span className="page-eyebrow">چک‌لیست مراسم</span>
                <h3 id="official-invoice-checklist-title">{checklistInvoice.customer_name || 'مشتری بدون نام'}</h3>
                <div className="official-invoice-modal-subtitle">
                  فاکتور #{formatPersianDigits(checklistInvoice.id)} — تاریخ مراسم: {checklistInvoice.ceremony_date ? formatPersianDigits(checklistInvoice.ceremony_date) : 'تعیین نشده'}
                </div>
              </div>
              <button type="button" className="invoice-details-close" onClick={() => setChecklistOpenId(null)} aria-label="بستن چک‌لیست">×</button>
            </div>

            <div className="official-invoice-checklist">
              {checklistItems.map((item, itemIdx) => (
                <label key={itemIdx} className={`official-invoice-checklist-item${item.done ? ' is-done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => handleToggleChecklistItem(checklistInvoice, itemIdx)}
                  />
                  <span>{item.title || item.text}</span>
                </label>
              ))}
            </div>

            <form className="official-invoice-checklist-form" onSubmit={(event) => handleAddChecklistItem(event, checklistInvoice)}>
              <input
                type="text"
                value={newChecklistTask}
                onChange={(event) => setNewChecklistTask(event.target.value)}
                placeholder="افزودن کار جدید به چک‌لیست..."
                aria-label="عنوان کار جدید در چک‌لیست"
                required
              />
              <button type="submit" className="official-invoice-checklist-add">افزودن</button>
            </form>

            <div className="official-invoice-modal-actions">
              <button type="button" className="official-invoices-cancel-button" onClick={() => setChecklistOpenId(null)}>بستن</button>
            </div>
          </section>
        </div>
      )}

      {/* پاپ‌آپ پیش‌نمایش و چاپ فاکتور */}
      {printInvoice && (
        <div
          className="invoice-details-backdrop official-invoice-backdrop"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setPrintInvoice(null); }}
        >
          <section className="invoice-details-modal official-invoice-modal official-invoice-modal-wide" role="dialog" aria-modal="true" aria-labelledby="official-invoice-print-title" dir="rtl">
            <div className="invoice-details-heading">
              <div>
                <span className="page-eyebrow">پیش‌نمایش چاپ</span>
                <h3 id="official-invoice-print-title">فاکتور شماره #{formatPersianDigits(printInvoice.id)}</h3>
              </div>
              <button type="button" className="invoice-details-close" onClick={() => setPrintInvoice(null)} aria-label="بستن پیش‌نمایش چاپ">×</button>
            </div>
            <iframe
              className="official-invoice-print-frame"
              title={`پیش‌نمایش فاکتور ${formatPersianDigits(printInvoice.id)}`}
              srcDoc={buildInvoiceHtml(printInvoice)}
            />
            <div className="official-invoice-modal-actions">
              <button type="button" className="official-invoices-apply-button" onClick={() => handlePrint(printInvoice)}>چاپ فاکتور</button>
              <button type="button" className="official-invoices-cancel-button" onClick={() => setPrintInvoice(null)}>بستن</button>
            </div>
          </section>
        </div>
      )}

      {/* پاپ‌آپ ارسال در واتساپ */}
      {whatsAppInvoice && (
        <div
          className="invoice-details-backdrop official-invoice-backdrop"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setWhatsAppInvoice(null); }}
        >
          <section className="invoice-details-modal official-invoice-modal official-invoice-modal-narrow" role="dialog" aria-modal="true" aria-labelledby="official-invoice-whatsapp-title" dir="rtl">
            <div className="invoice-details-heading">
              <div>
                <span className="page-eyebrow">ارسال در واتساپ</span>
                <h3 id="official-invoice-whatsapp-title">{whatsAppInvoice.customer_name || 'مشتری بدون نام'}</h3>
                <div className="official-invoice-modal-subtitle">فاکتور #{formatPersianDigits(whatsAppInvoice.id)}</div>
              </div>
              <button type="button" className="invoice-details-close" onClick={() => setWhatsAppInvoice(null)} aria-label="بستن ارسال واتساپ">×</button>
            </div>

            <label className="official-invoice-edit-field">
              <span>شماره موبایل مشتری</span>
              <input
                type="tel"
                dir="ltr"
                value={whatsAppPhone}
                onChange={(event) => setWhatsAppPhone(event.target.value)}
                placeholder="09123456789"
              />
            </label>

            <h4 className="invoice-details-items-title">پیش‌نمایش پیام</h4>
            <pre className="official-invoice-message-preview">{whatsAppMessage}</pre>

            <div className="official-invoice-modal-actions">
              <button type="button" className="official-invoices-apply-button" onClick={handleSendWhatsApp}>ارسال در واتساپ</button>
              <button type="button" className="official-invoices-cancel-button" onClick={() => setWhatsAppInvoice(null)}>انصراف</button>
            </div>
          </section>
        </div>
      )}

      {detailsInvoice && (() => {
        const detailsItems = [
          detailsInvoice.items_data,
          detailsInvoice.items_json,
          detailsInvoice.items,
        ].find(Array.isArray) || [];
        const total = Number(detailsInvoice.total_price || detailsInvoice.total_amount || 0);
        const paid = Number(detailsInvoice.paid_amount || 0);
        const status = getStatusMeta(detailsInvoice.payment_status);

        return (
          <div className="invoice-details-backdrop official-invoice-backdrop" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailsInvoice(null);
          }}>
            <section className="invoice-details-modal official-invoice-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-details-title" dir="rtl">
              <div className="invoice-details-heading">
                <div>
                  <span className="page-eyebrow">جزئیات کامل فاکتور</span>
                  <h3 id="invoice-details-title">فاکتور شماره #{formatPersianDigits(detailsInvoice.id)}</h3>
                </div>
                <button type="button" className="invoice-details-close" onClick={() => setDetailsInvoice(null)} aria-label="بستن جزئیات">×</button>
              </div>
              <dl className="invoice-details-grid">
                <div><dt>نام مشتری</dt><dd>{detailsInvoice.customer_name || 'ثبت نشده'}</dd></div>
                <div><dt>شماره تماس</dt><dd>{detailsInvoice.customer_phone || detailsInvoice.phone || 'ثبت نشده'}</dd></div>
                <div><dt>تاریخ سفارش</dt><dd>{detailsInvoice.order_date ? formatPersianDigits(detailsInvoice.order_date) : 'ثبت نشده'}</dd></div>
                <div><dt>تاریخ مراسم</dt><dd>{detailsInvoice.ceremony_date ? formatPersianDigits(detailsInvoice.ceremony_date) : 'ثبت نشده'}</dd></div>
                <div className="invoice-details-address"><dt>نشانی</dt><dd>{detailsInvoice.customer_address || 'ثبت نشده'}</dd></div>
                <div><dt>مبلغ کل</dt><dd>{formatDisplay(total)} تومان</dd></div>
                <div><dt>مبلغ پرداختی</dt><dd>{formatDisplay(paid)} تومان</dd></div>
                <div><dt>مانده</dt><dd>{formatDisplay(calcRemaining(total, paid))} تومان</dd></div>
                <div><dt>وضعیت پرداخت</dt><dd><span style={{ color: status.color }}>{status.label}</span></dd></div>
                <div><dt>سود خالص</dt><dd>{formatDisplay(calculateInvoiceProfit(detailsItems))} تومان</dd></div>
                <div><dt>تاریخ ثبت</dt><dd>{detailsInvoice.created_at ? new Date(detailsInvoice.created_at).toLocaleDateString('fa-IR') : 'ثبت نشده'}</dd></div>
                {detailsInvoice.quotation_id && (
                  <div><dt>پیش‌فاکتور مبنا</dt><dd>شمارهٔ #{formatPersianDigits(detailsInvoice.quotation_id)}</dd></div>
                )}
              </dl>
              <h4 className="invoice-details-items-title">اقلام فاکتور</h4>
              {detailsItems.length ? (
                <div className="invoice-details-items-wrap">
                  <table className="invoice-details-items">
                    <thead><tr><th>قلم</th><th>نوع</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead>
                    <tbody>{detailsItems.map((item, index) => {
                      const quantity = Number(item.qty || item.quantity || 1);
                      const price = getActiveUnitPrice(item);
                      return (
                        <tr key={`${item.id || item.title || 'item'}-${index}`}>
                          <td>{item.title || item.item_name || item.name || 'قلم بدون نام'}</td>
                          <td>{item.item_type === 'rent' ? 'اجاره‌ای' : 'فروشی'}</td>
                          <td>{formatDisplay(quantity)}</td>
                          <td>{formatDisplay(price)} تومان</td>
                          <td>{formatDisplay(quantity * price)} تومان</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              ) : <p className="invoice-details-empty">اقلامی برای این فاکتور ثبت نشده است.</p>}
            </section>
          </div>
        );
      })()}
    </div>
  );
}
