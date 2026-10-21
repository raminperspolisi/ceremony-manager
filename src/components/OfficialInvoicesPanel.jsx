import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// مقادیر مجاز وضعیت پرداخت
const PAYMENT_STATUSES = [
  { value: 'unpaid', label: 'تسویه نشده', color: '#dc2626', bg: '#fee2e2' },
  { value: 'deposit_paid', label: 'بیعانه پرداخت شده', color: '#a16207', bg: '#fef9c3' },
  { value: 'paid', label: 'تسویه شده', color: '#16a34a', bg: '#dcfce7' }
];

const getStatusMeta = (status) =>
  PAYMENT_STATUSES.find(s => s.value === status) || PAYMENT_STATUSES[0];

export default function OfficialInvoicesPanel() {
  const [invoices, setInvoices] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);

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
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState('unpaid');

  // حالت نمایش چک‌لیست برای هر فاکتور
  const [checklistOpenId, setChecklistOpenId] = useState(null);

  useEffect(() => {
    fetchOfficialInvoices();
    const fetchCustomers = async () => {
      const { data, error } = await supabase.from('customers').select('id, "Full name", phone, address');
      if (error) {
        setCustomerLoadError(`بارگذاری فهرست مشتریان ناموفق بود: ${error.message}`);
        return;
      }
      setCustomers(data || []);
      setCustomerLoadError('');
    };
    fetchCustomers();
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
    const { data, error } = await supabase.from('invoices').select('*').order('created_at', { ascending: false });
    if (data) setInvoices(data);
    if (error) console.error("Error fetching invoices:", error.message);
    setSelectedIds([]);
  }

  const handleToggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(invoices.map(inv => inv.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("آیا از حذف این فاکتور رسمی مطمئن هستید؟")) return;
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) {
      alert("خطا در حذف فاکتور: " + error.message);
    } else {
      fetchOfficialInvoices();
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`آیا از حذف ${selectedIds.length} فاکتور انتخاب‌شده مطمئن هستید؟`)) return;

    const { error } = await supabase.from('invoices').delete().in('id', selectedIds);
    if (error) {
      alert("خطا در حذف گروهی فاکتورها: " + error.message);
    } else {
      fetchOfficialInvoices();
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
      `با تشکر از انتخاب تشریفات آژو 🕊️\n` +
      `جزئیات فاکتور شماره #${inv.id}:\n` +
      `📅 تاریخ مراسم: ${inv.ceremony_date || 'تعیین نشده'}\n` +
      `💰 مبلغ کل: ${total.toLocaleString()} تومان\n` +
      `✅ مبلغ پرداختی (بیعانه): ${paid.toLocaleString()} تومان\n` +
      `📌 مانده بدهی: ${remaining.toLocaleString()} تومان\n` +
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

    const { error } = await supabase
      .from('invoices')
      .update({ checklist: updatedChecklist })
      .eq('id', inv.id);

    if (error) {
      alert("خطا در بروزرسانی چک‌لیست: " + error.message);
    } else {
      fetchOfficialInvoices();
    }
  };

  // کمکی برای گرفتن قیمت فعال بر اساس سطح انتخابی کالا
  const getActiveUnitPrice = (item) => {
    const lvl = String(item.price_level || '1');
    if (lvl === '2') return Number(item.p2 || 0);
    if (lvl === '3') return Number(item.p3 || 0);
    return Number(item.p1 || item.price || 0);
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
    setPaidAmount(Number(inv.paid_amount || 0));
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
    const val = Number(value);
    const lvl = String(item.price_level || '1');

    if (lvl === '2') item.p2 = val;
    else if (lvl === '3') item.p3 = val;
    else item.p1 = val;

    setEditableItems(updated);
  };

  const handleAddEditableItem = () => {
    setEditableItems([
      ...editableItems,
      { title: '', item_type: 'sale', price_level: '1', qty: 1, p1: 0, p2: 0, p3: 0, base_cost: 0 }
    ]);
  };

  const handleRemoveEditableItem = (index) => {
    setEditableItems(editableItems.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async (id) => {
    const newTotalPrice = editableItems.reduce((sum, item) => {
      const q = Number(item.qty || 1);
      const p = getActiveUnitPrice(item);
      return sum + (q * p);
    }, 0);

    const { error } = await supabase
      .from('invoices')
      .update({
        customer_name: customerName,
        customer_phone: customerPhone,
        order_date: orderDate,
        ceremony_date: ceremonyDate,
        customer_address: customerAddress,
        items_data: editableItems,
        total_price: newTotalPrice,
        paid_amount: Number(paidAmount || 0),
        payment_status: paymentStatus
      })
      .eq('id', id);

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
            <img class="company-logo" src="/azho-logo.png" alt="لوگوی آژو مراسم">
            <h2>فاکتور رسمی فروش و اجاره تشریفات آژو</h2>
            <div class="invoice-number">شماره فاکتور: #${inv.id}</div>
          </div>
          <div class="info-box">
            <div class="info-row">
              <div><strong>نام مشتری:</strong> ${inv.customer_name}</div>
              <div><strong>تاریخ صدور سیستم:</strong> ${new Date(inv.created_at).toLocaleDateString('fa-IR')}</div>
            </div>
            <div class="info-row">
              <div><strong>تاریخ سفارش:</strong> ${inv.order_date || 'وارد نشده'}</div>
              <div><strong>تاریخ مراسم:</strong> ${inv.ceremony_date || 'وارد نشده'}</div>
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
                    <td>${idx + 1}</td>
                    <td>${item.title}</td>
                    <td><span class="${isRent ? 'badge-rent' : 'badge-sale'}">${isRent ? 'اجاره‌ای' : 'فروشی'}</span></td>
                    <td>${levelText}</td>
                    <td>${qty}</td>
                    <td>${price.toLocaleString()}</td>
                    <td>${(qty * price).toLocaleString()}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div class="payment-box">
            <div class="payment-row"><span><strong>مبلغ کل فاکتور:</strong></span><span>${total.toLocaleString()} تومان</span></div>
            <div class="payment-row"><span><strong>مبلغ پرداختی (بیعانه):</strong></span><span>${paid.toLocaleString()} تومان</span></div>
            <div class="payment-row"><span><strong>مانده بدهی:</strong></span><span style="color:${remaining > 0 ? '#dc2626' : '#16a34a'}; font-weight:bold;">${remaining.toLocaleString()} تومان</span></div>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, color: '#1e293b', fontSize: '15px' }}>لیست فاکتورهای رسمی و چک‌لیست مراسم</h3>

        {selectedIds.length > 0 && (
          <button
            onClick={handleDeleteSelected}
            style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
            حذف موارد انتخاب‌شده ({selectedIds.length})
          </button>
        )}
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
              <th style={{ padding: '10px' }}>تاریخ سفارش</th>
              <th style={{ padding: '10px' }}>تاریخ مراسم</th>
              <th style={{ padding: '10px' }}>آدرس مشتری</th>
              <th style={{ padding: '10px' }}>مبلغ کل (تومان)</th>
              <th style={{ padding: '10px' }}>پرداختی (تومان)</th>
              <th style={{ padding: '10px' }}>مانده (تومان)</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>وضعیت پرداخت</th>
              <th style={{ padding: '10px' }}>سود خالص (تومان)</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>عملیات و ابزارها</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan="12" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>هیچ فاکتور رسمی ثبت نشده است.</td>
              </tr>
            ) : (
              invoices.map((inv, idx) => {
                const isEditing = editingId === inv.id;
                const isChecklistOpen = checklistOpenId === inv.id;
                const profit = calculateInvoiceProfit(isEditing ? editableItems : inv.items_data);
                const currentChecklist = inv.checklist || getDefaultChecklist();
                const currentTotal = isEditing
                  ? editableItems.reduce((s, i) => s + (Number(i.qty || 1) * getActiveUnitPrice(i)), 0)
                  : Number(inv.total_price || 0);
                const currentPaid = isEditing ? Number(paidAmount || 0) : Number(inv.paid_amount || 0);
                const currentRemaining = calcRemaining(currentTotal, currentPaid);
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
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#0284c7' }}>#{inv.id}</td>

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
                                      <small dir="ltr" style={{ color: '#64748b', textAlign: 'right' }}>{customer.phone || 'بدون شماره'}</small>
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
                          </div>
                        ) : (
                          <div>
                            <div>{inv.customer_name}</div>
                            {inv.customer_phone && <div style={{ fontSize: '10px', color: '#64748b' }}>{inv.customer_phone}</div>}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '10px' }}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={orderDate}
                            onChange={(e) => setOrderDate(e.target.value)}
                            placeholder="1405/02/10"
                            style={{ width: '80px', padding: '4px', fontSize: '11px' }}
                          />
                        ) : (
                          inv.order_date || <span style={{ color: '#94a3b8' }}>ثبت نشده</span>
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
                          inv.ceremony_date || <span style={{ color: '#94a3b8' }}>ثبت نشده</span>
                        )}
                      </td>

                      <td style={{ padding: '10px' }}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={customerAddress}
                            onChange={(e) => setCustomerAddress(e.target.value)}
                            placeholder="آدرس کامل..."
                            style={{ width: '130px', padding: '4px', fontSize: '11px' }}
                          />
                        ) : (
                          inv.customer_address || <span style={{ color: '#94a3b8' }}>ثبت نشده</span>
                        )}
                      </td>

                      <td style={{ padding: '10px', color: '#0369a1' }}>
                        {currentTotal.toLocaleString()}
                      </td>

                      <td style={{ padding: '10px', color: '#0d9488' }}>
                        {isEditing ? (
                          <input
                            type="number"
                            value={paidAmount}
                            onChange={(e) => setPaidAmount(Number(e.target.value))}
                            style={{ width: '80px', padding: '4px', fontSize: '11px', textAlign: 'center' }}
                          />
                        ) : (
                          currentPaid.toLocaleString()
                        )}
                      </td>

                      <td style={{ padding: '10px', color: currentRemaining > 0 ? '#dc2626' : '#16a34a', fontWeight: 'bold' }}>
                        {currentRemaining.toLocaleString()}
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

                      <td style={{ padding: '10px', color: '#16a34a', fontWeight: 'bold' }}>{Number(profit).toLocaleString()}</td>

                      <td className="official-invoices-actions-cell" style={{ padding: '10px', textAlign: 'center' }}>
                        <div className="official-invoices-actions" style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(inv.id)}
                                style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                                ذخیره
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                style={{ background: '#64748b', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                                انصراف
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleWhatsAppShare(inv)}
                                style={{ background: '#25D366', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                                💬 واتساپ
                              </button>
                              <button
                                onClick={() => setChecklistOpenId(isChecklistOpen ? null : inv.id)}
                                style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                                📋 چک‌لیست
                              </button>
                              <button
                                onClick={() => handleStartEdit(inv)}
                                style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                                ویرایش
                              </button>
                              <button
                                onClick={() => handlePrint(inv)}
                                style={{ background: '#10b981', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                                چاپ
                              </button>
                              <button
                                onClick={() => handleDelete(inv.id)}
                                style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                                حذف
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* پنل چک‌لیست مراسم */}
                    {isChecklistOpen && !isEditing && (
                      <tr style={{ background: '#faf5ff' }}>
                        <td colSpan="12" style={{ padding: '12px 20px' }}>
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
                                    {item.title}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* پنل پیشرفته ویرایش اقلام فاکتور */}
                    {isEditing && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan="12" style={{ padding: '12px 20px' }}>
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
                                      <input
                                        type="number"
                                        value={item.qty || 1}
                                        onChange={(e) => handleItemChange(itemIdx, 'qty', Number(e.target.value))}
                                        style={{ width: '50px', padding: '4px', textAlign: 'center' }}
                                      />
                                    </td>
                                    <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                                      <input
                                        type="number"
                                        value={getActiveUnitPrice(item)}
                                        onChange={(e) => handleUnitPriceChange(itemIdx, e.target.value)}
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
                                  {editableItems.reduce((s, i) => s + (Number(i.qty || 1) * getActiveUnitPrice(i)), 0).toLocaleString()} تومان
                                </span>
                              </div>
                              <div>
                                <strong style={{ color: '#0d9488' }}>مبلغ پرداختی (بیعانه):</strong>{' '}
                                <input
                                  type="number"
                                  value={paidAmount}
                                  onChange={(e) => setPaidAmount(Number(e.target.value))}
                                  style={{ width: '100px', padding: '4px', fontSize: '11px', textAlign: 'center' }}
                                /> تومان
                              </div>
                              <div>
                                <strong style={{ color: '#dc2626' }}>مانده بدهی:</strong>{' '}
                                <span style={{ color: '#dc2626', fontWeight: 'bold' }}>
                                  {calcRemaining(editableItems.reduce((s, i) => s + (Number(i.qty || 1) * getActiveUnitPrice(i)), 0), paidAmount).toLocaleString()} تومان
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
    </div>
  );
}
