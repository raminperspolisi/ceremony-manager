import React, { useState, useEffect } from 'react';
// به جای قبلی
import { styles, formatDisplay } from '../styles'; // حذف .jsx و اضافه کردن styles به ایمپورت
import { supabase } from '../supabaseClient';
export default function QuotationPanel({ selectedItems, setSelectedItems }) {
  const items = selectedItems || [];
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showBuyingPrice, setShowBuyingPrice] = useState(false);
  
  // States برای افزودن مشتری جدید
  const [showAddCustomerForm, setShowAddCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  const [quotationDate, setQuotationDate] = useState(new Date().toLocaleDateString('fa-IR'));
  const [savedInvoices, setSavedInvoices] = useState([]);

  useEffect(() => {
    fetchCustomers();
    fetchInvoices();
  }, []);

  async function fetchCustomers() {
    const { data } = await supabase.from('customers').select('*').order('Full name', { ascending: true });
    if (data) setCustomers(data);
  }

  // تابع ذخیره مشتری جدید
  async function handleAddNewCustomer() {
    if (!newCustomerName) { alert("نام مشتری الزامی است."); return; }
    const { error } = await supabase.from('customers').insert([{ "Full name": newCustomerName, "phone": newCustomerPhone }]);
    if (error) { alert("خطا در افزودن مشتری: " + error.message); } 
    else {
      alert("مشتری جدید اضافه شد.");
      setNewCustomerName('');
      setNewCustomerPhone('');
      setShowAddCustomerForm(false);
      fetchCustomers();
    }
  }

  async function fetchInvoices() {
    const { data: quotations } = await supabase.from('quotations').select('*').order('created_at', { ascending: false });
    const { data: officialInvoices } = await supabase.from('invoices').select('*').order('created_at', { ascending: false });
    
    const combined = [
      ...(quotations || []).map(item => ({ ...item, type: 'quotation' })),
      ...(officialInvoices || []).map(item => ({ ...item, type: 'official' }))
    ];
    combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setSavedInvoices(combined);
  }

  const getQuantity = (val) => {
    const quantity = Number(val);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  };

  const total1 = items.reduce((sum, item) => sum + (Number(item.price_level1) || 0) * getQuantity(item.requestedQuantity), 0);
  const total2 = items.reduce((sum, item) => sum + (Number(item.price_level2) || 0) * getQuantity(item.requestedQuantity), 0);
  const total3 = items.reduce((sum, item) => sum + (Number(item.price_level3) || 0) * getQuantity(item.requestedQuantity), 0);

  const handleSaveAndPrint = async () => {
    if (!selectedCustomer) { alert("لطفاً ابتدا مشتری را انتخاب کنید."); return; }
    if (items.length === 0) { alert("لیست کالاها خالی است."); return; }

    setIsSaving(true);
    try {
      const { error } = await supabase.from("quotations").insert([
        { 
          customer_name: selectedCustomer["Full name"], 
          items_json: items.map(i => ({
            title: i.title,
            qty: getQuantity(i.requestedQuantity),
            p1: i.price_level1,
            p2: i.price_level2,
            p3: i.price_level3,
            cost: i.base_cost || 0
          })), 
          total_price: total1 
        }
      ]);

      if (error) throw error;
      alert("پیش‌فاکتور ذخیره شد.");
      fetchInvoices();

      const printWindow = window.open("", "_blank");
      printWindow.document.write(`
        <html dir="rtl">
          <head>
            <style>
              @font-face { font-family: 'IRANSans'; src: url('https://cdn.fontcdn.ir/Font/Persian/IRANSans/IRANSans.woff2') format('woff2'); }
              body { font-family: 'IRANSans', Tahoma, sans-serif; padding: 40px; direction: rtl; }
              .header-title { text-align: center; font-weight: bold; font-size: 24px; margin-bottom: 20px; }
              .header-info { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 16px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #000; padding: 12px; text-align: center; }
              th { background-color: #f2f2f2; }
              .totals { margin-top: 30px; font-weight: bold; font-size: 18px; }
              .footer-text { margin-top: 50px; font-size: 14px; text-align: center; color: #333; border-top: 1px solid #ccc; padding-top: 10px; }
            </style>
          </head>
          <body>
            <div class="header-title">پیش‌فاکتور گالری آژو</div>
            <div class="header-info">
                <div><strong>برای آقای:</strong> ${selectedCustomer["Full name"]}</div>
                <div><strong>تاریخ:</strong> ${quotationDate}</div>
            </div>
            <table>
              <thead><tr><th>نام کالا</th><th>تعداد</th><th>درجه یک</th><th>درجه دو</th><th>درجه سه</th></tr></thead>
              <tbody>
                ${items.map(item => `
                  <tr>
                    <td>${item.title}</td>
                    <td>${getQuantity(item.requestedQuantity)}</td>
                    <td>${Number(item.price_level1).toLocaleString()}</td>
                    <td>${Number(item.price_level2).toLocaleString()}</td>
                    <td>${Number(item.price_level3).toLocaleString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="totals">
              <p>مجموع کل (درجه ۱): ${total1.toLocaleString()} تومان</p>
              <p>مجموع کل (درجه ۲): ${total2.toLocaleString()} تومان</p>
              <p>مجموع کل (درجه ۳): ${total3.toLocaleString()} تومان</p>
            </div>
            <p class="footer-text">این قیمت جهت اطلاع به مشتری می‌باشد و در قبال آن هیچ‌گونه هزینه‌ای پرداخت نشده.</p>
            <script>window.onload = function() { window.print(); window.close(); };</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) { alert("خطا: " + err.message); } finally { setIsSaving(false); }
  };

  const handleConvertToInvoice = async (e, inv) => {
    e.stopPropagation();
    if (inv.type === 'official') { alert("این فاکتور قبلاً رسمی شده است."); return; }
    if (!window.confirm(`تبدیل پیش‌فاکتور ${inv.customer_name} به فاکتور رسمی؟`)) return;
    const { error } = await supabase.from("invoices").insert([{ customer_name: inv.customer_name, total_price: inv.total_price, items_data: inv.items_json, is_official: true }]);
    if (error) alert("خطا در صدور فاکتور: " + error.message); else { alert("فاکتور با موفقیت صادر شد."); fetchInvoices(); }
  };

  const handleQuantityChange = (itemId, value) => {
    setSelectedItems(items.map(item => item.id === itemId ? { ...item, requestedQuantity: value } : item));
  };

  const handleRemoveItem = (itemId) => {
    setSelectedItems(items.filter(item => item.id !== itemId));
  };

  const handleLoadInvoice = (inv) => {
    const itemsData = inv.items_json || inv.items_data;
    const restoredItems = itemsData.map((item, index) => ({
      id: index, title: item.title, requestedQuantity: item.qty, price_level1: item.p1, price_level2: item.p2, price_level3: item.p3, base_cost: item.cost || 0
    }));
    setSelectedItems(restoredItems);
    setSearchTerm(inv.customer_name);
    alert("فاکتور بارگذاری شد.");
  };

  const handleDeleteInvoice = async (e, inv) => {
    e.stopPropagation();
    if (!window.confirm("آیا مطمئن هستید؟")) return;
    const table = inv.type === 'official' ? 'invoices' : 'quotations';
    await supabase.from(table).delete().eq("id", inv.id);
    fetchInvoices();
  };

  return (
    <div style={styles.classicWindow}>
      <div style={{ background: '#000080', color: '#fff', padding: '3px', fontWeight: 'bold' }}>پیش‌فاکتور جدید</div>
      
      <div style={{ padding: '5px', display: 'flex', gap: '10px', fontSize: '11px', borderBottom: '1px solid #808080' }}>
          <span>۱: {total1.toLocaleString()}</span>
          <span>۲: {total2.toLocaleString()}</span>
          <span>۳: {total3.toLocaleString()}</span>
      </div>

      <div style={{ padding: '5px' }}>
          <div style={{ marginBottom: '2px' }}>تاریخ: <input style={styles.classicInput} value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} /></div>
          <div style={{ marginBottom: '2px', display: 'flex', gap: '5px' }}>
              <input style={styles.classicInput} placeholder="جستجوی مشتری..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setIsSearching(true); }} />
              <button style={styles.smallButton} onClick={() => setShowAddCustomerForm(!showAddCustomerForm)}>+</button>
          </div>
          
          {/* فرم افزودن مشتری جدید */}
          {showAddCustomerForm && (
            <div style={{ border: '1px solid #808080', padding: '5px', marginBottom: '5px', background: '#e0e0e0' }}>
                <input style={{...styles.classicInput, marginBottom: '2px', display: 'block'}} placeholder="نام و نام خانوادگی" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
                <input style={{...styles.classicInput, marginBottom: '2px', display: 'block'}} placeholder="تلفن" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
                <button style={{...styles.classicButton, width: '100%'}} onClick={handleAddNewCustomer}>ذخیره مشتری جدید</button>
            </div>
          )}

          {isSearching && searchTerm && (
            <div style={{ position: 'relative', width: '100%', backgroundColor: '#fff', border: '1px solid #808080', zIndex: 10 }}>
                {customers.filter(c => c["Full name"]?.toLowerCase().includes(searchTerm.toLowerCase())).map((c) => (
                <div key={c.id} style={{ padding: '2px', cursor: 'pointer', borderBottom: '1px solid #ccc' }} onClick={() => { setSelectedCustomer(c); setSearchTerm(c["Full name"]); setIsSearching(false); }}>{c["Full name"]}</div>
                ))}
            </div>
          )}
      </div>

      <button onClick={() => setShowBuyingPrice(!showBuyingPrice)} style={{ ...styles.classicButton, width: '100%', marginBottom: '5px' }}>
        {showBuyingPrice ? "مخفی کردن قیمت خرید" : "نمایش قیمت خرید"}
      </button>

      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "auto" }} />
          <col style={{ width: "50px" }} />
          <col style={{ width: "60px" }} />
          <col style={{ width: "60px" }} />
          <col style={{ width: "60px" }} />
          {showBuyingPrice && <col style={{ width: "60px" }} />}
          <col style={{ width: "30px" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={styles.gridHeader}>نام کالا</th>
            <th style={styles.gridHeader}>تعداد</th>
            <th style={styles.gridHeader}>۱</th>
            <th style={styles.gridHeader}>۲</th>
            <th style={styles.gridHeader}>۳</th>
            {showBuyingPrice && <th style={styles.gridHeader}>خرید</th>}
            <th style={styles.gridHeader}>-</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td style={{...styles.gridCell, textAlign: 'right', paddingRight: '4px'}}>{item.title}</td>
              <td style={styles.gridCell}><input type="number" value={item.requestedQuantity ?? ""} onChange={(e) => handleQuantityChange(item.id, e.target.value)} style={styles.classicInput} /></td>
              <td style={styles.gridCell}>{formatDisplay(item.price_level1)}</td>
              <td style={styles.gridCell}>{formatDisplay(item.price_level2)}</td>
              <td style={styles.gridCell}>{formatDisplay(item.price_level3)}</td>
              {showBuyingPrice && <td style={styles.gridCell}>{formatDisplay(item.base_cost)}</td>}
              <td style={styles.gridCell}><button style={styles.smallButton} onClick={() => handleRemoveItem(item.id)}>X</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <button onClick={handleSaveAndPrint} disabled={isSaving} style={{ ...styles.classicButton, width: '100%', marginTop: '5px', padding: '5px' }}>
        {isSaving ? "در حال ذخیره..." : "💾 چاپ و ذخیره"}
      </button>

      <div style={{ marginTop: "10px", border: "1px solid #808080" }}>
        <div style={{ background: '#808080', color: '#fff', padding: '2px', fontSize: '11px' }}>فاکتورهای اخیر:</div>
        {savedInvoices.map(inv => (
          <div key={inv.id} style={{ ...styles.gridCell, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px' }}>
            <span style={{ cursor: 'pointer' }} onClick={() => handleLoadInvoice(inv)}>
              {inv.customer_name} - {new Date(inv.created_at).toLocaleDateString('fa-IR')}
              {inv.type === 'official' && <span style={{ color: 'green', fontSize: '10px' }}>(رسمی)</span>}
            </span>
            <div style={{ display: 'flex', gap: '2px' }}>
                {inv.type !== 'official' && (
                    <button style={styles.smallButton} onClick={(e) => handleConvertToInvoice(e, inv)}>صدور</button>
                )}
                <button style={styles.smallButton} onClick={(e) => handleDeleteInvoice(e, inv)}>حذف</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
