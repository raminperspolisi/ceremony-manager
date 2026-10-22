import React, { useState, useEffect } from 'react';
import { readTable } from '../offlineSync';
import { formatDisplay, formatPersianDigits } from '../styles';

export default function FinancialReportPanel() {
  const [invoices, setInvoices] = useState([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [totalRentProfit, setTotalRentProfit] = useState(0);
  const [totalSaleProfit, setTotalSaleProfit] = useState(0);

  useEffect(() => {
    fetchOfficialInvoicesReport();
  }, []);

  async function fetchOfficialInvoicesReport() {
    // خواندن داده‌ها فقط از فاکتورهای رسمی (جدول invoices)
    const { data, error } = await readTable('invoices', { orderBy: 'created_at', ascending: false });
    
    if (error) {
      console.error("خطا در دریافت فاکتورهای رسمی:", error.message);
      return;
    }

    if (data) {
      setInvoices(data);
      
      let revenueSum = 0;
      let rentProfitSum = 0;
      let saleProfitSum = 0;

      data.forEach(inv => {
        revenueSum += Number(inv.total_price || 0);
        
        const items = inv.items_data || [];
        items.forEach(item => {
          const qty = Number(item.qty || item.requestedQuantity || 1);
          const price = Number(item.p1 || item.price || 0);
          const baseCost = Number(item.base_cost || 0); // قیمت خرید از موجودی
          const itemType = item.type || 'sale'; // نوع کالا: فروش ('sale') یا اجاره ('rent')

          if (itemType === 'rent') {
            // اجاره: کل مبلغ دریافتی به عنوان سود خالص محسوب می‌شود
            rentProfitSum += price * qty;
          } else {
            // فروش: (قیمت فروش - قیمت خرید) * تعداد
            const profitPerItem = price - baseCost;
            saleProfitSum += (profitPerItem > 0 ? profitPerItem : 0) * qty;
          }
        });
      });

      setTotalRevenue(revenueSum);
      setTotalRentProfit(rentProfitSum);
      setTotalSaleProfit(saleProfitSum);
      setTotalProfit(rentProfitSum + saleProfitSum);
    }
  }

  return (
    <div style={{ background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', direction: 'rtl' }}>
      <h3 style={{ margin: '0 0 15px 0', color: '#1e293b', fontSize: '15px' }}>گزارش مالی فاکتورهای رسمی (تشریفات)</h3>
      
      {/* کارت‌های خلاصه آماری */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
          <div style={{ fontSize: '11px', color: '#64748b' }}>مجموع کل درآمد فاکتورهای رسمی</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0369a1', marginTop: '5px' }}>
            {formatDisplay(totalRevenue)} <span style={{ fontSize: '11px' }}>تومان</span>
          </div>
        </div>

        <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: '11px', color: '#166534' }}>سود اقلام اجاره‌ای (کل درآمد اجاره)</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#15803d', marginTop: '5px' }}>
            {formatDisplay(totalRentProfit)} <span style={{ fontSize: '11px' }}>تومان</span>
          </div>
        </div>

        <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
          <div style={{ fontSize: '11px', color: '#1e40af' }}>سود اقلام فروشی (فروش - خرید)</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1d4ed8', marginTop: '5px' }}>
            {formatDisplay(totalSaleProfit)} <span style={{ fontSize: '11px' }}>تومان</span>
          </div>
        </div>

        <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '6px', border: '1px solid #fecaca' }}>
          <div style={{ fontSize: '11px', color: '#991b1b' }}>مجموع سود خالص کل مراسم‌ها</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#dc2626', marginTop: '5px' }}>
            {formatDisplay(totalProfit)} <span style={{ fontSize: '11px' }}>تومان</span>
          </div>
        </div>
      </div>

      {/* جدول فاکتورهای رسمی تاثیرگذار در گزارش */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '10px' }}>ردیف</th>
              <th style={{ padding: '10px' }}>نام مشتری</th>
              <th style={{ padding: '10px' }}>تاریخ سفارش</th>
              <th style={{ padding: '10px' }}>تاریخ مراسم</th>
              <th style={{ padding: '10px' }}>مبلغ کل (تومان)</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>هیچ فاکتور رسمی برای گزارش موجود نیست.</td>
              </tr>
            ) : (
              invoices.map((inv, idx) => (
                <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px' }}>{formatDisplay(idx + 1)}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold' }}>{inv.customer_name}</td>
                  <td style={{ padding: '10px' }}>{inv.order_date ? formatPersianDigits(inv.order_date) : 'ثبت نشده'}</td>
                  <td style={{ padding: '10px' }}>{inv.ceremony_date ? formatPersianDigits(inv.ceremony_date) : 'ثبت نشده'}</td>
                  <td style={{ padding: '10px', color: '#0369a1' }}>{formatDisplay(inv.total_price || 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
