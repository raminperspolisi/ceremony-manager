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
    return <div className="p-6 text-center text-gray-600" dir="rtl">در حال بارگذاری اطلاعات هوش تجاری...</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen text-right" dir="rtl" style={{ fontFamily: 'IranSans, sans-serif' }}>
      <h2 className="text-2xl font-bold mb-6 text-gray-800">تحلیل و هوش تجاری مالی</h2>

      {/* کارت‌های آماری بالا */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-5 rounded-xl shadow border border-gray-200">
          <p className="text-sm text-gray-500 mb-1">کل درآمد مجموعه</p>
          <h3 className="text-2xl font-bold text-indigo-600">
            {stats.totalRevenue.toLocaleString()} <span className="text-sm font-normal">تومان</span>
          </h3>
        </div>
        <div className="bg-white p-5 rounded-xl shadow border border-gray-200">
          <p className="text-sm text-gray-500 mb-1">سود خالص تخمینی</p>
          <h3 className="text-2xl font-bold text-green-600">
            {stats.totalProfit.toLocaleString()} <span className="text-sm font-normal">تومان</span>
          </h3>
        </div>
        <div className="bg-white p-5 rounded-xl shadow border border-gray-200">
          <p className="text-sm text-gray-500 mb-1">تعداد کل مراسم ثبت شده</p>
          <h3 className="text-2xl font-bold text-purple-600">
            {stats.totalCeremonies} <span className="text-sm font-normal">مراسم</span>
          </h3>
        </div>
      </div>

      {/* بخش اقلام و خدمات پربازده */}
      <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
        <h3 className="text-lg font-semibold mb-4 text-gray-700">پرفروش‌ترین و پربازده‌ترین اقلام / خدمات</h3>
        {topItems.length === 0 ? (
          <p className="text-gray-500 text-sm">داده‌ای برای اقلام فاکتور ثبت نشده است.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-gray-100 text-gray-600 text-sm">
                  <th className="p-3 border">نام خدمت / کالا</th>
                  <th className="p-3 border">تعداد دفعات استفاده / اجاره</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 text-sm">
                    <td className="p-3 border font-medium text-gray-800">{item.name}</td>
                    <td className="p-3 border text-indigo-600 font-bold">{item.qty} بار</td>
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
