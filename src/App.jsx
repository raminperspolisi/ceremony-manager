import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // اطمینان حاصل کنید این فایل موجود است
import InventoryPanel from './components/InventoryPanel';
import QuotationPanel from './components/QuotationPanel';
import CustomersPanel from './components/CustomersPanel';
import ReportsPanel from './components/ReportsPanel';

export default function App() {
  const [activeSection, setActiveSection] = useState('inventory');
  const [inventory, setInventory] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);

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
    fetchData();
  }, []);

  // افزودن به پیش‌فاکتور
  const handleSelectItem = (item) => {
    setSelectedItems((prev) => [...prev, item]);
  };

  return (
    <main className="app-container">
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
          <span>سامانه آماده است</span>
        </div>
      </header>

      <div className="app-layout">
        <aside className="sidebar">
          <p className="sidebar-label">منوی اصلی</p>

          <nav className="section-nav" aria-label="بخش‌های برنامه">
            <button
              type="button"
              className={`nav-button ${activeSection === "inventory" ? "active" : ""}`}
              onClick={() => setActiveSection("inventory")}
            >
              <span className="nav-icon">▦</span>
              <span className="nav-text">موجودی انبار</span>
              <span className="nav-count">{inventory.length}</span>
            </button>

            <button
              type="button"
              className={`nav-button ${activeSection === "quotations" ? "active" : ""}`}
              onClick={() => setActiveSection("quotations")}
            >
              <span className="nav-icon">▤</span>
              <span className="nav-text">پیش‌فاکتور</span>
              <span className="nav-count">{selectedItems.length}</span>
            </button>

            <button
              type="button"
              className={`nav-button ${activeSection === "customers" ? "active" : ""}`}
              onClick={() => setActiveSection("customers")}
            >
              <span className="nav-icon">👤</span>
              <span className="nav-text">مشتریان</span>
            </button>

            <button
              type="button"
              className={`nav-button ${activeSection === "reports" ? "active" : ""}`}
              onClick={() => setActiveSection("reports")}
            >
              <span className="nav-icon">📊</span>
              <span className="nav-text">گزارش مالی</span>
            </button>
          </nav>

          <div className="sidebar-note">
            <span className="sidebar-note-icon">✓</span>
            <p>برای شروع، کالاهای موردنیاز را از انبار به پیش‌فاکتور اضافه کنید.</p>
          </div>
        </aside>

        <section className="main-content">
          <div className="page-heading">
            <div>
              <p className="page-eyebrow">داشبورد مدیریت</p>
              <h2>
                {activeSection === "inventory"
                  ? "موجودی انبار"
                  : activeSection === "quotations"
                  ? "پیش‌فاکتور"
                  : activeSection === "customers"
                  ? "مشتریان"
                  : "گزارش مالی"}
              </h2>
            </div>

            {activeSection === "inventory" && (
              <button type="button" className="refresh-button" onClick={fetchData}>
                ↻ تازه‌سازی
              </button>
            )}
          </div>

          <div className="panel-container">
            {activeSection === "inventory" ? (
              <InventoryPanel items={inventory} refresh={fetchData} onItemSelected={handleSelectItem} />
            ) : activeSection === "quotations" ? (
              <QuotationPanel selectedItems={selectedItems} setSelectedItems={setSelectedItems} />
            ) : activeSection === "customers" ? (
              <CustomersPanel />
            ) : (
              <ReportsPanel />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
