import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import InventoryPanel from './components/InventoryPanel';
import QuotationPanel from './components/QuotationPanel';
import CustomersPanel from './components/CustomersPanel';
import FinancialReportPanel from './components/FinancialReportPanel';
import OfficialInvoicesPanel from './components/OfficialInvoicesPanel';
import AnalyticsPanel from './components/AnalyticsPanel';
import RemindersPanel from './components/RemindersPanel'; // 🔔 یادآوری مراسم
import CalendarPanel from './components/CalendarPanel'; // 📅 تقویم مراسم‌ها

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // پیش‌فرض را روی مشتریان می‌گذاریم چون اولین گزینه منو است
  const [activeSection, setActiveSection] = useState('customers');
  const [inventory, setInventory] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);

  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
        setAuthError('');
        setAuthReady(true);
        if (!nextSession) {
          setInventory([]);
          setSelectedItems([]);
        }
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setAuthError('خطا در بررسی ورود: ' + error.message);
      setSession(data?.session ?? null);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // تابع دریافت داده‌ها
  const fetchData = async () => {
    try {
      const { data, error } = await supabase.from('inventory').select('*');
      if (error) throw error;
      setInventory(data || []);
    } catch (error) {
      console.error('خطا در دریافت اطلاعات:', error.message);
    }
  };

  useEffect(() => {
    if (session) fetchData();
  }, [session]);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      setPassword('');
    } catch (error) {
      setAuthError('خطا در ورود: ' + error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setAuthError('');
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError('خطا در خروج: ' + error.message);
    else {
      setInventory([]);
      setSelectedItems([]);
    }
  };

  // آپدیت زنده کالا در انبار و پیش‌فاکتورِ جاری
  const handleItemUpdated = (updatedItem) => {
    setInventory((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? { ...item, ...updatedItem } : item))
    );

    setSelectedItems((prev) =>
      prev.map((item) =>
        item.id === updatedItem.id
          ? {
              ...item,
              ...updatedItem,
              p1: updatedItem.price_level1 ?? updatedItem.p1,
              p2: updatedItem.price_level2 ?? updatedItem.p2,
              p3: updatedItem.price_level3 ?? updatedItem.p3,
              requestedQuantity: item.requestedQuantity || 1
            }
          : item
      )
    );
  };

  // افزودن به پیش‌فاکتور با تعداد پیش‌فرض ۱
  const handleSelectItem = (item) => {
    setSelectedItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.id === item.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        const currentQty = Number(updated[existingIndex].requestedQuantity || updated[existingIndex].quantity || 1);
        updated[existingIndex] = {
          ...updated[existingIndex],
          requestedQuantity: currentQty + 1,
          quantity: currentQty + 1
        };
        return updated;
      } else {
        return [...prev, { ...item, requestedQuantity: 1, quantity: 1 }];
      }
    });
  };

  if (!authReady) {
    return <main style={{ maxWidth: 420, margin: '15vh auto', padding: 24, textAlign: 'center' }}>در حال بررسی وضعیت ورود...</main>;
  }

  if (!session) {
    return (
      <main style={{ maxWidth: 420, margin: '10vh auto', padding: 24, direction: 'rtl', background: '#fff', borderRadius: 12, boxShadow: '0 8px 30px rgba(15, 23, 42, 0.1)' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>ورود به مدیریت تشریفات</h1>
        <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14 }}>برای دسترسی به سامانه با حساب کاربری خود وارد شوید.</p>
        {authError && <div role="alert" style={{ marginBottom: 14, padding: 10, borderRadius: 6, color: '#b91c1c', background: '#fee2e2' }}>{authError}</div>}
        <form onSubmit={handleSignIn}>
          <label htmlFor="auth-email" style={{ display: 'block', marginBottom: 6 }}>ایمیل</label>
          <input id="auth-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="auth-password" style={{ display: 'block', marginBottom: 6 }}>رمز عبور</label>
          <input id="auth-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" disabled={authLoading} style={{ width: '100%', color: '#fff', background: '#28645a', opacity: authLoading ? 0.7 : 1 }}>
            {authLoading ? 'در حال ورود...' : 'ورود'}
          </button>
        </form>
        <p style={{ margin: '14px 0 0', color: '#64748b', fontSize: 12 }}>حساب‌ها باید از بخش Authentication در Supabase ساخته شوند.</p>
      </main>
    );
  }

  return (
    <main 
      className="app-container" 
      style={{ 
        maxWidth: '1150px', 
        margin: '20px auto', 
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)', 
        borderRadius: '8px', 
        overflow: 'hidden',
        backgroundColor: '#ffffff'
      }}
    >
      <header className="app-header">
        <div className="brand">
          <img src="/azho2.png" alt="لوگو" className="header-logo" />
          <div className="header-title">
            <h1 className="brand-title">مدیریت تشریفات</h1>
            <p className="brand-subtitle">مدیریت انبار و پیش‌فاکتورها</p>
          </div>
        </div>

        <div className="header-status">
          <span className="status-dot" />
          <span>{session.user.email || 'کاربر واردشده'}</span>
          <button type="button" onClick={handleSignOut} style={{ padding: '4px 10px', border: '1px solid #dbe5e2', background: '#fff', color: '#1e5048' }}>
            خروج
          </button>
        </div>
      </header>

      {authError && <div role="alert" style={{ margin: '12px 20px', padding: 10, borderRadius: 6, color: '#b91c1c', background: '#fee2e2' }}>{authError}</div>}

      <div className="app-layout">
        <aside className="sidebar">
          <p className="sidebar-label">منوی اصلی</p>

          <nav className="section-nav" aria-label="بخش‌های برنامه">
            {/* 1. مشتریان */}
            <button
              type="button"
              className={`nav-button ${activeSection === "customers" ? "active" : ""}`}
              onClick={() => setActiveSection("customers")}
            >
              <span className="nav-icon">👤</span>
              <span className="nav-text">مشتریان</span>
            </button>

            {/* 2. موجودی انبار */}
            <button
              type="button"
              className={`nav-button ${activeSection === "inventory" ? "active" : ""}`}
              onClick={() => setActiveSection("inventory")}
            >
              <span className="nav-icon">▦</span>
              <span className="nav-text">موجودی انبار</span>
              <span className="nav-count">{inventory.length}</span>
            </button>

            {/* 3. پیش‌فاکتور */}
            <button
              type="button"
              className={`nav-button ${activeSection === "quotations" ? "active" : ""}`}
              onClick={() => setActiveSection("quotations")}
            >
              <span className="nav-icon">▤</span>
              <span className="nav-text">پیش‌فاکتور</span>
              <span className="nav-count">{selectedItems.length}</span>
            </button>

            {/* 4. فاکتور رسمی */}
            <button
              type="button"
              className={`nav-button ${activeSection === "official" ? "active" : ""}`}
              onClick={() => setActiveSection("official")}
            >
              <span className="nav-icon">📜</span>
              <span className="nav-text">فاکتور رسمی</span>
            </button>

            {/* 5. گزارش مالی */}
            <button
              type="button"
              className={`nav-button ${activeSection === "reports" ? "active" : ""}`}
              onClick={() => setActiveSection("reports")}
            >
              <span className="nav-icon">📊</span>
              <span className="nav-text">گزارش مالی</span>
            </button>

            {/* 6. آنالیز پیشرفته */}
            <button
              type="button"
              className={`nav-button ${activeSection === "analytics" ? "active" : ""}`}
              onClick={() => setActiveSection("analytics")}
            >
              <span className="nav-icon">📈</span>
              <span className="nav-text">آنالیز پیشرفته</span>
            </button>

            {/* 7. تقویم مراسم‌ها */}
            <button
              type="button"
              className={`nav-button ${activeSection === "calendar" ? "active" : ""}`}
              onClick={() => setActiveSection("calendar")}
            >
              <span className="nav-icon">📅</span>
              <span className="nav-text">تقویم مراسم‌ها</span>
            </button>

            {/* 8. یادآوری مراسم و تسویه */}
            <button
              type="button"
              className={`nav-button ${activeSection === "reminders" ? "active" : ""}`}
              onClick={() => setActiveSection("reminders")}
            >
              <span className="nav-icon">🔔</span>
              <span className="nav-text">یادآوری مراسم و تسویه</span>
            </button>
          </nav>

          <div className="sidebar-note">
            <span className="sidebar-note-icon">✓</span>
            <p>نرم افزار مدیریت گالری آژو.</p>
          </div>
        </aside>

        <section className="main-content">
          <div className="page-heading">
            <div>
              <p className="page-eyebrow">داشبورد مدیریت</p>
              <h2>
                {activeSection === "customers"
                  ? "مشتریان"
                  : activeSection === "inventory"
                  ? "موجودی انبار"
                  : activeSection === "quotations"
                  ? "پیش‌فاکتور"
                  : activeSection === "official"
                  ? "فاکتور رسمی"
                  : activeSection === "reports"
                  ? "گزارش مالی"
                  : activeSection === "analytics"
                  ? "آنالیز پیشرفته و سود و زیان"
                  : activeSection === "calendar"
                  ? "تقویم مراسم‌ها"
                  : "یادآوری مراسم و پیگیری تسویه"}
              </h2>
            </div>

            {activeSection === "inventory" && (
              <button type="button" className="refresh-button" onClick={fetchData}>
                ↻ تازه‌سازی
              </button>
            )}
          </div>

          <div className="panel-container">
            {activeSection === "customers" && <CustomersPanel />}
            {activeSection === "inventory" && (
              <InventoryPanel 
                items={inventory} 
                refresh={fetchData} 
                onItemSelected={handleSelectItem} 
                onItemUpdated={handleItemUpdated} 
              />
            )}
            {activeSection === "quotations" && <QuotationPanel selectedItems={selectedItems} setSelectedItems={setSelectedItems} />}
            {activeSection === "official" && <OfficialInvoicesPanel />}
            {activeSection === "reports" && <FinancialReportPanel />}
            {activeSection === "analytics" && <AnalyticsPanel />}
            {activeSection === "calendar" && <CalendarPanel />}
            {activeSection === "reminders" && <RemindersPanel />}
          </div>
        </section>
      </div>
    </main>
  );
}
