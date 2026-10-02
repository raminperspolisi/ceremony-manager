// src/components/QuotationPanel.jsx
import React, { useState, useEffect } from 'react';
import { styles, formatDisplay } from "../styles";
import { supabase } from '../supabaseClient';

export default function QuotationPanel({ selectedItems, setSelectedItems }) {
  const items = selectedItems || [];
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // این متغیر برای کنترل نمایش محتوا استفاده می‌شود
  const [showBuyingPrice, setShowBuyingPrice] = useState(false); 
  
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

  async function fetchInvoices() {
    const { data } = await supabase.from('quotations').select('*').order('created_at', { ascending: false });
    if (data) setSavedInvoices(data);
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

  const handleQuantityChange = (itemId, value) => {
    setSelectedItems(items.map(item => item.id === itemId ? { ...item, requestedQuantity: value } : item));
  };

  const handleRemoveItem = (itemId) => {
    setSelectedItems(items.filter(item => item.id !== itemId));
  };

  const handleLoadInvoice = (inv) => {
    const restoredItems = inv.items_json.map((item, index) => ({
      id: index,
      title: item.title,
      requestedQuantity: item.qty,
      price_level1: item.p1,
      price_level2: item.p2,
      price_level3: item.p3,
      base_cost: item.cost || 0
    }));
    setSelectedItems(restoredItems);
    setSearchTerm(inv.customer_name);
    alert("فاکتور بارگذاری شد.");
  };

  const handleDeleteInvoice = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("آیا مطمئن هستید که می‌خواهید این پیش‌فاکتور حذف شود؟")) return;
    const { error } = await supabase.from("quotations").delete().eq("id", id);
    if (error) { alert("خطا در حذف: " + error.message); } else { fetchInvoices(); }
  };

  return (
    <div style={{ ...styles.card, direction: "rtl" }}>
      <h3>پیش‌فاکتور جدید</h3>
      
      {/* ... بخش‌های دیگر کد ثابت بماند ... */}

      <button onClick={() => setShowBuyingPrice(!showBuyingPrice)} style={{ ...styles.button, backgroundColor: '#666', marginBottom: '10px' }}>
        {showBuyingPrice ? "مخفی کردن قیمت خرید" : "نمایش قیمت خرید"}
      </button>

      <table style={{ width: "100%", marginTop: "10px", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>نام کالا</th>
            <th>تعداد</th>
            <th>درجه یک</th>
            <th>درجه دو</th>
            <th>درجه سه</th>
            <th>قیمت خرید</th> {/* ستون همیشه در DOM هست و دیگر نمی‌پرد */}
            <th>حذف</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.title}</td>
              <td><input type="number" value={item.requestedQuantity ?? ""} onChange={(e) => handleQuantityChange(item.id, e.target.value)} style={{ width: "50px" }} /></td>
              <td>{formatDisplay(item.price_level1)}</td>
              <td>{formatDisplay(item.price_level2)}</td>
              <td>{formatDisplay(item.price_level3)}</td>
              {/* تغییر اصلی اینجا است: */}
              <td>{showBuyingPrice ? formatDisplay(item.base_cost) : "***"}</td>
              <td><button onClick={() => handleRemoveItem(item.id)} style={{ color: "red", background: "none", border: "none", cursor: "pointer" }}>حذف</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ... ادامه کد مانند قبل ... */}
      <button onClick={handleSaveAndPrint} disabled={isSaving} style={{ ...styles.button, marginTop: '20px' }}>
        {isSaving ? "در حال ذخیره..." : "💾 ذخیره و چاپ پیش‌فاکتور"}
      </button>

      {/* ... بخش فاکتورهای اخیر ... */}
    </div>
  );
}
