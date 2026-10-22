import React, { useState, useEffect } from 'react';
import { deleteRows, insertRows, readTable, updateRows } from '../offlineSync';
import { formatDisplay, formatPersianDigits } from '../styles';
import FormattedNumberInput from './FormattedNumberInput';

const CEREMONY_TYPES = ['عروسی', 'عقد', 'نامزدی', 'تولد', 'حنابندان', 'همایش', 'سایر'];

export default function CustomersPanel({ businessName = 'تشریفات آژو' }) {
  // فرم مشتری
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  
  // مدیریت حالت معرف
  const [introducerMode, setIntroducerMode] = useState('list'); // 'list' یا 'manual'
  const [selectedIntroducer, setSelectedIntroducer] = useState('');
  const [manualIntroducer, setManualIntroducer] = useState('');

  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);

  // لیست مشتریان
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // مراسم‌های مشتری انتخاب‌شده
  const [ceremonies, setCeremonies] = useState([]);
  const [editingCeremonyId, setEditingCeremonyId] = useState(null);
  const [cerType, setCerType] = useState(CEREMONY_TYPES[0]);
  const [cerDate, setCerDate] = useState('');
  const [cerGuests, setCerGuests] = useState('');
  const [cerBudget, setCerBudget] = useState('');
  const [cerNotes, setCerNotes] = useState('');

  useEffect(() => { fetchCustomers(); }, []);

  async function fetchCustomers() {
    try {
      const { data, error: fetchError } = await readTable('customers', { orderBy: 'created_at', ascending: false });
      if (fetchError) throw fetchError;
      if (data) setCustomers(data);
    } catch (err) {
      setError('خطا در بارگذاری لیست: ' + err.message);
    }
  }

  async function fetchCeremonies(customerId) {
    try {
      const { data, error: fetchError } = await readTable('ceremonies', {
        filters: [{ column: 'customer_id', operator: 'eq', value: customerId }],
        orderBy: 'created_at',
        ascending: false,
      });
      if (fetchError) throw fetchError;
      setCeremonies(data || []);
    } catch (err) {
      setError('خطا در بارگذاری مراسم‌ها: ' + err.message);
    }
  }

  async function handleSaveCustomer() {
    if (!name || !phone) { alert('لطفاً نام و شماره تماس را وارد کنید'); return; }
    try {
      setError(null);
      const finalReferral = introducerMode === 'list' ? selectedIntroducer : manualIntroducer;

      const customerData = {
        "Full name": name, 
        phone, 
        address,
        referral: finalReferral || null, 
        notes: notes || null
      };

      if (editingId) {
        const { error: e2 } = await updateRows('customers', customerData, [{ column: 'id', operator: 'eq', value: editingId }]);
        if (e2) throw e2;
        alert('اطلاعات مشتری ویرایش شد');
        setEditingId(null);
      } else {
        const { error: e2 } = await insertRows('customers', [customerData]);
        if (e2) throw e2;
        alert('مشتری ثبت شد');
      }
      
      setName(''); setPhone(''); setAddress(''); 
      setSelectedIntroducer(''); setManualIntroducer(''); setNotes('');
      fetchCustomers();
    } catch (err) { setError('خطا: ' + err.message); }
  }

  async function handleDeleteCustomer(id, e) {
    e.stopPropagation();
    if (!window.confirm('این مشتری و مراسم‌هایش حذف شوند؟')) return;
    try {
      const { error: ceremonyError } = await deleteRows('ceremonies', [{ column: 'customer_id', operator: 'eq', value: id }]);
      if (ceremonyError) throw ceremonyError;
      const { error: e2 } = await deleteRows('customers', [{ column: 'id', operator: 'eq', value: id }]);
      if (e2) throw e2;
      if (selectedCustomer?.id === id) { setSelectedCustomer(null); setCeremonies([]); }
      fetchCustomers();
    } catch (err) { alert('خطا در حذف: ' + err.message); }
  }

  function handleStartEdit(customer) {
    setEditingId(customer.id);
    setName(customer["Full name"] || '');
    setPhone(customer.phone || '');
    setAddress(customer.address || '');
    
    const refVal = customer.referral || '';
    const foundInList = customers.some(c => (c["Full name"] || c.name) === refVal);
    if (foundInList) {
      setIntroducerMode('list');
      setSelectedIntroducer(refVal);
      setManualIntroducer('');
    } else {
      setIntroducerMode('manual');
      setSelectedIntroducer('');
      setManualIntroducer(refVal);
    }

    setNotes(customer.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleCancelEdit() {
    setEditingId(null); 
    setName(''); setPhone(''); setAddress(''); 
    setSelectedIntroducer(''); setManualIntroducer(''); setNotes('');
  }

  // ثبت و همگام‌سازی مراسم در جدول ceremonies و events تقویم
  async function handleSaveCeremony() {
    if (!selectedCustomer) { alert('ابتدا یک مشتری را انتخاب کنید'); return; }
    if (!cerDate) { alert('تاریخ مراسم را وارد کنید'); return; }
    try {
      setError(null);
      const cerData = {
        customer_id: selectedCustomer.id,
        ceremony_type: cerType,
        ceremony_date: cerDate,
        guest_count: parseInt(cerGuests) || 0,
        budget: parseInt(cerBudget) || 0,
        notes: cerNotes || null
      };

      // اطلاعات برای جدول events (تقویم)
      const eventData = {
        customer_name: selectedCustomer["Full name"],
        event_type: cerType,
        event_date: cerDate,
        total_cost: parseInt(cerBudget) || 0,
        advance_payment: 0,
        paid_amount: 0,
        status: 'رزرو شده',
        location: selectedCustomer.address || `تالار ${businessName}`
      };

      if (editingCeremonyId) {
        const { error: e2 } = await updateRows('ceremonies', cerData, [{ column: 'id', operator: 'eq', value: editingCeremonyId }]);
        if (e2) throw e2;
      } else {
        // درج در مراسم‌ها
        const { error: e2 } = await insertRows('ceremonies', [cerData]);
        if (e2) throw e2;

        // درج هم‌زمان در جدول events تقویم
        const { error: eventError } = await insertRows('events', [eventData]);
        if (eventError) throw eventError;
      }

      setEditingCeremonyId(null); setCerDate(''); setCerGuests(''); setCerBudget(''); setCerNotes('');
      fetchCeremonies(selectedCustomer.id);
      alert('مراسم با موفقیت ثبت و به تقویم اضافه شد.');
    } catch (err) { setError('خطای مراسم: ' + err.message); }
  }

  function handleStartEditCeremony(c) {
    setEditingCeremonyId(c.id);
    setCerType(c.ceremony_type || CEREMONY_TYPES[0]);
    setCerDate(c.ceremony_date || '');
    setCerGuests(c.guest_count ? String(c.guest_count) : '');
    setCerBudget(c.budget ? String(c.budget) : '');
    setCerNotes(c.notes || '');
  }

  async function handleDeleteCeremony(id) {
    if (!window.confirm('این مراسم حذف شود؟')) return;
    try {
      const { error: e2 } = await deleteRows('ceremonies', [{ column: 'id', operator: 'eq', value: id }]);
      if (e2) throw e2;
      fetchCeremonies(selectedCustomer.id);
    } catch (err) { alert('خطا در حذف مراسم: ' + err.message); }
  }

  const filteredCustomers = customers.filter(c =>
    c["Full name"]?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setSearchTerm(customer["Full name"]);
    setIsSearching(false);
    setEditingCeremonyId(null);
    setCerDate(''); setCerGuests(''); setCerBudget(''); setCerNotes('');
    fetchCeremonies(customer.id);
  };

  const fmt = (n) => n ? Number(n).toLocaleString('fa-IR') : '—';

  const styles = {
    container: { padding: '8px', direction: 'rtl', fontFamily: "'Vazirmatn', Tahoma, sans-serif", maxWidth: '900px', margin: '0 auto', boxSizing: 'border-box' },
    headerTitle: { textAlign: 'center', color: '#78350f', fontSize: '15px', fontWeight: '700', marginBottom: '8px' },
    cardBox: { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)', marginBottom: '10px' },
    sectionTitle: { fontSize: '12px', color: '#1e293b', marginBottom: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px', fontWeight: '600' },
    formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '6px', alignItems: 'center', marginBottom: '6px' },
    input: { width: '100%', padding: '5px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', backgroundColor: '#fff' },
    inputSmall: { padding: '4px 8px', fontSize: '12px', borderRadius: '5px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontFamily: 'inherit' },
    btn: { padding: '5px 12px', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', fontFamily: 'inherit' },
    btnSmall: { padding: '2px 8px', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
    th: { background: '#f8fafc', color: '#475569', padding: '5px 6px', border: '1px solid #e2e8f0', fontSize: '11px' },
    td: { padding: '5px 6px', border: '1px solid #f1f5f9', textAlign: 'center', color: '#1e293b' },
    errBox: { color: '#991b1b', backgroundColor: '#fee2e2', padding: '6px 10px', borderRadius: '5px', marginBottom: '8px', border: '1px solid #f87171', fontSize: '12px' },
    badge: { background: '#fef3c7', color: '#92400e', borderRadius: '4px', padding: '1px 6px', fontSize: '11px' },
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.headerTitle}>✨ مدیریت مشتریان و مراسم‌ها | {businessName}</h2>

      {error && <div style={styles.errBox}>{error}</div>}

      {/* فرم ثبت/ویرایش مشتری */}
      <div style={{ ...styles.cardBox, border: editingId ? '2px solid #d97706' : '1px solid #e2e8f0' }}>
        <h3 style={styles.sectionTitle}>{editingId ? '✏️ ویرایش مشتری' : '➕ ثبت مشتری جدید'}</h3>
        
        <div className="accounting-form-grid customer-form-grid" style={styles.formGrid}>
          <div className="accounting-field">
            <label htmlFor="customer-name">نام و نام خانوادگی *</label>
            <input id="customer-name" style={styles.input} placeholder="نام مشتری" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="accounting-field">
            <label htmlFor="customer-phone">شماره تماس *</label>
            <input id="customer-phone" style={styles.input} type="tel" inputMode="tel" placeholder="مثلاً 09123456789" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div className="accounting-field">
            <label htmlFor="customer-address">آدرس</label>
            <input id="customer-address" style={styles.input} placeholder="آدرس مشتری (اختیاری)" value={address} onChange={e => setAddress(e.target.value)} />
          </div>
          <div className="accounting-field">
            <label htmlFor="customer-notes">یادداشت</label>
            <input id="customer-notes" style={styles.input} placeholder="یادداشت تکمیلی (اختیاری)" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        {/* بخش انتخاب معرف */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '6px', alignItems: 'center', marginTop: '6px' }}>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#475569', whiteSpace: 'nowrap', fontWeight: '600' }}>معرف:</span>
            <button type="button" style={{ ...styles.btnSmall, background: introducerMode === 'list' ? '#78350f' : '#cbd5e1', fontSize: '10px' }} onClick={() => setIntroducerMode('list')}>لیست</button>
            <button type="button" style={{ ...styles.btnSmall, background: introducerMode === 'manual' ? '#78350f' : '#cbd5e1', fontSize: '10px' }} onClick={() => setIntroducerMode('manual')}>دستی</button>
          </div>

          <div className="accounting-field" style={{ gridColumn: 'span 3' }}>
            {introducerMode === 'list' ? (
              <>
                <label htmlFor="customer-referral">انتخاب معرف</label>
                <select id="customer-referral" style={styles.input} value={selectedIntroducer} onChange={e => setSelectedIntroducer(e.target.value)}>
                <option value="">-- انتخاب معرف از بین مشتریان --</option>
                {customers.map(c => (
                  <option key={c.id} value={c["Full name"]}>{c["Full name"]} ({formatPersianDigits(c.phone)})</option>
                ))}
                </select>
              </>
            ) : (
              <>
                <label htmlFor="customer-manual-referral">نام معرف</label>
                <input id="customer-manual-referral" style={styles.input} placeholder="نام معرف را وارد کنید" value={manualIntroducer} onChange={e => setManualIntroducer(e.target.value)} />
              </>
            )}
          </div>
        </div>

        <div style={{ marginTop: '8px' }}>
          <button style={{ ...styles.btn, backgroundColor: editingId ? '#d97706' : '#78350f' }} onClick={handleSaveCustomer}>
            {editingId ? '💾 ذخیره تغییرات مشتری' : 'ثبت مشتری'}
          </button>
          {editingId && (
            <button style={{ ...styles.btnSmall, background: '#64748b', marginRight: '6px', padding: '5px 12px' }} onClick={handleCancelEdit}>لغو</button>
          )}
        </div>
      </div>

      {/* جستجوی سریع */}
      <div style={styles.cardBox}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>🔍 جستجو:</span>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              style={{ ...styles.input, padding: '4px 8px', fontSize: '11px' }}
              placeholder="نام مشتری را تایپ کنید..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setIsSearching(true); }}
              onFocus={() => setIsSearching(true)}
            />
            {isSearching && searchTerm && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '0 0 5px 5px', maxHeight: '130px', overflowY: 'auto', zIndex: 100, boxShadow: '0 4px 6px rgba(0,0,0,0.08)' }}>
                {filteredCustomers.length > 0 ? filteredCustomers.map(c => (
                  <div key={c.id} onClick={() => handleCustomerSelect(c)} style={{ padding: '5px 8px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>
                    <strong>{c["Full name"]}</strong> — {formatPersianDigits(c.phone)}
                  </div>
                )) : <div style={{ padding: '5px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>یافت نشد</div>}
              </div>
            )}
          </div>
        </div>
        {selectedCustomer && (
          <div style={{ marginTop: '6px', padding: '5px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '5px', fontSize: '11px', color: '#166534' }}>
            ✅ مشتری انتخاب‌شده: <strong>{selectedCustomer["Full name"]}</strong> ({formatPersianDigits(selectedCustomer.phone)})
          </div>
        )}
      </div>

      {/* لیست مشتریان */}
      <div style={styles.cardBox}>
        <h3 style={styles.sectionTitle}>📋 لیست مشتریان ({formatDisplay(customers.length)}) — [دابل‌کلیک = ویرایش]</h3>
        {customers.length === 0 && <p style={{ textAlign: 'center', color: '#94a3b8', padding: '8px', fontSize: '12px' }}>هنوز مشتری‌ای ثبت نشده است.</p>}
        <ul className="customer-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {customers.map(c => (
            <li key={c.id}
                onDoubleClick={() => handleStartEdit(c)}
                title="دابل‌کلیک برای ویرایش"
                style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: selectedCustomer?.id === c.id ? '#fffbeb' : 'transparent' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600' }}>{c["Full name"]}</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>📞 {formatPersianDigits(c.phone)}{c.referral ? ` | 👤 معرف: ${c.referral}` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button style={{ ...styles.btnSmall, background: '#78350f' }} onClick={(e) => { e.stopPropagation(); handleCustomerSelect(c); }}>مراسم‌ها</button>
                <button style={{ ...styles.btnSmall, background: '#ef4444' }} onClick={(e) => handleDeleteCustomer(c.id, e)}>🗑️</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* مراسم‌های مشتری انتخاب‌شده */}
      {selectedCustomer && (
        <div style={{ ...styles.cardBox, border: '2px solid #d97706' }}>
          <h3 style={styles.sectionTitle}>🎉 مراسم‌های «{selectedCustomer["Full name"]}» ({formatDisplay(ceremonies.length)})</h3>

          <div className="accounting-form-grid ceremony-form-grid" style={styles.formGrid}>
            <div className="accounting-field">
              <label htmlFor="ceremony-type">نوع مراسم</label>
              <select id="ceremony-type" style={styles.inputSmall} value={cerType} onChange={e => setCerType(e.target.value)}>
                {CEREMONY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="accounting-field">
              <label htmlFor="ceremony-date">تاریخ مراسم</label>
              <input id="ceremony-date" style={styles.inputSmall} placeholder="مثلاً ۱۴۰۴/۰۵/۱۰" value={cerDate} onChange={e => setCerDate(e.target.value)} />
            </div>
            <div className="accounting-field">
              <label htmlFor="ceremony-guests">تعداد مهمان</label>
              <FormattedNumberInput id="ceremony-guests" style={styles.inputSmall} allowDecimal={false} placeholder="تعداد" value={cerGuests} onValueChange={setCerGuests} />
            </div>
            <div className="accounting-field">
              <label htmlFor="ceremony-budget">بودجه تقریبی (تومان)</label>
              <FormattedNumberInput id="ceremony-budget" style={styles.inputSmall} allowDecimal={false} placeholder="مبلغ بودجه" value={cerBudget} onValueChange={setCerBudget} />
            </div>
            <div className="accounting-field">
              <label htmlFor="ceremony-notes">یادداشت مراسم</label>
              <input id="ceremony-notes" style={styles.inputSmall} placeholder="یادداشت (اختیاری)" value={cerNotes} onChange={e => setCerNotes(e.target.value)} />
            </div>
            <div>
              <button style={{ ...styles.btn, backgroundColor: editingCeremonyId ? '#d97706' : '#16a34a' }} onClick={handleSaveCeremony}>
                {editingCeremonyId ? '💾 ذخیره مراسم' : '➕ افزودن مراسم'}
              </button>
              {editingCeremonyId && (
                <button style={{ ...styles.btnSmall, background: '#64748b', marginRight: '6px' }} onClick={() => { setEditingCeremonyId(null); setCerDate(''); setCerGuests(''); setCerBudget(''); setCerNotes(''); }}>لغو</button>
              )}
            </div>
          </div>

          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>نوع مراسم</th>
                <th style={styles.th}>تاریخ</th>
                <th style={styles.th}>تعداد مهمان</th>
                <th style={styles.th}>بودجه (تومان)</th>
                <th style={styles.th}>یادداشت</th>
                <th style={styles.th}>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {ceremonies.length === 0 && (
                <tr><td colSpan="6" style={{ ...styles.td, color: '#94a3b8' }}>هنوز مراسمی برای این مشتری ثبت نشده است.</td></tr>
              )}
              {ceremonies.map(c => (
                <tr key={c.id}>
                  <td style={styles.td}><span style={styles.badge}>{c.ceremony_type}</span></td>
                  <td style={styles.td}>{formatPersianDigits(c.ceremony_date)}</td>
                  <td style={styles.td}>{fmt(c.guest_count)}</td>
                  <td style={styles.td}>{fmt(c.budget)}</td>
                  <td style={styles.td}>{c.notes || '—'}</td>
                  <td style={styles.td}>
                    <button style={{ ...styles.btnSmall, background: '#d97706', marginLeft: '4px' }} onClick={() => handleStartEditCeremony(c)}>✏️</button>
                    <button style={{ ...styles.btnSmall, background: '#ef4444' }} onClick={() => handleDeleteCeremony(c.id)}>🗑️</button>
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
