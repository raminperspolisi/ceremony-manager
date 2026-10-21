import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function FinancialReportPanel({ businessName = 'تشریفات آژو', logoUrl = '/azho-logo.png' }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemType, setNewItemType] = useState('rent');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(0);

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

  function handlePrintInvoice() {
    if (!selectedInvoice) return;

    const items = selectedInvoice.items_data || selectedInvoice.items_json || selectedInvoice.items || [];
    const invoiceNumber = selectedInvoice.invoiceNumber || '---';
    const customerName = selectedInvoice.customer_name || 'مشتری محترم';
    const customerPhone = selectedInvoice.customer_phone || selectedInvoice.phone || 'ثبت نشده';
    const ceremonyDate = selectedInvoice.ceremony_date ? new Date(selectedInvoice.ceremony_date).toLocaleDateString('fa-IR') : 'تعیین نشده';
    const registerDate = selectedInvoice.created_at ? new Date(selectedInvoice.created_at).toLocaleDateString('fa-IR') : '---';
    const totalAmount = Number(selectedInvoice.total_price || selectedInvoice.total_amount || 0).toLocaleString();
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
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">${it.title || it.name || 'محصول'}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${typeStr}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${q}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">${p.toLocaleString()}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: bold; color: #0369a1;">${rowTotal.toLocaleString()}</td>
          </tr>
        `;
      });
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("مرورگر شما جلوی باز شدن پنجره چاپ را گرفت. لطفاً اجازه Pop-up را بدهید.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>فاکتور رسمی ${safeBusinessName} - #${invoiceNumber}</title>
        <style>
          body { font-family: Tahoma, sans-serif; direction: rtl; padding: 20px; color: #1e293b; background: #fff; }
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
            <div style="font-size: 12px; color: #0369a1; margin-top: 4px;">شماره فاکتور: #${invoiceNumber}</div>
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

  let totalRevenue = 0;
  let totalSaleProfit = 0;
  let totalRentRevenue = 0;

  const ceremonyStats = {};
  const productPerformance = {};

  invoices.forEach((inv, index) => {
    const invTotal = Number(inv.total_price || inv.total_amount || 0);
    totalRevenue += invTotal;

    const customerName = inv.customer_name || `مشتری #${index + 1}`;
    if (!ceremonyStats[customerName]) {
      ceremonyStats[customerName] = { total: 0, count: 0 };
    }
    ceremonyStats[customerName].total += invTotal;
    ceremonyStats[customerName].count += 1;

    const items = inv.items_data || inv.items_json || inv.items || [];
    if (Array.isArray(items) && items.length > 0) {
      let invRent = 0;
      let invSale = 0;

      items.forEach(item => {
        const qty = Number(item.qty || item.requestedQuantity || 1);
        const price = Number(item.unit_price || item.p1 || item.price || 0);
        const itemType = String(item.item_type || item.type || '').trim().toLowerCase();
        const itemName = String(item.title || item.name || 'محصول ناشناخته').trim();
        
        const itemTotal = price * qty;
        const isSale = itemType === 'sale' || itemType === 'فروش' || itemType === 'فروشی' || itemName.includes('فروش');

        if (isSale) {
          invSale += itemTotal > 0 ? itemTotal : price;
        } else {
          invRent += itemTotal > 0 ? itemTotal : price;
        }

        if (!productPerformance[itemName]) {
          productPerformance[itemName] = { rentalCount: 0, saleCount: 0, rentalRevenue: 0, saleRevenue: 0 };
        }
        if (isSale) {
          productPerformance[itemName].saleCount += qty;
          productPerformance[itemName].saleRevenue += itemTotal;
        } else {
          productPerformance[itemName].rentalCount += qty;
          productPerformance[itemName].rentalRevenue += itemTotal;
        }
      });

      totalRentRevenue += invRent;
      totalSaleProfit += invSale;
    } else {
      totalRentRevenue += invTotal;
    }
  });

  const totalNetProfit = totalSaleProfit + totalRentRevenue;

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
    <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', fontFamily: 'Tahoma, sans-serif', direction: 'rtl' }}>
      <h3 style={{ margin: '0 0 15px 0', color: '#1e293b', fontSize: '16px' }}>گزارش مالی و تحلیل پیشرفته تشریفات</h3>

      <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '15px', borderRadius: '8px', marginBottom: '25px' }}>
        <h4 style={{ margin: '0 0 12px 0', color: '#0f172a', fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
          📊 تحلیل هوشمند و عملکرد مراسم‌ها و محصولات
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#0369a1', marginBottom: '8px' }}>🏆 پرسودترین مراسم‌ها و مشتریان</div>
            {topCeremonies.length === 0 ? (
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>داده‌ای ثبت نشده است.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {topCeremonies.map((cer, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderBottom: '1px dashed #f1f5f9', paddingBottom: '4px' }}>
                    <span style={{ color: '#334155', fontWeight: 'bold' }}>{idx + 1}. {cer.name}</span>
                    <span style={{ color: '#059669', fontWeight: 'bold' }}>{cer.total.toLocaleString()} تومان</span>
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
                      <span>{idx + 1}. {prod.name} (مجموع: {prod.totalCount} بار)</span>
                      <span style={{ color: '#0284c7' }}>{prod.totalRevenue.toLocaleString()} ت</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '10px', marginTop: '3px', background: '#f8fafc', padding: '4px 6px', borderRadius: '4px' }}>
                      <span>تعداد اجاره: <strong style={{ color: '#2563eb' }}>{prod.rentalCount} بار</strong></span>
                      <span>تعداد فروش: <strong style={{ color: '#16a34a' }}>{prod.saleCount} بار</strong></span>
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

      <div style={{ overflowX: 'auto' }}>
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>💡 لیست فاکتورهای صادر شده:</div>
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

            <div style={{ background: '#fdf4ff', border: '1px solid #f5d0fe', padding: '15px', borderRadius: '6px', marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#86198f' }}>
                📋 چک‌لیست کارهای روز مراسم برای مشتری: {selectedInvoice.customer_name || 'مشتری'}
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

              <form onSubmit={handleAddChecklistTask} style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  placeholder="افزودن کار جدید به چک‌لیست..." 
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
                <input 
                  id="invoice-item-quantity"
                  type="number" 
                  min="1" 
                  placeholder="تعداد"
                  value={newItemQty}
                  onChange={(e) => setNewItemQty(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11px', background: '#fff' }}
                />
                </div>
                <div className="accounting-field">
                <label htmlFor="invoice-item-price">قیمت واحد (تومان)</label>
                <input 
                  id="invoice-item-price"
                  type="number" 
                  min="0" 
                  step="1000" 
                  placeholder="مبلغ"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(e.target.value)}
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
        </div>
      )}
    </div>
  );
}