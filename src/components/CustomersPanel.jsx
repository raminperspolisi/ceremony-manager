import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function CustomersPanel() {
  // --- حالت‌های مربوط به ثبت مشتری جدید ---
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState(''); 
  const [error, setError] = useState(null);   

  // --- حالت‌های مربوط به لیست و جستجو ---
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState(''); 
  const [isSearching, setIsSearching] = useState(false); 
  const [selectedCustomer, setSelectedCustomer] = useState(null); // مشتری انتخاب شده برای پیش‌فاکتور

  // ۱. گرفتن لیست مشتریان از دیتابیس
  useEffect(() => {
    fetchCustomers();
  }, []);

  async function fetchCustomers() {
    try {
      const { data, error: fetchError } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false }); 

      if (fetchError) throw fetchError;
      if (data) setCustomers(data);
    } catch (err) {
      console.error('خطا در دریافت اطلاعات:', err.message);
      setError('خطا در بارگذاری لیست: ' + err.message);
    }
  }

  // ۲. اضافه کردن مشتری جدید (فرم ثبت)
  async function addCustomer() {
    if (!name || !phone) {
      alert('لطفاً نام و شماره تماس را وارد کنید');
      return;
    }

    try {
      setError(null); 
      const { error: insertError } = await supabase
        .from('customers')
        .insert([
          { 
            "Full name": name, 
            "phone": phone, 
            "address": address 
          }
        ]);

      if (insertError) throw insertError;

      setName('');
      setPhone('');
      setAddress('');
      fetchCustomers(); 
      alert('مشتری با موفقیت ثبت شد');

    } catch (err) {
      console.error('خطا در ثبت مشتری:', err.message);
      setError('خطا در ثبت مشتری: ' + err.message);
    }
  }

  // ۳. فیلتر کردن برای جستجو
  const filteredCustomers = customers.filter(customer =>
    customer["Full name"].toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ۴. انتخاب مشتری برای استفاده در فاکتور
  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setSearchTerm(customer["Full name"]);
    setIsSearching(false);
  };

  // استایل‌ها
  const styles = {
    container: { padding: '20px', direction: 'rtl', fontFamily: 'Tahoma, Arial, sans-serif', maxWidth: '800px', margin: '0 auto' },
    sectionTitle: { fontSize: '20px', color: '#2c3e50', marginBottom: '15px', borderBottom: '2px solid #eee', paddingBottom: '5px' },
    form: { display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '400px', marginBottom: '30px', backgroundColor: '#f9f9f9', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' },
    input: { padding: '12px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '14px' },
    button: { padding: '12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' },
    error: { color: '#721c24', backgroundColor: '#f8d7da', padding: '15px', borderRadius: '5px', marginBottom: '20px', border: '1px solid #f5c6cb' },
    list: { listStyle: 'none', padding: 0 },
    listItem: { padding: '15px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    customerInfo: { display: 'flex', flexDirection: 'column' },
    customerName: { fontSize: '18px', fontWeight: 'bold', color: '#333' },
    customerPhone: { fontSize: '14px', color: '#555' },
    customerAddress: { fontSize: '13px', color: '#888', marginTop: '4px' },
    // استایل‌های بخش جستجو
    searchWrapper: { position: 'relative', maxWidth: '400px', marginBottom: '30px' },
    dropdown: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      backgroundColor: 'white',
      border: '1px solid #ccc',
      borderRadius: '0 0 5px 5px',
      maxHeight: '200px',
      overflowY: 'auto',
      zIndex: 1000,
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
    },
    dropdownItem: { padding: '10px', cursor: 'pointer', borderBottom: '1px solid #eee', textAlign: 'right' }
  };

  return (
    <div style={styles.container}>
      <h2 style={{ textAlign: 'center', color: '#2c3e50' }}>مدیریت مشتریان</h2>

      {error && <div style={styles.error}>{error}</div>}

      {/* بخش اول: فرم ثبت مشتری جدید */}
      <h3 style={styles.sectionTitle}>ثبت مشتری جدید</h3>
      <div style={styles.form}>
        <input 
          style={styles.input}
          placeholder="نام و نام خانوادگی" 
          value={name} 
          onChange={e => setName(e.target.value)} 
        />
        <input 
          style={styles.input}
          placeholder="شماره تماس" 
          value={phone} 
          onChange={e => setPhone(e.target.value)} 
        />
        <input 
          style={styles.input}
          placeholder="آدرس (اختیاری)" 
          value={address} 
          onChange={e => setAddress(e.target.value)} 
        />
        <button style={styles.button} onClick={addCustomer}>ثبت مشتری جدید</button>
      </div>

      <hr style={{ margin: '30px 0', opacity: '0.3' }} />

      {/* بخش دوم: جستجو و انتخاب مشتری (برای استفاده در پیش‌فاکتور) */}
      <h3 style={styles.sectionTitle}>جستجو و انتخاب مشتری (برای پیش‌فاکتور)</h3>
      <div style={styles.searchWrapper}>
        <input
          style={styles.input}
          type="text"
          placeholder="نام مشتری را تایپ کنید..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsSearching(true);
          }}
          onFocus={() => setIsSearching(true)}
        />
        
        {isSearching && searchTerm && (
          <div style={styles.dropdown}>
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((c) => (
                <div 
                  key={c.id} 
                  style={styles.dropdownItem} 
                  onClick={() => handleCustomerSelect(c)}
                >
                  <strong>{c["Full name"]}</strong>
                  <div style={{ fontSize: '12px', color: '#666' }}>{c.phone}</div>
                </div>
              ))
            ) : (
              <div style={{ padding: '10px', textAlign: 'center' }}>مشتری یافت نشد</div>
            )}
          </div>
        )}

        {/* نمایش اطلاعات مشتری انتخاب شده */}
        {selectedCustomer && (
          <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '5px', border: '1px solid #c8e6c9' }}>
            <p style={{ margin: 0 }}><strong>مشتری انتخاب شده:</strong> {selectedCustomer["Full name"]}</p>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>📞 {selectedCustomer.phone}</p>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>📍 {selectedCustomer.address || 'بدون آدرس'}</p>
          </div>
        )}
      </div>

      <hr style={{ margin: '30px 0', opacity: '0.3' }} />

      {/* بخش سوم: لیست تمام مشتریان */}
      <h3 style={styles.sectionTitle}>لیست همه مشتریان</h3>
      <ul style={styles.list}>
        {customers.length === 0 && <p style={{ textAlign: 'center', color: '#999' }}>هیچ مشتری‌ای یافت نشد.</p>}
        {customers.map(c => (
          <li key={c.id} style={styles.listItem}>
            <div style={styles.customerInfo}>
              <span style={styles.customerName}>{c["Full name"]}</span>
              <span style={styles.customerPhone}>{c.phone}</span>
              {c.address && <span style={styles.customerAddress}>{c.address}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
