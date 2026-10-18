import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function RemindersPanel() {
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState('');

  useEffect(() => {
    fetchUpcomingCeremonies();
  }, []);

  const fetchUpcomingCeremonies = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUpcomingEvents(data || []);
    } catch (err) {
      console.error('خطا در دریافت اطلاعات مراسم‌ها:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // ارسال یادآوری واتساپ
  const sendWhatsAppReminder = (event) => {
    const phone = event.customer_phone || '';
    const customerName = event.customer_name || 'مشتری گرامی';
    const totalPrice = event.total_price ? Number(event.total_price).toLocaleString() + ' تومان' : '';

    const message = `سلام ${customerName} عزیز،\nیادآوری مراسم شما توسط تشریفات آژو.\nمبلغ کل فاکتور: ${totalPrice}\nلطفاً جهت هماهنگی‌های نهایی و تسویه حساب اقدام فرمایید. با تشکر 🙏`;
    
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '98' + formattedPhone.substring(1);
    }

    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  // ارسال یادآوری تلگرام (باز کردن شماره در تلگرام + کپی متن پیام در کلیپ‌بورد)
  const sendTelegramReminder = (event) => {
    const customerName = event.customer_name || 'مشتری گرامی';
    const phone = event.customer_phone || '';
    const totalPrice = event.total_price ? Number(event.total_price).toLocaleString() + ' تومان' : '';

    const message = `سلام ${customerName} عزیز،\nیادآوری مراسم شما توسط تشریفات آژو.\nمبلغ کل فاکتور: ${totalPrice}\nلطفاً جهت هماهنگی‌های نهایی و تسویه حساب اقدام فرمایید. با تشکر 🙏`;

    // ۱. کپی کردن متن پیام به حافظه موقت (کلیپ‌بورد) برای Ctrl + V
    navigator.clipboard.writeText(message).then(() => {
      setCopySuccess(`متن پیام ${customerName} کپی شد! در تلگرام Ctrl + V بزنید.`);
      setTimeout(() => setCopySuccess(''), 6000);
    });

    // ۲. فرمت کردن شماره برای لینک تلگرام
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+98' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }

    // ۳. باز کردن لینک تلگرام با شماره مورد نظر
    const url = `https://t.me/${formattedPhone}`;
    window.open(url, '_blank');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'IRANSans, Tahoma, sans-serif', direction: 'rtl', background: '#f9fafb', borderRadius: '12px' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '16px', color: '#1f2937' }}>
        🔔 یادآوری‌ها و مراسم‌های پیش‌رو (پیگیری و تسویه)
      </h2>

      {copySuccess && (
        <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem', fontWeight: 'bold' }}>
          ✅ {copySuccess}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#6b7280' }}>در حال بارگذاری اطلاعات...</p>
      ) : upcomingEvents.length === 0 ? (
        <p style={{ color: '#6b7280' }}>هیچ مراسمی ثبت نشده است.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '8px', overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: '#f3f4f6', color: '#374151', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '12px' }}>نام مشتری</th>
                <th style={{ padding: '12px' }}>شماره تماس</th>
                <th style={{ padding: '12px' }}>مبلغ کل</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>ارسال یادآوری</th>
              </tr>
            </thead>
            <tbody>
              {upcomingEvents.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px', fontWeight: '500' }}>{item.customer_name || '---'}</td>
                  <td style={{ padding: '12px', color: '#4b5563' }} dir="ltr">{item.customer_phone || '---'}</td>
                  <td style={{ padding: '12px' }}>{item.total_price ? Number(item.total_price).toLocaleString() + ' تومان' : '---'}</td>
                  <td style={{ padding: '12px', textAlign: 'center', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={() => sendWhatsAppReminder(item)}
                      style={{
                        background: '#22c55e',
                        color: '#fff',
                        border: 'none',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '0.9rem'
                      }}
                    >
                      💬 واتساپ
                    </button>

                    <button
                      type="button"
                      onClick={() => sendTelegramReminder(item)}
                      style={{
                        background: '#0088cc',
                        color: '#fff',
                        border: 'none',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '0.9rem'
                      }}
                    >
                      ✈️ تلگرام (شماره + کپی متن)
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
