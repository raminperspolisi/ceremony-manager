import React, { useState, useEffect } from 'react';
import { styles, formatDisplay } from '../styles'; 
import { supabase } from '../supabaseClient';

const win95Style = {
  window: { 
    fontFamily: 'Tahoma, sans-serif', 
    direction: 'rtl', 
    backgroundColor: '#f8fafc',
    padding: '15px', 
    border: '1px solid #e2e8f0', 
    borderRadius: '6px',
    color: '#1a1a2e',
    fontSize: '13px',
    width: '100%',
    boxSizing: 'border-box'
  },
  header: { 
    backgroundColor: '#0ea5e9', 
    color: '#ffffff', 
    padding: '10px 12px', 
    fontWeight: 'bold', 
    fontSize: '14px', 
    borderRadius: '6px',
    marginBottom: '12px' 
  },
  input: { 
    border: '1px solid #cbd5e1', 
    background: '#fff', 
    padding: '6px 8px', 
    fontSize: '12px', 
    borderRadius: '4px',
    outline: 'none',
    boxSizing: 'border-box'
  },
  button: { 
    backgroundColor: '#0ea5e9', 
    border: 'none', 
    padding: '7px 12px', 
    fontSize: '12px', 
    cursor: 'pointer',
    fontWeight: 'bold',
    color: '#ffffff',
    borderRadius: '4px',
    transition: 'all 0.2s ease'
  },
  tableHeader: { 
    background: '#f1f5f9', 
    borderBottom: '1px solid #e2e8f0', 
    padding: '8px 10px', 
    fontSize: '12px', 
    textAlign: 'right',
    color: '#64748b',
    fontWeight: 'bold'
  },
  tableCell: { 
    borderBottom: '1px solid #f1f5f9', 
    padding: '8px 10px', 
    fontSize: '12px',
    color: '#334155'
  }
};

export default function QuotationPanel({ selectedItems = [], setSelectedItems, businessName = 'تشریفات آژو', logoUrl = '/azho-logo.png' }) {
  const items = selectedItems || [];
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showBuyingPrice, setShowBuyingPrice] = useState(false);
  
  const [showAddCustomerForm, setShowAddCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  const [quotationDate, setQuotationDate] = useState(new Date().toLocaleDateString('fa-IR'));
  const [savedInvoices, setSavedInvoices] = useState([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);

  useEffect(() => {
    fetchCustomers();
    fetchInvoices();
  }, []);

  async function fetchCustomers() {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('Full name', { ascending: true });
      
      if (error) throw error;
      if (data) setCustomers(data);
    } catch (err) {
      console.error('خطا در دریافت مشتریان:', err.message);
    }
  }

  async function handleAddNewCustomer() {
    if (!newCustomerName.trim()) { 
      alert("نام مشتری الزامی است."); 
      return; 
    }
    
    try {
      const { error } = await supabase
        .from('customers')
        .insert([{ 
          "Full name": newCustomerName.trim(), 
          "phone": newCustomerPhone.trim() 
        }]);

      if (error) throw error;

      alert("مشتری جدید با موفقیت اضافه شد.");
      setSelectedCustomer({ "Full name": newCustomerName.trim(), "phone": newCustomerPhone.trim() });
      setSearchTerm(newCustomerName.trim());
      setNewCustomerName('');
      setNewCustomerPhone('');
      setShowAddCustomerForm(false);
      setIsSearching(false);
      fetchCustomers();
    } catch (error) {
      alert("خطا در افزودن مشتری: " + error.message);
    }
  }

  async function fetchInvoices() {
    try {
      const { data: quotations } = await supabase
        .from('quotations')
        .select('*')
        .order('created_at', { ascending: false });

      const { data: officialInvoices } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false });
      
      const combined = [
        ...(quotations || []).map(item => ({ ...item, type: 'quotation' })),
        ...(officialInvoices || []).map(item => ({ ...item, type: 'official' }))
      ];

      combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setSavedInvoices(combined);
      setSelectedInvoiceIds([]);
    } catch (err) {
      console.error('خطا در دریافت فاکتورها:', err.message);
    }
  }

  const getQuantity = (val) => {
    const quantity = Number(val);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  };

  const total1 = items.reduce((sum, item) => sum + (Number(item.price_level1) || 0) * getQuantity(item.requestedQuantity), 0);
  const total2 = items.reduce((sum, item) => sum + (Number(item.price_level2) || 0) * getQuantity(item.requestedQuantity), 0);
  const total3 = items.reduce((sum, item) => sum + (Number(item.price_level3) || 0) * getQuantity(item.requestedQuantity), 0);

  const handleSaveAndPrint = async () => {
    if (!selectedCustomer) { 
      alert("لطفاً ابتدا مشتری را انتخاب کنید."); 
      return; 
    }
    if (items.length === 0) { 
      alert("لیست کالاها خالی است."); 
      return; 
    }

    setIsSaving(true);
    try {
      const itemsPayload = items.map(i => {
        const qty = getQuantity(i.requestedQuantity);
        const unitPrice = Number(i.price_level1) || 0;
        const unitCost = Number(i.base_cost) || 0;
        const lineTotal = unitPrice * qty;
        const lineCost = unitCost * qty;
        const typeNormalized = (i.item_type === 'rent' || i.item_type === 'اجاره' || i.item_type === 'اجاره‌ای') ? 'rent' : 'sale';

        return {
          title: i.title,
          qty: qty,
          p1: Number(i.price_level1) || 0,
          p2: Number(i.price_level2) || 0,
          p3: Number(i.price_level3) || 0,
          cost: unitCost,
          item_type: typeNormalized,
          unit_price: unitPrice,
          total_price: lineTotal,
          total_cost: lineCost,
          profit: lineTotal - lineCost
        };
      });

      const { error } = await supabase.from("quotations").insert([
        { 
          customer_name: selectedCustomer["Full name"], 
          items_json: itemsPayload, 
          total_price: total1 
        }
      ]);

      if (error) throw error;
      alert("پیش‌فاکتور با موفقیت ذخیره شد.");
      fetchInvoices();

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        const safeBusinessName = String(businessName).replace(/[&<>"']/g, (character) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[character]));
        const safeLogoUrl = String(logoUrl).replace(/[&<>"']/g, (character) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[character]));
        printWindow.document.write(`
          <html dir="rtl" lang="fa">
            <head>
              <meta charset="UTF-8">
              <title>پیش‌فاکتور ${safeBusinessName} - ${selectedCustomer["Full name"]}</title>
              <style>
                @font-face { font-family: 'IRANSans'; src: url('https://cdn.fontcdn.ir/Font/Persian/IRANSans/IRANSans.woff2') format('woff2'); }
                body { font-family: 'IRANSans', Tahoma, sans-serif; padding: 35px; direction: rtl; color: #1e293b; }
                .header-title { display: flex; align-items: center; justify-content: center; gap: 16px; text-align: center; font-weight: bold; font-size: 22px; margin-bottom: 25px; border-bottom: 2px solid #0284c7; padding-bottom: 12px; }
                .company-logo { width: 72px; height: 94px; object-fit: contain; }
                .header-info { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
                th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: center; }
                th { background-color: #f1f5f9; color: #334155; font-weight: bold; }
                .totals { margin-top: 25px; font-weight: bold; font-size: 15px; background: #fafafa; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
                .totals p { margin: 6px 0; }
                .footer-text { margin-top: 40px; font-size: 12px; text-align: center; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 12px; }
              </style>
            </head>
            <body>
              <div class="header-title">
                <img class="company-logo" src="${safeLogoUrl}" alt="لوگوی ${safeBusinessName}">
                <span>پیش‌فاکتور ${safeBusinessName}</span>
              </div>
              <div class="header-info">
                  <div><strong>نام مشتری:</strong> ${selectedCustomer["Full name"]}</div>
                  <div><strong>تلفن:</strong> ${selectedCustomer.phone || 'ثبت نشده'}</div>
                  <div><strong>تاریخ صدور:</strong> ${quotationDate}</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th style="width: 45px;">ردیف</th>
                    <th>نام کالا / خدمت</th>
                    <th style="width: 80px;">نوع کالا</th>
                    <th style="width: 65px;">تعداد</th>
                    <th>درجه یک (تومان)</th>
                    <th>درجه دو (تومان)</th>
                    <th>درجه سه (تومان)</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map((item, idx) => `
                    <tr>
                      <td>${idx + 1}</td>
                      <td style="text-align: right; font-weight: 500;">${item.title}</td>
                      <td>${(item.item_type === 'rent' || item.item_type === 'اجاره' || item.item_type === 'اجاره‌ای') ? 'اجاره‌ای' : 'فروشی'}</td>
                      <td>${getQuantity(item.requestedQuantity)}</td>
                      <td>${Number(item.price_level1 || 0).toLocaleString('fa-IR')}</td>
                      <td>${Number(item.price_level2 || 0).toLocaleString('fa-IR')}</td>
                      <td>${Number(item.price_level3 || 0).toLocaleString('fa-IR')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div class="totals">
                <p>مجموع کل (درجه ۱): ${Number(total1).toLocaleString('fa-IR')} تومان</p>
                <p>مجموع کل (درجه ۲): ${Number(total2).toLocaleString('fa-IR')} تومان</p>
                <p>مجموع کل (درجه ۳): ${Number(total3).toLocaleString('fa-IR')} تومان</p>
              </div>
              <p class="footer-text">این پیش‌فاکتور صرفاً جهت برآورد هزینه و اطلاع مشتری صادر شده و فاقد جنبه پرداخت قطعی می‌باشد.</p>
              <script>
                window.onload = function() { 
                  window.print(); 
                  window.close(); 
                };
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    } catch (err) { 
      alert("خطا در ذخیره‌سازی پیش‌فاکتور: " + err.message); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const handleConvertToInvoice = async (e, inv) => {
    e.stopPropagation();
    if (inv.type === 'official') { 
      alert("این فاکتور قبلاً به فاکتور رسمی تبدیل شده است."); 
      return; 
    }
    
    const confirmConversion = window.confirm(`آیا مطمئن هستید که می‌خواهید پیش‌فاکتور «${inv.customer_name}» را به فاکتور رسمی تبدیل کنید؟`);
    if (!confirmConversion) return;
    
    const itemsToSave = inv.items_json || inv.items_data || [];

    const { error } = await supabase.from("invoices").insert([{ 
      customer_name: inv.customer_name, 
      total_price: inv.total_price, 
      items_data: itemsToSave, 
      is_official: true 
    }]);

    if (error) {
      alert("خطا در صدور فاکتور رسمی: " + error.message);
    } else {
      alert("فاکتور رسمی با موفقیت صادر شد و در گزارش مالی قرار گرفت.");
      fetchInvoices();
    }
  };

  const handleQuantityChange = (itemId, value) => {
    if (setSelectedItems) {
      setSelectedItems(items.map(item => item.id === itemId ? { ...item, requestedQuantity: value } : item));
    }
  };

  const handleRemoveItem = (itemId) => {
    if (setSelectedItems) {
      setSelectedItems(items.filter(item => item.id !== itemId));
    }
  };

  const handleLoadInvoice = (inv) => {
    const itemsData = inv.items_json || inv.items_data || [];
    const restoredItems = itemsData.map((item, index) => ({
      id: item.id || `restored-${index}-${Date.now()}`, 
      title: item.title, 
      requestedQuantity: item.qty, 
      price_level1: item.p1 || item.unit_price || 0, 
      price_level2: item.p2 || 0, 
      price_level3: item.p3 || 0, 
      base_cost: item.cost || 0,
      item_type: item.item_type || 'sale'
    }));
    
    if (setSelectedItems) {
      setSelectedItems(restoredItems);
    }
    setSearchTerm(inv.customer_name || '');
    setSelectedCustomer({ "Full name": inv.customer_name });
    alert(`پیش‌فاکتور مشتری «${inv.customer_name}» بارگذاری شد.`);
  };

  const handleDeleteInvoice = async (e, inv) => {
    e.stopPropagation();
    if (!window.confirm(`آیا از حذف این ${inv.type === 'official' ? 'فاکتور رسمی' : 'پیش‌فاکتور'} اطمینان دارید؟`)) return;
    
    const table = inv.type === 'official' ? 'invoices' : 'quotations';
    const { error } = await supabase.from(table).delete().eq("id", inv.id);
    
    if (error) {
      alert("خطا در حذف: " + error.message);
    } else {
      fetchInvoices();
    }
  };

  const handleToggleSelectInvoice = (e, id) => {
    e.stopPropagation();
    if (selectedInvoiceIds.includes(id)) {
      setSelectedInvoiceIds(selectedInvoiceIds.filter(item => item !== id));
    } else {
      setSelectedInvoiceIds([...selectedInvoiceIds, id]);
    }
  };

  const handleSelectAllInvoices = (e) => {
    if (e.target.checked) {
      setSelectedInvoiceIds(savedInvoices.map(inv => inv.id));
    } else {
      setSelectedInvoiceIds([]);
    }
  };

  const handleDeleteSelectedInvoices = async () => {
    if (selectedInvoiceIds.length === 0) { 
      alert("لطفاً حداقل یک فاکتور را انتخاب کنید."); 
      return; 
    }
    
    if (!window.confirm(`آیا از حذف ${selectedInvoiceIds.length} فاکتور انتخاب‌شده اطمینان دارید؟`)) return;

    const quotationIdsToDelete = savedInvoices.filter(i => selectedInvoiceIds.includes(i.id) && i.type === 'quotation').map(i => i.id);
    const officialIdsToDelete = savedInvoices.filter(i => selectedInvoiceIds.includes(i.id) && i.type === 'official').map(i => i.id);

    try {
      if (quotationIdsToDelete.length > 0) {
        await supabase.from('quotations').delete().in('id', quotationIdsToDelete);
      }
      if (officialIdsToDelete.length > 0) {
        await supabase.from('invoices').delete().in('id', officialIdsToDelete);
      }
      alert("فاکتورهای انتخاب‌شده با موفقیت حذف شدند.");
      fetchInvoices();
    } catch (err) {
      alert("خطا در حذف دسته‌ای: " + err.message);
    }
  };

  return (
    <div style={win95Style.window}>
      <div style={win95Style.header}>مدیریت و صدور پیش‌فاکتور</div>
      
      {/* نمایش سرجمع سطوح قیمت */}
      <div style={{ background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '15px', display: 'flex', gap: '20px', fontSize: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div><strong>قیمت درجه ۱:</strong> <span style={{ color: '#0369a1', fontWeight: 'bold' }}>{total1.toLocaleString('fa-IR')} تومان</span></div>
          <div><strong>قیمت درجه ۲:</strong> <span style={{ color: '#0369a1', fontWeight: 'bold' }}>{total2.toLocaleString('fa-IR')} تومان</span></div>
          <div><strong>قیمت درجه ۳:</strong> <span style={{ color: '#0369a1', fontWeight: 'bold' }}>{total3.toLocaleString('fa-IR')} تومان</span></div>
      </div>

      {/* نوار جستجو و انتخاب مشتری */}
      <div style={{ background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '15px', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="accounting-inline-field">
              <label htmlFor="quotation-date">تاریخ صدور</label>
              <input 
                id="quotation-date"
                style={{ ...win95Style.input, width: '120px', textAlign: 'center' }} 
                value={quotationDate} 
                onChange={(e) => setQuotationDate(e.target.value)} 
              />
          </div>
          
          <div className="accounting-inline-field" style={{ position: 'relative' }}>
              <label htmlFor="quotation-customer-search">مشتری</label>
              <input 
                id="quotation-customer-search"
                style={{ ...win95Style.input, width: '220px' }} 
                placeholder="جستجوی نام مشتری..." 
                value={searchTerm} 
                onChange={(e) => { 
                  setSearchTerm(e.target.value); 
                  setIsSearching(true); 
                }} 
              />
              <button 
                style={win95Style.button} 
                onClick={() => setShowAddCustomerForm(!showAddCustomerForm)}>
                {showAddCustomerForm ? "بستن فرم" : "+ مشتری جدید"}
              </button>
          </div>
          
          <button 
            onClick={() => setShowBuyingPrice(!showBuyingPrice)} 
            style={{ ...win95Style.button, backgroundColor: '#64748b' }}>
            {showBuyingPrice ? "مخفی کردن قیمت خرید" : "نمایش قیمت خرید"}
          </button>
      </div>

      {/* فرم افزودن مشتری جدید */}
      {showAddCustomerForm && (
        <div className="accounting-form-grid" style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px', marginBottom: '15px' }}>
            <div className="accounting-field">
            <label htmlFor="quotation-new-customer-name">نام و نام خانوادگی</label>
            <input 
              id="quotation-new-customer-name"
              style={win95Style.input}
              placeholder="نام مشتری"
              value={newCustomerName} 
              onChange={(e) => setNewCustomerName(e.target.value)} 
            />
            </div>
            <div className="accounting-field">
            <label htmlFor="quotation-new-customer-phone">شماره تماس</label>
            <input 
              id="quotation-new-customer-phone"
              style={win95Style.input}
              type="tel"
              inputMode="tel"
              placeholder="مثلاً 09123456789"
              value={newCustomerPhone} 
              onChange={(e) => setNewCustomerPhone(e.target.value)} 
            />
            </div>
            <button 
              style={{ ...win95Style.button, backgroundColor: '#10b981' }} 
              onClick={handleAddNewCustomer}>
              ذخیره مشتری
            </button>
        </div>
      )}

      {/* لیست کشویی پیشنهاد نتایج جستجوی مشتری */}
      {isSearching && searchTerm && (
        <div style={{ position: 'relative', width: '100%', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', zIndex: 20, maxHeight: '140px', overflowY: 'auto', marginBottom: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
            {customers.filter(c => (c["Full name"] || '').toLowerCase().includes(searchTerm.toLowerCase())).map((c) => (
              <div 
                key={c.id || c["Full name"]} 
                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }} 
                onClick={() => { 
                  setSelectedCustomer(c); 
                  setSearchTerm(c["Full name"]); 
                  setIsSearching(false); 
                }}>
                <strong>{c["Full name"]}</strong> {c.phone ? `(${c.phone})` : '(بدون تلفن)'}
              </div>
            ))}
        </div>
      )}

      {/* جدول اقلام انتخاب‌شده */}
      <div style={{ background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '15px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "right", fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ ...win95Style.tableHeader, textAlign: 'center', width: '60px' }}>حذف</th>
                <th style={{ ...win95Style.tableHeader, width: '45px', textAlign: 'center' }}>ردیف</th>
                <th style={win95Style.tableHeader}>نام کالا / خدمت</th>
                <th style={{ ...win95Style.tableHeader, textAlign: 'center', width: '90px' }}>نوع کالا</th>
                <th style={{ ...win95Style.tableHeader, textAlign: 'center', width: '85px' }}>تعداد</th>
                <th style={win95Style.tableHeader}>درجه ۱ (تومان)</th>
                <th style={win95Style.tableHeader}>درجه ۲ (تومان)</th>
                <th style={win95Style.tableHeader}>درجه ۳ (تومان)</th>
                {showBuyingPrice && <th style={win95Style.tableHeader}>قیمت خرید (تومان)</th>}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={showBuyingPrice ? 9 : 8} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                    هیچ کالایی به پیش‌فاکتور اضافه نشده است. (کالاهای مورد نظر را از بخش انبار انتخاب کنید)
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr key={item.id || index}>
                    <td style={{ ...win95Style.tableCell, textAlign: 'center' }}>
                      <button 
                        style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }} 
                        onClick={() => handleRemoveItem(item.id)}>
                        حذف
                      </button>
                    </td>
                    <td style={{ ...win95Style.tableCell, textAlign: 'center', color: '#64748b' }}>{index + 1}</td>
                    <td style={{ ...win95Style.tableCell, fontWeight: '500', color: '#1e293b' }}>{item.title}</td>
                    <td style={{ ...win95Style.tableCell, textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        backgroundColor: (item.item_type === 'rent' || item.item_type === 'اجاره' || item.item_type === 'اجاره‌ای') ? '#e2e3ff' : '#e6f4ea',
                        color: (item.item_type === 'rent' || item.item_type === 'اجاره' || item.item_type === 'اجاره‌ای') ? '#383a8b' : '#137333',
                        display: 'inline-block'
                      }}>
                        {(item.item_type === 'rent' || item.item_type === 'اجاره' || item.item_type === 'اجاره‌ای') ? 'اجاره‌ای' : 'فروشی'}
                      </span>
                    </td>
                    <td style={{ ...win95Style.tableCell, width: '85px' }}>
                      <input 
                        type="number" 
                        min="1"
                        value={item.requestedQuantity ?? ""} 
                        onChange={(e) => handleQuantityChange(item.id, e.target.value)} 
                        style={{ ...win95Style.input, width: '100%', textAlign: 'center' }} 
                      />
                    </td>
                    <td style={{ ...win95Style.tableCell, color: '#0369a1', fontWeight: '500' }}>
                      {formatDisplay ? formatDisplay(item.price_level1) : Number(item.price_level1 || 0).toLocaleString()}
                    </td>
                    <td style={{ ...win95Style.tableCell, color: '#0369a1', fontWeight: '500' }}>
                      {formatDisplay ? formatDisplay(item.price_level2) : Number(item.price_level2 || 0).toLocaleString()}
                    </td>
                    <td style={{ ...win95Style.tableCell, color: '#0369a1', fontWeight: '500' }}>
                      {formatDisplay ? formatDisplay(item.price_level3) : Number(item.price_level3 || 0).toLocaleString()}
                    </td>
                    {showBuyingPrice && (
                      <td style={{ ...win95Style.tableCell, color: '#475569' }}>
                        {formatDisplay ? formatDisplay(item.base_cost) : Number(item.base_cost || 0).toLocaleString()}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* دکمه چاپ و ذخیره پیش‌فاکتور */}
      <button 
        onClick={handleSaveAndPrint} 
        disabled={isSaving} 
        style={{ ...win95Style.button, backgroundColor: '#10b981', padding: '10px 20px', fontSize: '13px' }}>
        {isSaving ? "در حال ذخیره‌سازی..." : "💾 چاپ و ذخیره پیش‌فاکتور"}
      </button>

      {/* بخش فاکتورهای اخیر */}
      <div style={{ marginTop: "20px", background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 'bold', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input 
              type="checkbox" 
              onChange={handleSelectAllInvoices} 
              checked={savedInvoices.length > 0 && selectedInvoiceIds.length === savedInvoices.length} 
            />
            <span>فاکتورها و پیش‌فاکتورهای اخیر</span>
          </div>
          {selectedInvoiceIds.length > 0 && (
            <button 
              onClick={handleDeleteSelectedInvoices} 
              style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
              حذف موارد انتخاب‌شده ({selectedInvoiceIds.length})
            </button>
          )}
        </div>
        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {savedInvoices.length === 0 ? (
            <div style={{ padding: '15px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
              فاکتور یا پیش‌فاکتور ذخیره‌شده‌ای وجود ندارد.
            </div>
          ) : (
            savedInvoices.map(inv => (
              <div 
                key={`${inv.type}-${inv.id}`} 
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', fontSize: '12px', borderBottom: '1px solid #f1f5f9' }}>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedInvoiceIds.includes(inv.id)} 
                    onChange={(e) => handleToggleSelectInvoice(e, inv.id)} 
                  />
                  <span 
                    style={{ cursor: 'pointer', color: '#1e293b', fontWeight: '500' }} 
                    onClick={() => handleLoadInvoice(inv)}>
                    {inv.customer_name} 
                    {inv.type === 'official' ? (
                      <span style={{ color: '#16a34a', marginRight: '6px', fontWeight: 'bold' }}>[رسمی]</span>
                    ) : (
                      <span style={{ color: '#0284c7', marginRight: '6px', fontWeight: 'bold' }}>[پیش‌فاکتور]</span>
                    )}
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: '11px', marginRight: '4px' }}>
                    ({inv.created_at ? new Date(inv.created_at).toLocaleDateString('fa-IR') : '—'})
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                    <button 
                      style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }} 
                      onClick={(e) => handleDeleteInvoice(e, inv)}>
                      حذف
                    </button>
                    {inv.type !== 'official' && (
                      <button 
                        style={{ backgroundColor: '#0ea5e9', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }} 
                        onClick={(e) => handleConvertToInvoice(e, inv)}>
                        صدور رسمی
                      </button>
                    )}
                </div>

              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
