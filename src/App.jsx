import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import InventoryPanel from "./components/InventoryPanel";
import QuotationPanel from './components/QuotationPanel';
import CustomersPanel from './components/CustomersPanel'; 
import "./App.css";

export default function App() {
  const [activeSection, setActiveSection] = useState("inventory");
  const [inventory, setInventory] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);

  const fetchData = useCallback(async () => {
    const { data, error } = await supabase
      .from("inventory")
      .select("*");

    if (error) {
      console.error("خطا در دریافت موجودی:", error.message);
      alert("خطا در دریافت کالاهای انبار: " + error.message);
      return;
    }

    setInventory(data || []);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // افزودن کالا به پیش‌فاکتور
  const handleSelectItem = (item) => {
    setSelectedItems((currentItems) => {
      const existingItem = currentItems.find(
        (selectedItem) => selectedItem.id === item.id
      );

      if (existingItem) {
        return currentItems.map((selectedItem) =>
          selectedItem.id === item.id
            ? {
                ...selectedItem,
                requestedQuantity:
                  (Number(selectedItem.requestedQuantity) || 1) + 1,
              }
            : selectedItem
        );
      }

      return [
        ...currentItems,
        {
          ...item,
          requestedQuantity: 1,
        },
      ];
    });
  };

  return (
    <main className="app-shell" dir="rtl">
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
              className={`nav-button ${
                activeSection === "inventory" ? "active" : ""
              }`}
              onClick={() => setActiveSection("inventory")}
            >
              <span className="nav-icon">▦</span>
              <span className="nav-text">موجودی انبار</span>
              <span className="nav-count">{inventory.length}</span>
            </button>

            <button
              type="button"
              className={`nav-button ${
                activeSection === "quotations" ? "active" : ""
              }`}
              onClick={() => setActiveSection("quotations")}
            >
              <span className="nav-icon">▤</span>
              <span className="nav-text">پیش‌فاکتور</span>
              <span className="nav-count">{selectedItems.length}</span>
            </button>

            <button
              type="button"
              className={`nav-button ${
                activeSection === "customers" ? "active" : ""
              }`}
              onClick={() => setActiveSection("customers")}
            >
              <span className="nav-icon">👤</span>
              <span className="nav-text">مشتریان</span>
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
                  : "مشتریان"}
            </h2>
            <p className="page-description">
              {activeSection === "inventory"
                ? "کالاهای انبار را مشاهده و مدیریت کنید."
                : activeSection === "quotations"
                ? "اقلام انتخاب‌شده و قیمت‌های پیش‌فاکتور را بررسی کنید."
                : "اطلاعات مشتریان را ثبت و مدیریت کنید."}
            </p>
            </div>

            {activeSection === "inventory" && (
              <button
                type="button"
                className="refresh-button"
                onClick={fetchData}
              >
                <span aria-hidden="true">↻</span>
                تازه‌سازی
              </button>
            )}
          </div>

          <div className="panel-container">
            {/* شرط‌های نمایش پنل‌ها */}
            {activeSection === "inventory" ? (
              <InventoryPanel
                items={inventory}
                refresh={fetchData}
                onItemSelected={handleSelectItem} 
              /> // <--- اصلاح شد: اینجا onItemSelected قرار گرفت
            ) : activeSection === "quotations" ? (
              <QuotationPanel
                selectedItems={selectedItems}
                setSelectedItems={setSelectedItems}
              />
            ) : (
              <CustomersPanel />
            )}
          </div>

          <footer className="app-footer">
            سامانه مدیریت تشریفات
          </footer>
        </section>
      </div>
    </main>
  );
}
