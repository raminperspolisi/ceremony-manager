import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function AnalyticsPanel() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalProfit: 0,
    totalCeremonies: 0,
  });
  const [topItems, setTopItems] = useState([]);

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  const fetchAnalyticsData = async () => {
    setLoading(true);
    try {
      // دریافت اطلاعات فاکتورها یا مراسم‌ها از دیتابیس Supabase
      const { data: invoices, error: invError } = await supabase.from('invoices').select('*');
      if (invError) throw invError;

      let revenue = 0;
      let profit = 0;
      invoices?.forEach(inv => {
        revenue += Number(inv.total_price || inv.total_cost || 0);
        // فرض بر این است که سود هر فاکتور یا درصد ثابتی محاسبه می‌شود
        profit += Number(inv.total_price || 0) * 0.3; // نمونه تخمین 30 درصد سود
      });

      setStats({
        totalRevenue: revenue,
        totalProfit: profit,
        totalCeremonies: invoices?.length || 0,
      });

      // دریافت اقلام پرفروش از اقلام فاکتورها
      const { data: items, error: itemError } = await supabase.from('invoice_items').select('*');
      if (itemError) throw itemError;

      // گروه‌بندی و شمارش اقلام پرفروش
      const counts = {};
      items?.forEach(i => {
        const name = i.item_name || 'خدمات نامشخص';
        counts[name] = (counts[name] || 0) + Number(i.quantity || 1);
      });

      const sortedItems = Object.entries(counts)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5); // 5 قلم برتر

      setTopItems(sortedItems);

    } catch (err) {
      console.error('خطا در بارگذاری اطلاعات تحلیلی:', err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="analytics-loading" dir="rtl">در حال بارگذاری اطلاعات هوش تجاری...</div>;
  }

  return (
    <div className="analytics-panel" dir="rtl">
      <h2 className="analytics-title">تحلیل و هوش تجاری مالی</h2>

      {/* کارت‌های آماری بالا */}
      <div className="analytics-stats">
        <div className="analytics-stat-card revenue">
          <p>کل درآمد مجموعه</p>
          <h3>
            {stats.totalRevenue.toLocaleString('fa-IR')} <span>تومان</span>
          </h3>
        </div>
        <div className="analytics-stat-card profit">
          <p>سود خالص تخمینی</p>
          <h3>
            {stats.totalProfit.toLocaleString('fa-IR')} <span>تومان</span>
          </h3>
        </div>
        <div className="analytics-stat-card ceremonies">
          <p>تعداد کل مراسم ثبت شده</p>
          <h3>
            {stats.totalCeremonies.toLocaleString('fa-IR')} <span>مراسم</span>
          </h3>
        </div>
      </div>

      {/* بخش اقلام و خدمات پربازده */}
      <div className="analytics-items-card">
        <h3>پرفروش‌ترین و پربازده‌ترین اقلام / خدمات</h3>
        {topItems.length === 0 ? (
          <p className="analytics-empty">داده‌ای برای اقلام فاکتور ثبت نشده است.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>نام خدمت / کالا</th>
                  <th>تعداد دفعات استفاده / اجاره</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((item) => (
                  <tr key={item.name}>
                    <td>{item.name}</td>
                    <td>{Number(item.qty).toLocaleString('fa-IR')} بار</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
