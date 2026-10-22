import React, { useState, useEffect } from 'react';
import { deleteRows, readTable, updateRows } from '../offlineSync';
import { formatDisplay, formatPersianDigits } from '../styles';
import FormattedNumberInput from './FormattedNumberInput';

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
  const [paymentStatus, setPaymentStatus] = useState('unpaid');

  // حالت نمایش چک‌لیست برای هر فاکتور
  const [checklistOpenId, setChecklistOpenId] = useState(null);
  const [newChecklistTask, setNewChecklistTask] = useState('');

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
    if (bulkAction === 'edit') handleStartEdit(invoice);
    if (bulkAction === 'print') handlePrint(invoice);
    if (bulkAction === 'whatsapp') handleWhatsAppShare(invoice);
    if (bulkAction === 'checklist') {
      setChecklistOpenId((currentId) => currentId === invoice.id ? null : invoice.id);
    }
  };

  // ارسال پیام مستقیم به واتساپ مشتری
  const handleWhatsAppShare = (inv) => {
    let phone = inv.customer_phone || inv.phone || '';
    if (!phone) {
      phone = prompt("لطفا شماره موبایل مشتری را وارد کنید (مثلاً 09123456789):", "");
      if (!phone) return;
    }

    let cleanPhone = phone.trim();
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '98' + cleanPhone.slice(1);
    }

    const paid = Number(inv.paid_amount || 0);
    const total = Number(inv.total_price || 0);
    const remaining = calcRemaining(total, paid);
    const statusMeta = getStatusMeta(inv.payment_status);

    const text = encodeURIComponent(
      `سلام ${inv.customer_name || 'مشتری عزیز'} عزیز،\n` +
      `با تشکر از انتخاب ${businessName} 🕊️\n` +
      `جزئیات فاکتور شماره #${formatPersianDigits(inv.id)}:\n` +
      `📅 تاریخ مراسم: ${inv.ceremony_date || 'تعیین نشده'}\n` +
      `💰 مبلغ کل: ${formatDisplay(total)} تومان\n` +
      `✅ مبلغ پرداختی (بیعانه): ${formatDisplay(paid)} تومان\n` +
      `📌 مانده بدهی: ${formatDisplay(remaining)} تومان\n` +
      `🔖 وضعیت پرداخت: ${statusMeta.label}\n` +
      `در صورت داشتن هرگونه سوال در خدمت شما هستیم.`
    );

    window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
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
    setPaymentStatus(inv.payment_status || 'unpaid');

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

    const { error } = await updateRows('invoices', {
        customer_name: customerName,
        customer_phone: customerPhone,
        order_date: orderDate,
        ceremony_date: ceremonyDate,
        customer_address: customerAddress,
        items_data: normalizedItems,
        total_price: newTotalPrice,
        paid_amount: Number(paidAmount || 0),
        payment_status: paymentStatus
      }, [{ column: 'id', operator: 'eq', value: id }]);

    if (error) {
      alert("خطا در ذخیره اطلاعات: " + error.message);
    } else {
      setEditingId(null);
      setIsCustomerListOpen(false);
      fetchOfficialInvoices();
    }
  };

  // ================= چاپ فاکتور رسمی A4 =================
  const handlePrint = (inv) => {
    const printWindow = window.open("", "_blank");
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

    printWindow.document.write(`
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

          <script>window.onload = function() { window.print(); window.close(); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ================= رابط کاربری =================
  return (
    <div style={{ background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
      <div className="official-invoices-toolbar">
        <h3 style={{ margin: 0, color: '#1e293b', fontSize: '15px' }}>لیست فاکتورهای رسمی</h3>
        <div className="official-invoices-bulk-actions">
          {editingId !== null ? (
            <>
              <button type="button" className="official-invoices-apply-button" onClick={() => handleSaveEdit(editingId)}>ذخیره ویرایش</button>
              <button type="button" className="official-invoices-cancel-button" onClick={() => setEditingId(null)}>انصراف</button>
            </>
          ) : (
            <>
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
              <span className="official-invoices-selected-count">
                {selectedIds.length > 1
                  ? `${formatDisplay(selectedIds.length)} انتخاب‌شده؛ این عملیات فقط برای یک فاکتور است`
                  : `${formatDisplay(selectedIds.length)} انتخاب‌شده`}
              </span>
            </>
          )}
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
                const isEditing = editingId === inv.id;
                const isChecklistOpen = checklistOpenId === inv.id;
                const currentChecklist = Array.isArray(inv.checklist) ? inv.checklist : getDefaultChecklist();
                const currentTotal = isEditing
                  ? editableItems.reduce((s, i) => s + (Number(i.qty || 1) * getActiveUnitPrice(i)), 0)
                  : Number(inv.total_price || 0);
                const currentStatus = isEditing ? paymentStatus : (inv.payment_status || 'unpaid');
                const statusMeta = getStatusMeta(currentStatus);

                return (
                  <React.Fragment key={inv.id}>
                    <tr style={{ borderBottom: '1px solid #f1f5f9', background: selectedIds.includes(inv.id) ? '#f8fafc' : 'transparent' }}>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(inv.id)}
                          onChange={() => handleToggleSelect(inv.id)}
                        />
                      </td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#0284c7' }}>#{formatPersianDigits(inv.id)}</td>

                      <td style={{ padding: '10px', fontWeight: 'bold' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                              style={{ width: '170px', padding: '4px', fontSize: '11px' }}
                            />
                            {isCustomerListOpen && (
                              <div style={{ position: 'relative', zIndex: 20 }}>
                                <div style={{ position: 'absolute', top: 0, right: 0, width: '220px', maxHeight: '180px', overflowY: 'auto', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '5px', boxShadow: '0 4px 12px rgba(15,23,42,.15)' }}>
                                  {customerLoadError ? (
                                    <div role="alert" style={{ padding: '8px', color: '#b91c1c', whiteSpace: 'normal' }}>{customerLoadError}</div>
                                  ) : filteredCustomers.length ? filteredCustomers.map((customer) => (
                                    <button
                                      key={customer.id}
                                      type="button"
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={() => {
                                        const name = customer['Full name'] || '';
                                        setCustomerName(name);
                                        setCustomerSearch(name);
                                        setCustomerPhone(customer.phone || '');
                                        setCustomerAddress(customer.address || '');
                                        setIsCustomerListOpen(false);
                                      }}
                                      style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '8px', border: 0, borderBottom: '1px solid #e2e8f0', background: '#fff', textAlign: 'right', cursor: 'pointer' }}
                                    >
                                      <span>{customer['Full name'] || 'بدون نام'}</span>
                                      <small dir="ltr" style={{ color: '#64748b', textAlign: 'right' }}>{customer.phone ? formatPersianDigits(customer.phone) : 'بدون شماره'}</small>
                                    </button>
                                  )) : (
                                    <div style={{ padding: '8px', color: '#64748b', whiteSpace: 'normal' }}>
                                      {customerSearch.trim() ? 'مشتری پیدا نشد؛ نام را می‌توانید دستی وارد کنید.' : 'برای جست‌وجو نام یا شماره را بنویسید.'}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            <input
                              type="text"
                              value={customerPhone}
                              onChange={(e) => setCustomerPhone(e.target.value)}
                              placeholder="موبایل (09...)"
                              style={{ width: '110px', padding: '4px', fontSize: '11px' }}
                            />
                            <input type="text" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} placeholder="تاریخ سفارش" style={{ width: '110px', padding: '4px', fontSize: '11px' }} />
                            <input type="text" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="آدرس مشتری" style={{ width: '170px', padding: '4px', fontSize: '11px' }} />
                            <FormattedNumberInput value={paidAmount} onValueChange={(value) => setPaidAmount(value)} emptyWhenZero style={{ width: '120px', padding: '4px', fontSize: '11px' }} aria-label="مبلغ پرداختی" />
                          </div>
                        ) : (
                          <div>
                            <div>{inv.customer_name}</div>
                            {inv.customer_phone && <div style={{ fontSize: '10px', color: '#64748b' }}>{formatPersianDigits(inv.customer_phone)}</div>}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '10px' }}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={ceremonyDate}
                            onChange={(e) => setCeremonyDate(e.target.value)}
                            placeholder="1405/02/15"
                            style={{ width: '80px', padding: '4px', fontSize: '11px' }}
                          />
                        ) : (
                          (inv.ceremony_date ? formatPersianDigits(inv.ceremony_date) : <span style={{ color: '#94a3b8' }}>ثبت نشده</span>)
                        )}
                      </td>

                      <td style={{ padding: '10px', color: '#0369a1' }}>
                        {formatDisplay(currentTotal)}
                      </td>

                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        {isEditing ? (
                          <select
                            value={paymentStatus}
                            onChange={(e) => setPaymentStatus(e.target.value)}
                            style={{ padding: '4px', fontSize: '11px', borderRadius: '4px' }}>
                            {PAYMENT_STATUSES.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        ) : (
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
                        )}
                      </td>

                      <td className="official-invoices-actions-cell" style={{ padding: '10px', textAlign: 'center' }}>
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

                    {/* پنل چک‌لیست مراسم */}
                    {isChecklistOpen && !isEditing && (
                      <tr style={{ background: '#faf5ff' }}>
                        <td colSpan="7" style={{ padding: '12px 20px' }}>
                          <div style={{ background: '#fff', border: '1px solid #d8b4fe', padding: '12px', borderRadius: '6px' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#6b21a8', marginBottom: '8px' }}>
                              ✅ چک‌لیست کارهای روز مراسم برای مشتری: {inv.customer_name} (تاریخ: {inv.ceremony_date || 'تعیین نشده'})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {currentChecklist.map((item, itemIdx) => (
                                <label key={itemIdx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', background: item.done ? '#f3e8ff' : '#f8fafc', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e9d5ff' }}>
                                  <input
                                    type="checkbox"
                                    checked={item.done}
                                    onChange={() => handleToggleChecklistItem(inv, itemIdx)}
                                    style={{ width: '16px', height: '16px', accentColor: '#9333ea' }}
                                  />
                                  <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? '#6b7280' : '#1f2937' }}>
                                    {item.title || item.text}
                                  </span>
                                </label>
                              ))}
                            </div>
                            <form
                              onSubmit={(event) => handleAddChecklistItem(event, inv)}
                              style={{ display: 'flex', gap: '8px', marginTop: '10px' }}
                            >
                              <input
                                type="text"
                                value={newChecklistTask}
                                onChange={(event) => setNewChecklistTask(event.target.value)}
                                placeholder="افزودن کار جدید به چک‌لیست..."
                                aria-label="عنوان کار جدید در چک‌لیست"
                                required
                                style={{ flex: 1, margin: 0, padding: '6px 10px', border: '1px solid #d8b4fe', borderRadius: '4px', fontSize: '11px' }}
                              />
                              <button
                                type="submit"
                                style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}
                              >
                                افزودن
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* پنل پیشرفته ویرایش اقلام فاکتور */}
                    {isEditing && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan="7" style={{ padding: '12px 20px' }}>
                          <div style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '12px', borderRadius: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#334155' }}>مدیریت اقلام فاکتور (حفظ همزمان قیمت‌های درجه ۱، ۲ و ۳):</div>
                              <button
                                onClick={handleAddEditableItem}
                                style={{ background: '#10b981', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                                + افزودن قلم جدید
                              </button>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                              <thead>
                                <tr style={{ background: '#e2e8f0' }}>
                                  <th style={{ padding: '6px', border: '1px solid #cbd5e1' }}>نام کالا / خدمت</th>
                                  <th style={{ padding: '6px', border: '1px solid #cbd5e1' }}>نوع کالا</th>
                                  <th style={{ padding: '6px', border: '1px solid #cbd5e1' }}>سطح قیمت فعال</th>
                                  <th style={{ padding: '6px', border: '1px solid #cbd5e1' }}>تعداد</th>
                                  <th style={{ padding: '6px', border: '1px solid #cbd5e1' }}>قیمت واحد فعال (تومان)</th>
                                  <th style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>عملیات</th>
                                </tr>
                              </thead>
                              <tbody>
                                {editableItems.map((item, itemIdx) => (
                                  <tr key={itemIdx}>
                                    <td style={{ padding: '6px', border: '1px solid #cbd5e1' }}>
                                      <input
                                        type="text"
                                        value={item.title || ''}
                                        onChange={(e) => handleItemChange(itemIdx, 'title', e.target.value)}
                                        style={{ width: '95%', padding: '4px' }}
                                      />
                                    </td>
                                    <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                                      <select
                                        value={item.item_type || 'sale'}
                                        onChange={(e) => handleItemChange(itemIdx, 'item_type', e.target.value)}
                                        style={{ padding: '4px', fontSize: '11px' }}>
                                        <option value="sale">فروشی</option>
                                        <option value="rent">اجاره‌ای</option>
                                      </select>
                                    </td>
                                    <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                                      <select
                                        value={item.price_level || '1'}
                                        onChange={(e) => handlePriceLevelChange(itemIdx, e.target.value)}
                                        style={{ padding: '4px', fontSize: '11px' }}>
                                        <option value="1">درجه ۱ (پایه: {item.p1 || 0})</option>
                                        <option value="2">درجه ۲ (پایه: {item.p2 || 0})</option>
                                        <option value="3">درجه ۳ (پایه: {item.p3 || 0})</option>
                                      </select>
                                    </td>
                                    <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                                      <FormattedNumberInput
                                        allowDecimal={false}
                                        value={item.qty || 1}
                                        onValueChange={(value) => handleItemChange(itemIdx, 'qty', Number(value))}
                                        style={{ width: '50px', padding: '4px', textAlign: 'center' }}
                                      />
                                    </td>
                                    <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                                      <FormattedNumberInput
                                        value={getActiveUnitPrice(item)}
                                        onValueChange={(value) => handleUnitPriceChange(itemIdx, value)}
                                        emptyWhenZero
                                        style={{ width: '100px', padding: '4px', textAlign: 'center' }}
                                      />
                                    </td>
                                    <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                                      <button
                                        onClick={() => handleRemoveEditableItem(itemIdx)}
                                        style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '3px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>
                                        حذف قلم
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {/* بخش پرداخت و تسویه در حالت ویرایش */}
                            <div style={{ marginTop: '12px', padding: '10px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', fontSize: '12px' }}>
                              <div>
                                <strong style={{ color: '#0369a1' }}>مبلغ کل فاکتور:</strong>{' '}
                                <span style={{ color: '#0369a1', fontWeight: 'bold' }}>
                                  {formatDisplay(editableItems.reduce((s, i) => s + (Number(i.qty || 1) * getActiveUnitPrice(i)), 0))} تومان
                                </span>
                              </div>
                              <div>
                                <strong style={{ color: '#0d9488' }}>مبلغ پرداختی (بیعانه):</strong>{' '}
                                <FormattedNumberInput
                                  value={paidAmount}
                                  onValueChange={(value) => setPaidAmount(value)}
                                  style={{ width: '100px', padding: '4px', fontSize: '11px', textAlign: 'center' }}
                                /> تومان
                              </div>
                              <div>
                                <strong style={{ color: '#dc2626' }}>مانده بدهی:</strong>{' '}
                                <span style={{ color: '#dc2626', fontWeight: 'bold' }}>
                                  {formatDisplay(calcRemaining(editableItems.reduce((s, i) => s + (Number(i.qty || 1) * getActiveUnitPrice(i)), 0), paidAmount))} تومان
                                </span>
                              </div>
                              <div>
                                <strong style={{ color: '#334155' }}>وضعیت تسویه:</strong>{' '}
                                <select
                                  value={paymentStatus}
                                  onChange={(e) => setPaymentStatus(e.target.value)}
                                  style={{ padding: '4px', fontSize: '11px', borderRadius: '4px' }}>
                                  {PAYMENT_STATUSES.map(s => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
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
          <div className="invoice-details-backdrop" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailsInvoice(null);
          }}>
            <section className="invoice-details-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-details-title" dir="rtl">
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
