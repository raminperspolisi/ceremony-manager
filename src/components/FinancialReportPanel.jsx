import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function FinancialReportPanel() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // استیت‌های موقت برای افزودن آیتم مالی جدید
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemType, setNewItemType] = useState('rent');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(0);

  // استیت جدید برای افزودن کار به چک‌لیست مراسم
  const [newChecklistTask, setNewChecklistTask] = useState('');

  useEffect(() => {
    fetchFinancialData();
  }, []);

  async function fetchFinancialData() {
    setLoading(true);
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: true });
      
    if (data) {
      setInvoices(data);
    }
    if (error) {
      console.error("Error fetching financial invoices:", error.message);
    }
    setLoading(false);
  }

  // تابع برای افزودن آیتم مالی جدید به فاکتور
  async function handleAddItem(e) {
    e.preventDefault();
    if (!newItemTitle.trim()) return;

    const currentItems = selectedInvoice.items_data || selectedInvoice.items_json || selectedInvoice.items || [];
    const updatedItems = [
      ...currentItems,
      {
        title: newItemTitle.trim(),
        item_type: newItemType,
        qty: Number(newItemQty) || 1,
        unit_price: Number(newItemPrice) || 0
      }
    ];

    let newTotal = 0;
    updatedItems.forEach(it => {
      const q = Number(it.qty || 1);
      const p = Number(it.unit_price || it.p1 || it.price || 0);
      newTotal += p * q;
    });

    const { error } = await supabase
      .from('invoices')
      .update({ 
        items_data: updatedItems,
        total_price: newTotal 
      })
      .eq('id', selectedInvoice.id);

    if (error) {
      alert("خطا در ذخیره‌سازی آیتم جدید: " + error.message);
      return;
    }

    const updatedInvoiceObj = {
      ...selectedInvoice,
      items_data: updatedItems,
      total_price: newTotal
    };

    setSelectedInvoice(updatedInvoiceObj);
    setInvoices(invoices.map(inv => inv.id === selectedInvoice.id ? updatedInvoiceObj : inv));

    setNewItemTitle('');
    setNewItemQty(1);
    setNewItemPrice(0);
  }

  // تابع حذف آیتم مالی از لیست
  async function handleDeleteItem(indexToRemove) {
    const currentItems = selectedInvoice.items_data || selectedInvoice.items_json || selectedInvoice.items || [];
    const updatedItems = currentItems.filter((_, idx) => idx !== indexToRemove);

    let newTotal = 0;
    updatedItems.forEach(it => {
      const q = Number(it.qty || 1);
      const p = Number(it.unit_price || it.p1 || it.price || 0);
      newTotal += p * q;
    });

    const { error } = await supabase
      .from('invoices')
      .update({ 
        items_data: updatedItems,
        total_price: newTotal 
      })
      .eq('id', selectedInvoice.id);

    if (error) {
      alert("خطا در حذف آیتم: " + error.message);
      return;
    }

    const updatedInvoiceObj = {
      ...selectedInvoice,
      items_data: updatedItems,
      total_price: newTotal
    };

    setSelectedInvoice(updatedInvoiceObj);
    setInvoices(invoices.map(inv => inv.id === selectedInvoice.id ? updatedInvoiceObj : inv));
  }

  // تابع جدید برای افزودن کار به چک‌لیست مراسم
  async function handleAddChecklistTask(e) {
    e.preventDefault();
    if (!newChecklistTask.trim()) return;

    const currentChecklist = selectedInvoice.checklist || [
      { text: "هماهنگی نهایی با تالار و باغ", done: false },
      { text: "بررسی سیستم صوتی و دی‌جی", done: false },
      { text: "کنترل گل‌آرایی ورودی و جایگاه", done: false }
    ];

    const updatedChecklist = [
      ...currentChecklist,
      { text: newChecklistTask.trim(), done: false }
    ];

    const { error } = await supabase
      .from('invoices')
      .update({ checklist: updatedChecklist })
      .eq('id', selectedInvoice.id);

    if (error) {
      alert("خطا در افزودن کار به چک‌لیست: " + error.message);
      return;
    }

    const updatedInvoiceObj = {
      ...selectedInvoice,
      checklist: updatedChecklist
    };

    setSelectedInvoice(updatedInvoiceObj);
    setInvoices(invoices.map(inv => inv.id === selectedInvoice.id ? updatedInvoiceObj : inv));
    setNewChecklistTask('');
  }

  // تابع تغییر وضعیت تیک کار در چک‌لیست
  async function handleToggleChecklistTask(indexToToggle) {
    const currentChecklist = selectedInvoice.checklist || [];
    const updatedChecklist = currentChecklist.map((task, idx) => {
      if (idx === indexToToggle) {
        return { ...task, done: !task.done };
      }
      return task;
    });

    const { error } = await supabase
      .from('invoices')
      .update({ checklist: updatedChecklist })
      .eq('id', selectedInvoice.id);

    if (error) {
      alert("خطا در به‌روزرسانی چک‌لیست: " + error.message);
      return;
    }

    const updatedInvoiceObj = {
      ...selectedInvoice,
      checklist: updatedChecklist
    };

    setSelectedInvoice(updatedInvoiceObj);
    setInvoices(invoices.map(inv => inv.id === selectedInvoice.id ? updatedInvoiceObj : inv));
  }

  let totalRevenue = 0;
  let totalSaleProfit = 0;
  let totalRentRevenue = 0;

  invoices.forEach(inv => {
    const invTotal = Number(inv.total_price || inv.total_amount || 0);
    totalRevenue += invTotal;

    const items = inv.items_data || inv.items_json || inv.items || [];
    if (Array.isArray(items) && items.length > 0) {
      let invRent = 0;
      let invSale = 0;

      items.forEach(item => {
        const qty = Number(item.qty || item.requestedQuantity || 1);
        const price = Number(item.unit_price || item.p1 || item.price || 0);
        const itemType = String(item.item_type || item.type || '').trim().toLowerCase();
        const itemName = String(item.title || item.name || '').trim().toLowerCase();
        
        const itemTotal = price * qty;
        const isSale = itemType === 'sale' || itemType === 'فروش' || itemType === 'فروشی' || itemName.includes('فروش');

        if (isSale) {
          invSale += itemTotal > 0 ? itemTotal : price;
        } else {
          invRent += itemTotal > 0 ? itemTotal : price;
        }
      });

      totalRentRevenue += invRent;
      totalSaleProfit += invSale;
    } else {
      totalRentRevenue += invTotal;
    }
  });

  const totalNetProfit = totalSaleProfit + totalRentRevenue;

  return (
    <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', fontFamily: 'Tahoma, sans-serif', direction: 'rtl' }}>
      <h3 style={{ margin: '0 0 15px 0', color: '#1e293b', fontSize: '16px' }}>گزارش مالی و فاکتورهای رسمی تشریفات</h3>

      {/* کارت‌های آماری */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '25px' }}>
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '15px', borderRadius: '6px' }}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>مجموع کل درآمد فاکتورهای رسمی</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0369a1' }}>{totalRevenue.toLocaleString()} تومان</div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '15px', borderRadius: '6px' }}>
          <div style={{ fontSize: '12px', color: '#166534', marginBottom: '8px' }}>درآمد اقلام اجاره‌ای</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#15803d' }}>{totalRentRevenue.toLocaleString()} تومان</div>
        </div>

        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '15px', borderRadius: '6px' }}>
          <div style={{ fontSize: '12px', color: '#1e40af', marginBottom: '8px' }}>درآمد اقلام فروشی</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1d4ed8' }}>{totalSaleProfit.toLocaleString()} تومان</div>
        </div>

        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '15px', borderRadius: '6px' }}>
          <div style={{ fontSize: '12px', color: '#991b1b', marginBottom: '8px' }}>مجموع سود خالص کل</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc2626' }}>{totalNetProfit.toLocaleString()} تومان</div>
        </div>
      </div>

      {/* جدول لیست فاکتورها */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>💡 لیست فاکتورهایی که از بخش پیش‌فاکتور به صورت رسمی صادر شده‌اند:</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '10px' }}>شماره فاکتور</th>
              <th style={{ padding: '10px' }}>نام مشتری</th>
              <th style={{ padding: '10px' }}>تاریخ ثبت رسمی</th>
              <th style={{ padding: '10px' }}>مبلغ کل (تومان)</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>در حال بارگذاری اطلاعات...</td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>هیچ فاکتور رسمی تاکنون صادر نشده است.</td>
              </tr>
            ) : (
              invoices.map((inv, idx) => {
                const invoiceNumber = 100 + idx;
                return (
                  <tr 
                    key={inv.id || idx} 
                    style={{ borderBottom: '1px solid #f1f5f9', background: selectedInvoice?.id === inv.id ? '#e0f2fe' : 'transparent' }}
                  >
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#334155' }}>#{invoiceNumber}</td>
                    <td style={{ padding: '10px' }}>
                      <span 
                        onClick={() => setSelectedInvoice({ ...inv, invoiceNumber })}
                        style={{ fontWeight: 'bold', color: '#0284c7', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {inv.customer_name || 'مشتری آزاد'}
                      </span>
                    </td>
                    <td style={{ padding: '10px' }}>{new Date(inv.created_at).toLocaleDateString('fa-IR')}</td>
                    <td style={{ padding: '10px', color: '#0369a1', fontWeight: 'bold' }}>{Number(inv.total_price || inv.total_amount || 0).toLocaleString()}</td>
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

      {/* مدال نمایش جزئیات فاکتور، اقلام و چک‌لیست */}
      {selectedInvoice && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '8px', padding: '25px', boxShadow: '0 20px 25px -5px rgb(0 0 15px / 0.1)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '12px', marginBottom: '15px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>جزئیات فاکتور رسمی مراسم و تشریفات</h2>
                <div style={{ fontSize: '12px', color: '#0369a1', fontWeight: 'bold', marginTop: '4px' }}>شماره فاکتور: #{selectedInvoice.invoiceNumber}</div>
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
              <div><strong>شماره تماس:</strong> {selectedInvoice.customer_phone || selectedInvoice.phone || 'ثبت نشده'}</div>
              <div><strong>تاریخ مراسم:</strong> {selectedInvoice.ceremony_date ? new Date(selectedInvoice.ceremony_date).toLocaleDateString('fa-IR') : 'تعیین نشده'}</div>
            </div>

            {/* بخش چک‌لیست کارهای روز مراسم با قابلیت افزودن کار جدید */}
            <div style={{ background: '#fdf4ff', border: '1px solid #f5d0fe', padding: '15px', borderRadius: '6px', marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#86198f' }}>
                📋 چک‌لیست کارهای روز مراسم برای مشتری: {selectedInvoice.customer_name || 'مشتری'} (تاریخ: {new Date(selectedInvoice.created_at).toLocaleDateString('fa-IR')})
              </h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                {(!selectedInvoice.checklist || selectedInvoice.checklist.length === 0) ? (
                  <div style={{ fontSize: '11px', color: '#a21caf' }}>هنوز کاری در چک‌لیست ثبت نشده است. از فرم زیر اضافه کنید.</div>
                ) : (
                  selectedInvoice.checklist.map((task, tidx) => (
                    <label key={tidx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: '#4a044e' }}>
                      <input 
                        type="checkbox" 
                        checked={task.done} 
                        onChange={() => handleToggleChecklistTask(tidx)}
                        style={{ width: '16px', height: '16px', accentColor: '#a21caf', cursor: 'pointer' }}
                      />
                      <span style={{ textDecoration: task.done ? 'line-through' : 'none', opacity: task.done ? 0.6 : 1 }}>
                        {task.text}
                      </span>
                    </label>
                  ))
                )}
              </div>

              {/* فرم افزودن کار جدید به چک‌لیست */}
              <form onSubmit={handleAddChecklistTask} style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  placeholder="افزودن کار جدید به چک‌لیست (مثلاً تست نهایی نورپردازی)..." 
                  value={newChecklistTask}
                  onChange={(e) => setNewChecklistTask(e.target.value)}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid #e879f9', fontSize: '11px', background: '#fff' }}
                  required
                />
                <button 
                  type="submit"
                  style={{ background: '#a21caf', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  ➕ افزودن به چک‌لیست
                </button>
              </form>
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
                        <td style={{ padding: '8px' }}>{i + 1}</td>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{it.title || it.name || 'محصول'}</td>
                        <td style={{ padding: '8px' }}>{it.item_type === 'sale' ? 'فروشی' : 'اجاره‌ای'}</td>
                        <td style={{ padding: '8px' }}>{q}</td>
                        <td style={{ padding: '8px' }}>{p.toLocaleString()}</td>
                        <td style={{ padding: '8px', color: '#0369a1', fontWeight: 'bold' }}>{(p * q).toLocaleString()}</td>
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

            {/* فرم افزودن آیتم مالی جدید */}
            <form onSubmit={handleAddItem} style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '12px', borderRadius: '6px', marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>➕ افزودن قلم یا کالا به این فاکتور:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                <input 
                  type="text" 
                  placeholder="عنوان کالا یا خدمت" 
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11px' }}
                  required
                />
                <select 
                  value={newItemType}
                  onChange={(e) => setNewItemType(e.target.value)}
                  style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11px' }}
                >
                  <option value="rent">اجاره‌ای / خدماتی</option>
                  <option value="sale">فروشی</option>
                </select>
                <input 
                  type="number" 
                  placeholder="تعداد" 
                  value={newItemQty}
                  onChange={(e) => setNewItemQty(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11px' }}
                  min="1"
                />
                <input 
                  type="number" 
                  placeholder="قیمت فی (تومان)" 
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11px' }}
                  min="0"
                />
                <button 
                  type="submit"
                  style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '7px 12px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  افزودن
                </button>
              </div>
            </form>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 15px', borderRadius: '6px' }}>
              <span style={{ fontSize: '13px', color: '#166534', fontWeight: 'bold' }}>مبلغ کل فاکتور:</span>
              <span style={{ fontSize: '16px', color: '#15803d', fontWeight: 'bold' }}>
                {Number(selectedInvoice.total_price || selectedInvoice.total_amount || 0).toLocaleString()} تومان
              </span>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => window.print()}
                style={{ background: '#059669', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
              >
                چاپ فاکتور
              </button>
              <button 
                onClick={() => setSelectedInvoice(null)}
                style={{ background: '#64748b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
              >
                بستن
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
