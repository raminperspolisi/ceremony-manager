import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function ReportsPanel() {
  const [report, setReport] = useState({ totalSales: 0, totalProfit: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchFinancialData();
  }, []);

  async function fetchFinancialData() {
    setLoading(true);
    // دریافت تمامی فاکتورها
    const { data: invoices, error } = await supabase.from('invoices').select('*');
    
    if (error) {
      console.error("خطا در خواندن فاکتورها:", error.message);
      setLoading(false);
      return;
    }

    if (invoices) {
      let sales = 0; 
      let profit = 0;
      
      invoices.forEach(inv => {
        // محاسبه مجموع فروش
        sales += Number(inv.total_price) || 0;
        
        // محاسبه سود (با فرض وجود items_data به صورت آرایه)
        if (inv.items_data && Array.isArray(inv.items_data)) {
          inv.items_data.forEach(item => {
            const cost = Number(item.cost) || 0;
            const price = Number(item.price) || 0;
            const qty = Number(item.qty) || 1; // اگر qty نبود، حداقل 1 در نظر می‌گیریم
            profit += (price - cost) * qty;
          });
        }
      });
      setReport({ totalSales: sales, totalProfit: profit });
    }
    setLoading(false);
  }

  // استایل‌های کلاسیک ویندوزی
  const classicBox = {
    border: '2px solid #808080',
    borderTop: '2px solid #fff',
    borderLeft: '2px solid #fff',
    backgroundColor: '#d4d0c8',
    padding: '10px',
    textAlign: 'center',
    marginBottom: '10px'
  };

  return (
    <div style={{ padding: '10px', backgroundColor: '#d4d0c8', height: '100%' }}>
      <div style={{ border: '2px inset #808080', padding: '10px', backgroundColor: '#e0e0e0' }}>
        <h3 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #808080' }}>گزارش مالی کل</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
          <div style={classicBox}>
            <strong style={{ display: 'block', marginBottom: '5px' }}>فروش کل:</strong>
            <span style={{ fontSize: '1.2em', fontWeight: 'bold' }}>{report.totalSales.toLocaleString()}</span>
            <small> تومان</small>
          </div>
          <div style={classicBox}>
            <strong style={{ display: 'block', marginBottom: '5px' }}>سود تخمینی:</strong>
            <span style={{ fontSize: '1.2em', fontWeight: 'bold', color: report.totalProfit >= 0 ? 'green' : 'red' }}>
              {report.totalProfit.toLocaleString()}
            </span>
            <small> تومان</small>
          </div>
        </div>

        <button 
          onClick={fetchFinancialData} 
          disabled={loading}
          style={{ 
            marginTop: '10px', 
            padding: '5px 20px', 
            cursor: 'pointer',
            backgroundColor: '#d4d0c8',
            border: '2px outset #fff',
            borderRight: '2px solid #808080',
            borderBottom: '2px solid #808080'
          }}
        >
          {loading ? 'در حال بارگذاری...' : 'بروزرسانی آمار'}
        </button>
      </div>
    </div>
  );
}
