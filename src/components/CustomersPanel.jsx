import React, { useState, useEffect } from 'react';
import { deleteRows, insertRows, readTable, updateRows } from '../offlineSync';
import { formatDisplay, formatPersianDigits } from '../styles';
import { formatPersianDate } from '../dateUtils';
import { toGregorianISODate } from '../calendarDateUtils';
import FormattedNumberInput from './FormattedNumberInput';
import PersianDateInput from './PersianDateInput';
import EmptyState from './EmptyState';
import { useToast } from './useToast';

const CEREMONY_TYPES = ['عروسی', 'عقد', 'نامزدی', 'تولد', 'حنابندان', 'همایش', 'سایر'];

const formatCeremonyDate = (value) => {
  if (!value) return '—';
  const isoDate = toGregorianISODate(value);
  return isoDate ? formatPersianDate(isoDate) : formatPersianDigits(String(value));
};

export default function CustomersPanel({ businessName = 'تشریفات آژو' }) {
  const { toast, confirm } = useToast();
  // فرم مشتری
  const [editingId, setEditingId] = useState(null);
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [customerFormTab, setCustomerFormTab] = useState('personal');
  const [savingCustomer, setSavingCustomer] = useState(false);
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
  const [selectedCustomerIds, setSelectedCustomerIds] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerListOpen, setCustomerListOpen] = useState(false);

  // مراسم‌های مشتری انتخاب‌شده
  const [ceremonies, setCeremonies] = useState([]);
  const [editingCeremonyId, setEditingCeremonyId] = useState(null);
  const [cerType, setCerType] = useState(CEREMONY_TYPES[0]);
  const [cerDate, setCerDate] = useState('');
  const [cerGuests, setCerGuests] = useState('');
  const [cerBudget, setCerBudget] = useState('');
  const [cerNotes, setCerNotes] = useState('');

  useEffect(() => { fetchCustomers(); }, []);

  useEffect(() => {
    const refreshCustomerData = () => {
      fetchCustomers();
      if (selectedCustomer?.id) fetchCeremonies(selectedCustomer.id);
    };
    window.addEventListener('offline-data-updated', refreshCustomerData);
    return () => window.removeEventListener('offline-data-updated', refreshCustomerData);
  }, [selectedCustomer?.id]);

  useEffect(() => {
    const handleAppEscape = (event) => {
      if (customerFormOpen) {
        event.preventDefault();
        if (!savingCustomer) handleCancelEdit();
        return;
      }
      if (customerListOpen) {
        event.preventDefault();
        setCustomerListOpen(false);
        return;
      }
      if (isSearching) {
        event.preventDefault();
        setIsSearching(false);
        return;
      }
      if (editingCeremonyId !== null) {
        event.preventDefault();
        setEditingCeremonyId(null);
        setCerDate('');
        setCerGuests('');
        setCerBudget('');
        setCerNotes('');
        return;
      }
      if (editingId !== null) {
        event.preventDefault();
        handleCancelEdit();
      }
    };
    window.addEventListener('app-escape', handleAppEscape);
    return () => window.removeEventListener('app-escape', handleAppEscape);
  }, [customerFormOpen, customerListOpen, editingCeremonyId, editingId, isSearching, savingCustomer]);

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

  async function handleSaveCustomer(event) {
    event.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError('لطفاً نام و شماره تماس را وارد کنید.');
      setCustomerFormTab('personal');
      return;
    }
    setSavingCustomer(true);
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
      } else {
        const { error: e2 } = await insertRows('customers', [customerData]);
        if (e2) throw e2;
      }
      
      handleCancelEdit();
      await fetchCustomers();
      toast('success', editingId ? 'تغییرات مشتری ذخیره شد.' : 'مشتری با موفقیت ثبت شد.');
    } catch (err) {
      setError('خطا در ذخیرهٔ مشتری: ' + err.message);
    } finally {
      setSavingCustomer(false);
    }
  }

  async function handleDeleteCustomer(id, e) {
    e.stopPropagation();
    if (!await confirm('این مشتری و مراسم‌هایش حذف شوند؟')) return;
    try {
      const { error: ceremonyError } = await deleteRows('ceremonies', [{ column: 'customer_id', operator: 'eq', value: id }]);
      if (ceremonyError) throw ceremonyError;
      const { error: e2 } = await deleteRows('customers', [{ column: 'id', operator: 'eq', value: id }]);
      if (e2) throw e2;
      setCustomers((currentCustomers) => currentCustomers.filter((customer) => String(customer.id) !== String(id)));
      setSelectedCustomerIds((currentIds) => new Set([...currentIds].filter((selectedId) => String(selectedId) !== String(id))));
      if (String(selectedCustomer?.id) === String(id)) { setSelectedCustomer(null); setCeremonies([]); }
      toast('success', 'مشتری و مراسم‌های مرتبط حذف شدند.');
    } catch (err) { toast('error', 'خطا در حذف: ' + err.message); }
  }

  async function handleDeleteSelectedCustomers() {
    const selectedIds = Array.from(selectedCustomerIds);
    if (!selectedIds.length) return;
    if (!await confirm(`آیا از حذف ${formatDisplay(selectedIds.length)} مشتری و مراسم‌هایشان مطمئن هستید؟`)) return;

    try {
      const { error: ceremonyError } = await deleteRows('ceremonies', [{ column: 'customer_id', operator: 'in', value: selectedIds }]);
      if (ceremonyError) throw ceremonyError;
      const { error: customerError } = await deleteRows('customers', [{ column: 'id', operator: 'in', value: selectedIds }]);
      if (customerError) throw customerError;

      setCustomers((currentCustomers) => currentCustomers.filter((customer) => !selectedIds.some((id) => String(id) === String(customer.id))));
      setSelectedCustomerIds(new Set());
      if (selectedCustomer && selectedIds.some((id) => String(id) === String(selectedCustomer.id))) {
        setSelectedCustomer(null);
        setCeremonies([]);
      }
      toast('success', 'مشتریان انتخاب‌شده و مراسم‌های مرتبط حذف شدند.');
    } catch (err) {
      toast('error', 'خطا در حذف گروهی مشتریان: ' + err.message);
    }
  }

  function handleToggleCustomerSelection(id) {
    setSelectedCustomerIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(id)) nextIds.delete(id);
      else nextIds.add(id);
      return nextIds;
    });
  }

  function handleStartEdit(customer) {
    setCustomerListOpen(false);
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
    setCustomerFormTab('personal');
    setCustomerFormOpen(true);
    setError(null);
  }

  function handleCancelEdit() {
    setEditingId(null); 
    setName(''); setPhone(''); setAddress(''); 
    setSelectedIntroducer(''); setManualIntroducer(''); setNotes('');
    setCustomerFormTab('personal');
    setCustomerFormOpen(false);
    setError(null);
  }

  function handleStartNewCustomer() {
    handleCancelEdit();
    setCustomerFormOpen(true);
  }

  // ثبت و همگام‌سازی مراسم در جدول ceremonies و events تقویم
  async function handleSaveCeremony() {
    if (!selectedCustomer) { toast('warning', 'ابتدا یک مشتری را انتخاب کنید'); return; }
    const ceremonyDateISO = toGregorianISODate(cerDate);
    if (!ceremonyDateISO) { toast('warning', 'تاریخ مراسم معتبر نیست؛ تاریخ را از تقویم انتخاب کنید.'); return; }
    try {
      setError(null);
      const cerData = {
        customer_id: selectedCustomer.id,
        ceremony_type: cerType,
        ceremony_date: ceremonyDateISO,
        guest_count: parseInt(cerGuests) || 0,
        budget: parseInt(cerBudget) || 0,
        notes: cerNotes || null
      };

      // اطلاعات برای جدول events (تقویم)
      const eventData = {
        customer_name: selectedCustomer["Full name"],
        event_type: cerType,
        event_date: ceremonyDateISO,
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
      toast('success', 'مراسم با موفقیت ثبت و به تقویم اضافه شد.');
    } catch (err) { toast('error', 'خطای مراسم: ' + err.message); }
  }

  function handleStartEditCeremony(c) {
    setEditingCeremonyId(c.id);
    setCerType(c.ceremony_type || CEREMONY_TYPES[0]);
    setCerDate(toGregorianISODate(c.ceremony_date) || '');
    setCerGuests(c.guest_count ? String(c.guest_count) : '');
    setCerBudget(c.budget ? String(c.budget) : '');
    setCerNotes(c.notes || '');
  }

  async function handleDeleteCeremony(id) {
    if (!await confirm('این مراسم حذف شود؟')) return;
    try {
      const { error: e2 } = await deleteRows('ceremonies', [{ column: 'id', operator: 'eq', value: id }]);
      if (e2) throw e2;
      fetchCeremonies(selectedCustomer.id);
      toast('success', 'مراسم حذف شد.');
    } catch (err) { toast('error', 'خطا در حذف مراسم: ' + err.message); }
  }

  const filteredCustomers = customers.filter(c =>
    c["Full name"]?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setCustomerListOpen(false);
    setSearchTerm(customer["Full name"]);
    setIsSearching(false);
    setEditingCeremonyId(null);
    setCerDate(''); setCerGuests(''); setCerBudget(''); setCerNotes('');
    fetchCeremonies(customer.id);
  };

  const fmt = (n) => n ? Number(n).toLocaleString('fa-IR') : '—';

  const styles = {
    container: { padding: '8px', direction: 'rtl', fontFamily: '"IRANSans", Tahoma, sans-serif', maxWidth: 'none', margin: '0 auto', boxSizing: 'border-box' },
    headerTitle: { textAlign: 'center', color: 'var(--app-primary)', fontSize: '15px', fontWeight: '700', marginBottom: '8px' },
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
    <div className="customers-panel" style={styles.container}>
      <header className="customers-page-heading">
        <div>
          <span className="customers-page-eyebrow">مدیریت ارتباط با مشتری</span>
          <h2>مشتریان و مراسم‌ها</h2>
          <p>اطلاعات طرف‌حساب‌ها، سوابق و مراسم‌های مرتبط را یکجا مدیریت کنید.</p>
        </div>
        <button type="button" className="customers-add-button" onClick={handleStartNewCustomer}>
          <span aria-hidden="true">＋</span>
          مشتری جدید
        </button>
      </header>

      {error && !customerFormOpen && <div style={styles.errBox}>{error}</div>}

      {customerFormOpen && (
        <div
          className="customer-form-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingCustomer) handleCancelEdit();
          }}
        >
          <section
            className="customer-form-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-form-title"
            dir="rtl"
          >
            <header className="customer-form-dialog-heading">
              <div>
                <span className="customers-page-eyebrow">طرف حساب · {businessName}</span>
                <h2 id="customer-form-title">{editingId ? 'ویرایش مشخصات مشتری' : 'ثبت طرف حساب جدید'}</h2>
              </div>
              <div className="customer-form-heading-actions">
                <span className="customer-type-badge">مشتری</span>
                <button type="button" aria-label="بستن فرم" onClick={handleCancelEdit} disabled={savingCustomer}>×</button>
              </div>
            </header>

            <div className="customer-form-tabs" role="tablist" aria-label="بخش‌های مشخصات مشتری">
              {[
                ['personal', 'مشخصات شخصی'],
                ['contact', 'اطلاعات تماس'],
                ['referral', 'معرف'],
                ['notes', 'یادداشت‌ها'],
              ].map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  id={`customer-tab-${tab}`}
                  aria-selected={customerFormTab === tab}
                  aria-controls={`customer-tabpanel-${tab}`}
                  className={customerFormTab === tab ? 'active' : ''}
                  onClick={() => setCustomerFormTab(tab)}
                >
                  {label}
                </button>
              ))}
            </div>

            <form className="customer-form-content" onSubmit={handleSaveCustomer}>
              {error && <div className="customer-form-error" role="alert">{error}</div>}
              <div
                id={`customer-tabpanel-${customerFormTab}`}
                role="tabpanel"
                aria-labelledby={`customer-tab-${customerFormTab}`}
                className="customer-form-tabpanel"
              >
                {customerFormTab === 'personal' && (
                  <div className="customer-form-fields">
                    <label className="accounting-field">
                      نام و نام خانوادگی <span>*</span>
                      <input
                        autoFocus
                        autoComplete="name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="نام کامل مشتری"
                        maxLength={160}
                        required
                      />
                    </label>
                    <label className="accounting-field">
                      شماره تماس <span>*</span>
                      <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="مثلاً 09123456789"
                        maxLength={32}
                        required
                      />
                    </label>
                  </div>
                )}
                {customerFormTab === 'contact' && (
                  <div className="customer-form-fields">
                    <label className="accounting-field customer-form-field-wide">
                      نشانی
                      <textarea
                        autoComplete="street-address"
                        value={address}
                        onChange={(event) => setAddress(event.target.value)}
                        placeholder="نشانی مشتری"
                        rows={4}
                        maxLength={500}
                      />
                    </label>
                  </div>
                )}
                {customerFormTab === 'referral' && (
                  <div className="customer-form-fields">
                    <label className="accounting-field">
                      روش ثبت معرف
                      <select value={introducerMode} onChange={(event) => setIntroducerMode(event.target.value)}>
                        <option value="list">انتخاب از فهرست مشتریان</option>
                        <option value="manual">ورود دستی</option>
                      </select>
                    </label>
                    <label className="accounting-field">
                      {introducerMode === 'list' ? 'انتخاب معرف' : 'نام معرف'}
                      {introducerMode === 'list' ? (
                        <select value={selectedIntroducer} onChange={(event) => setSelectedIntroducer(event.target.value)}>
                          <option value="">انتخاب کنید</option>
                          {customers
                            .filter((customer) => String(customer.id) !== String(editingId))
                            .map((customer) => (
                              <option key={customer.id} value={customer['Full name']}>
                                {customer['Full name']} ({formatPersianDigits(customer.phone)})
                              </option>
                            ))}
                        </select>
                      ) : (
                        <input
                          value={manualIntroducer}
                          onChange={(event) => setManualIntroducer(event.target.value)}
                          placeholder="نام معرف را وارد کنید"
                          maxLength={160}
                        />
                      )}
                    </label>
                  </div>
                )}
                {customerFormTab === 'notes' && (
                  <div className="customer-form-fields">
                    <label className="accounting-field customer-form-field-wide">
                      یادداشت تکمیلی
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="نکته‌ها و توضیحات مربوط به مشتری"
                        rows={4}
                        maxLength={1000}
                      />
                    </label>
                  </div>
                )}
              </div>

              <footer className="customer-form-actions">
                <button type="button" className="customer-form-cancel" onClick={handleCancelEdit} disabled={savingCustomer}>
                  انصراف
                </button>
                <button type="submit" className="customer-form-save" disabled={savingCustomer}>
                  {savingCustomer ? 'در حال ذخیره…' : editingId ? 'ذخیره تغییرات' : 'ثبت مشتری'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      <div className="customer-quick-tools">
        {/* جستجوی سریع */}
        <div className="customer-search-card" style={styles.cardBox}>
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
                  )) : <EmptyState
                    compact
                    icon="search"
                    title="موردی پیدا نشد"
                    description="نام دیگری را جستجو کنید."
                    primaryAction={{ label: 'پاک کردن جستجو', onClick: () => { setSearchTerm(''); setIsSearching(false); } }}
                  />}
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

        <button
          type="button"
          className="customer-list-open-button"
          onClick={() => setCustomerListOpen(true)}
        >
          <span aria-hidden="true">📋</span>
          <span>لیست مشتریان</span>
          <strong>{formatDisplay(customers.length)}</strong>
        </button>
      </div>

      {customerListOpen && (
        <div
          className="customer-list-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCustomerListOpen(false);
          }}
        >
          <section
            className="customer-list-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-list-title"
            dir="rtl"
          >
            <header className="customer-list-dialog-heading">
              <div>
                <span className="customers-page-eyebrow">مدیریت ارتباط با مشتری</span>
                <h2 id="customer-list-title">لیست مشتریان ({formatDisplay(customers.length)})</h2>
              </div>
              <button
                type="button"
                aria-label="بستن لیست مشتریان"
                onClick={() => setCustomerListOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="customer-list-card">
              <div className="customer-list-toolbar">
                <div className="customer-list-heading">
                  <div className="customer-list-selection-actions">
                    <label className="customer-select-all">
                      <input
                        type="checkbox"
                        checked={customers.length > 0 && selectedCustomerIds.size === customers.length}
                        onChange={(event) => setSelectedCustomerIds(event.target.checked ? new Set(customers.map((customer) => customer.id)) : new Set())}
                        aria-label="انتخاب همه مشتریان"
                      />
                      انتخاب همه
                    </label>
                    {selectedCustomerIds.size > 0 && (
                      <button type="button" className="customer-bulk-delete" onClick={handleDeleteSelectedCustomers}>
                        حذف انتخاب‌شده‌ها ({formatDisplay(selectedCustomerIds.size)})
                      </button>
                    )}
                  </div>
                </div>
                <div className="customer-list-actions">
                  <span>دابل‌کلیک روی نام مشتری برای ویرایش</span>
                </div>
              </div>
              {customers.length === 0 && (
                <EmptyState
                  icon="list"
                  title="هنوز مشتری‌ای ثبت نشده"
                  description="با ثبت نخستین مشتری، می‌توانید سوابق و مراسم‌های او را مدیریت کنید."
                  primaryAction={{ label: 'ثبت اولین مشتری', onClick: handleStartNewCustomer }}
                />
              )}
              <ul className="customer-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {customers.map(c => (
                  <li
                    key={c.id}
                    className="customer-list-item"
                    onDoubleClick={() => handleStartEdit(c)}
                    title="دابل‌کلیک برای ویرایش"
                    style={{ padding: '7px 8px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', cursor: 'pointer', background: selectedCustomerIds.has(c.id) ? '#f0f9ff' : selectedCustomer?.id === c.id ? '#fffbeb' : 'transparent' }}
                  >
                    <div className="customer-list-identity">
                      <input
                        type="checkbox"
                        checked={selectedCustomerIds.has(c.id)}
                        onChange={() => handleToggleCustomerSelection(c.id)}
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                        aria-label={`انتخاب مشتری ${c['Full name'] || ''}`}
                      />
                      <div className="customer-list-row-actions">
                        <button type="button" style={{ ...styles.btnSmall, background: 'var(--app-primary)' }} onClick={(event) => { event.stopPropagation(); handleCustomerSelect(c); }}>مراسم‌ها</button>
                        <button type="button" aria-label={`حذف مشتری ${c['Full name'] || ''}`} title="حذف مشتری" style={{ ...styles.btnSmall, background: 'transparent', color: '#dc2626' }} onClick={(event) => handleDeleteCustomer(c.id, event)}>🗑️</button>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: '600' }}>{c["Full name"]}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>📞 {formatPersianDigits(c.phone)}{c.referral ? ` | 👤 معرف: ${c.referral}` : ''}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}

      {/* مراسم‌های مشتری انتخاب‌شده */}
      {selectedCustomer && (
        <div className="customer-ceremonies-card" style={{ ...styles.cardBox, border: '2px solid #d97706' }}>
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
              <PersianDateInput id="ceremony-date" className="ceremony-date-input" value={cerDate} onChange={setCerDate} />
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
                <tr><td colSpan="6"><EmptyState
                  icon="calendar"
                  title="هنوز مراسمی ثبت نکرده‌اید"
                  description="از فرم بالا برای ثبت مراسم جدید برای این مشتری استفاده کنید."
                /></td></tr>
              )}
              {ceremonies.map(c => (
                <tr key={c.id}>
                  <td style={styles.td}><span style={styles.badge}>{c.ceremony_type}</span></td>
                  <td style={styles.td}>{formatCeremonyDate(c.ceremony_date)}</td>
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
