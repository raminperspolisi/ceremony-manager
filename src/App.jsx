import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import InventoryPanel from './components/InventoryPanel';
import QuotationPanel from './components/QuotationPanel';
import CustomersPanel from './components/CustomersPanel';
import FinancialReportPanel from './components/FinancialReportPanel';
import OfficialInvoicesPanel from './components/OfficialInvoicesPanel';
import RemindersPanel from './components/RemindersPanel'; // 🔔 اضافه کردن کامپوننت یادآوری‌ها

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
              className={`nav-button ${activeSection === "official" ? "active" : ""}`}
              onClick={() => setActiveSection("official")}
            >
              <span className="nav-icon">📜</span>
              <span className="nav-text">فاکتور رسمی</span>
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

            {/* 🔔 دکمه تب جدید یادآوری مراسم */}
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
                  : activeSection === "official"
                  ? "فاکتور رسمی"
                  : activeSection === "customers"
                  ? "مشتریان"
                  : activeSection === "reports"
                  ? "گزارش مالی"
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
            {activeSection === "customers" && <CustomersPanel />}
            {activeSection === "reports" && <FinancialReportPanel />}
            {activeSection === "reminders" && <RemindersPanel />} {/* 🔔 رندر پنل یادآوری‌ها */}
          </div>
        </section>
      </div>
    </main>
  );
}
