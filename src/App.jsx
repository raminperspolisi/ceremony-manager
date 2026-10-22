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
import TutorialPanel from './components/TutorialPanel';
import ContactPanel from './components/ContactPanel';
import { formatDisplay } from './styles';
import {
  getOfflineSyncStatus,
  readTable,
  setOfflineUser,
  subscribeOfflineSyncStatus,
  syncPendingMutations,
  warmOfflineCache,
} from './offlineSync';

const DEFAULT_BUSINESS_NAME = 'تشریفات آژو';
const DEFAULT_LOGO_URL = '/azho-logo.png';
const BUSINESS_LOGO_BUCKET = 'business-logos';
const SECTION_BY_FUNCTION_KEY = {
  F1: 'customers',
  F2: 'inventory',
  F3: 'quotations',
  F4: 'official',
  F5: 'reports',
  F6: 'analytics',
  F7: 'calendar',
  F8: 'reminders',
};

function resizeLogoToWebp(file) {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(imageUrl);
        reject(new Error('پردازش تصویر در این مرورگر ممکن نیست.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(imageUrl);
        if (!blob) {
          reject(new Error('تبدیل تصویر لوگو ناموفق بود.'));
          return;
        }
        resolve(blob);
      }, 'image/webp', 0.82);
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error('فایل انتخاب‌شده تصویر معتبر نیست.'));
    };
    image.src = imageUrl;
  });
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileBusinessName, setProfileBusinessName] = useState(DEFAULT_BUSINESS_NAME);
  const [profileLogoUrl, setProfileLogoUrl] = useState(DEFAULT_LOGO_URL);
  const [profileLogoPreview, setProfileLogoPreview] = useState(DEFAULT_LOGO_URL);
  const [profileLogoFile, setProfileLogoFile] = useState(null);
  const [removeProfileLogo, setRemoveProfileLogo] = useState(false);
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // پیش‌فرض را روی مشتریان می‌گذاریم چون اولین گزینه منو است
  const [activeSection, setActiveSection] = useState('customers');
  const [visitedSections, setVisitedSections] = useState(() => new Set(['customers']));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState(getOfflineSyncStatus);
  const [offlineCacheUserId, setOfflineCacheUserId] = useState(null);
  const [offlineSyncError, setOfflineSyncError] = useState('');
  const [inventory, setInventory] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const businessName = session?.user?.user_metadata?.business_name?.trim() || DEFAULT_BUSINESS_NAME;
  const storedLogoVersion = session?.user?.user_metadata?.business_logo_updated_at || '';
  const logoUrl = session?.user?.id && storedLogoVersion
    ? `${supabase.storage.from(BUSINESS_LOGO_BUCKET).getPublicUrl(`${session.user.id}/logo.webp`).data.publicUrl}?v=${encodeURIComponent(storedLogoVersion)}`
    : DEFAULT_LOGO_URL;

  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
        setOfflineUser(nextSession?.user?.id);
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
      setOfflineUser(data?.session?.user?.id);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeOfflineSyncStatus(setOfflineStatus);
    const handleSyncError = (event) => setOfflineSyncError(event.detail || 'همگام‌سازی ناموفق بود.');
    const clearSyncError = () => setOfflineSyncError('');
    window.addEventListener('offline-sync-error', handleSyncError);
    window.addEventListener('online', clearSyncError);
    return () => {
      unsubscribe();
      window.removeEventListener('offline-sync-error', handleSyncError);
      window.removeEventListener('online', clearSyncError);
    };
  }, []);

  // تابع دریافت داده‌ها
  const fetchData = async () => {
    try {
      const { data, error } = await readTable('inventory');
      if (error) throw error;
      setInventory(data || []);
    } catch (error) {
      console.error('خطا در دریافت اطلاعات:', error.message);
    }
  };

  useEffect(() => {
    if (session) fetchData();
  }, [session]);

  const sessionUserId = session?.user?.id;
  const offlineCacheReady = offlineCacheUserId === sessionUserId;

  useEffect(() => {
    if (!sessionUserId) return undefined;
    let mounted = true;
    warmOfflineCache().then(() => {
      if (mounted) setOfflineCacheUserId(sessionUserId);
    }).catch((error) => {
      console.error('آماده‌سازی داده‌های آفلاین ناموفق بود:', error.message);
      setOfflineSyncError(error.message);
    });
    return () => { mounted = false; };
  }, [sessionUserId]);

  useEffect(() => {
    if (!sessionUserId) return undefined;
    let lastRefreshAt = Date.now();
    let refreshing = false;
    const refreshFromServer = async () => {
      if (!navigator.onLine || document.visibilityState === 'hidden' || refreshing) return;
      if (Date.now() - lastRefreshAt < 15000) return;
      refreshing = true;
      lastRefreshAt = Date.now();
      try {
        await syncPendingMutations();
        await warmOfflineCache();
      } catch (error) {
        console.error('به‌روزرسانی داده‌ها ناموفق بود:', error.message);
        setOfflineSyncError(error.message);
      } finally {
        refreshing = false;
      }
    };
    const refreshAfterReconnect = () => {
      lastRefreshAt = 0;
      refreshFromServer();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshFromServer();
    };

    window.addEventListener('online', refreshAfterReconnect);
    window.addEventListener('focus', refreshFromServer);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('online', refreshAfterReconnect);
      window.removeEventListener('focus', refreshFromServer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [sessionUserId]);

  useEffect(() => {
    const refreshInventoryCache = () => {
      if (sessionUserId) fetchData();
    };
    window.addEventListener('offline-data-updated', refreshInventoryCache);
    return () => window.removeEventListener('offline-data-updated', refreshInventoryCache);
  }, [sessionUserId]);

  useEffect(() => {
    const handleFunctionKey = (event) => {
      const section = SECTION_BY_FUNCTION_KEY[event.key];
      if (!session || !section || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || profileOpen) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
      ) {
        return;
      }

      event.preventDefault();
      setActiveSection(section);
      setVisitedSections((visited) => new Set(visited).add(section));
      setMobileMenuOpen(false);
    };

    window.addEventListener('keydown', handleFunctionKey);
    return () => window.removeEventListener('keydown', handleFunctionKey);
  }, [profileOpen, session]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mobileMenuOpen]);

  const handleSectionChange = (section) => {
    setActiveSection(section);
    setVisitedSections((visited) => new Set(visited).add(section));
    setMobileMenuOpen(false);
  };

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

  const handleOpenProfile = () => {
    setProfileName(session.user.user_metadata?.display_name || '');
    setProfileBusinessName(businessName);
    setProfileLogoUrl(logoUrl);
    setProfileLogoPreview(logoUrl);
    setProfileLogoFile(null);
    setRemoveProfileLogo(false);
    setProfileEmail(session.user.email || '');
    setProfilePassword('');
    setProfileError('');
    setProfileMessage('');
    setProfileOpen(true);
  };

  const handleProfileLogoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setProfileError('لطفاً تصویر با فرمت PNG، JPG یا WebP انتخاب کنید.');
      event.target.value = '';
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setProfileError('حجم تصویر لوگو باید کمتر از ۸ مگابایت باشد.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setProfileError('پیش‌نمایش تصویر لوگو آماده نشد.');
        return;
      }
      setProfileLogoFile(file);
      setProfileLogoPreview(reader.result);
      setRemoveProfileLogo(false);
      setProfileError('');
      setProfileMessage('');
    };
    reader.onerror = () => setProfileError('خواندن فایل لوگو ناموفق بود.');
    reader.readAsDataURL(file);
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileError('');
    setProfileMessage('');

    const emailChanged = profileEmail.trim() !== (session.user.email || '');
    try {
      let logoVersion = session.user.user_metadata?.business_logo_updated_at || null;
      if (profileLogoFile) {
        const optimizedLogo = await resizeLogoToWebp(profileLogoFile);
        const { error: uploadError } = await supabase.storage
          .from(BUSINESS_LOGO_BUCKET)
          .upload(`${session.user.id}/logo.webp`, optimizedLogo, {
            cacheControl: '3600',
            contentType: 'image/webp',
            upsert: true,
          });
        if (uploadError) throw uploadError;
        logoVersion = String(Date.now());
      } else if (removeProfileLogo && logoVersion) {
        const { error: removeError } = await supabase.storage
          .from(BUSINESS_LOGO_BUCKET)
          .remove([`${session.user.id}/logo.webp`]);
        if (removeError) throw removeError;
        logoVersion = null;
      }

      const attributes = {
        data: {
          ...session.user.user_metadata,
          display_name: profileName.trim(),
          business_name: profileBusinessName.trim() || DEFAULT_BUSINESS_NAME,
          business_logo_updated_at: logoVersion,
        }
      };
      if (emailChanged) attributes.email = profileEmail.trim();
      if (profilePassword) attributes.password = profilePassword;
      const { data, error } = await supabase.auth.updateUser(attributes);
      if (error) throw error;
      if (data.user) {
        setSession((current) => current ? { ...current, user: data.user } : current);
      }
      setProfileBusinessName(data.user?.user_metadata?.business_name || DEFAULT_BUSINESS_NAME);
      setProfileLogoUrl(logoVersion
        ? `${supabase.storage.from(BUSINESS_LOGO_BUCKET).getPublicUrl(`${session.user.id}/logo.webp`).data.publicUrl}?v=${encodeURIComponent(logoVersion)}`
        : DEFAULT_LOGO_URL);
      setProfileLogoPreview(logoVersion
        ? `${supabase.storage.from(BUSINESS_LOGO_BUCKET).getPublicUrl(`${session.user.id}/logo.webp`).data.publicUrl}?v=${encodeURIComponent(logoVersion)}`
        : DEFAULT_LOGO_URL);
      setProfileLogoFile(null);
      setRemoveProfileLogo(false);
      setProfilePassword('');
      setProfileMessage(
        emailChanged
          ? 'پروفایل ذخیره شد. برای تأیید ایمیل جدید، صندوق ورودی آن را بررسی کنید.'
          : 'تغییرات پروفایل با موفقیت ذخیره شد.'
      );
    } catch (error) {
      setProfileError('ذخیره پروفایل ناموفق بود: ' + error.message);
    } finally {
      setProfileLoading(false);
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
      <main className="login-card" style={{ maxWidth: 420, margin: '10vh auto', padding: 24, direction: 'rtl', background: '#fff', borderRadius: 12, boxShadow: '0 8px 30px rgba(15, 23, 42, 0.1)' }}>
        <img src="/azho-logo.png" alt="لوگوی آژو مراسم" className="login-logo" />
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
        overflow: 'visible',
        backgroundColor: '#ffffff'
      }}
    >
      <header className="app-header">
        <button
          type="button"
          className="mobile-menu-toggle"
          aria-label={mobileMenuOpen ? 'بستن منو' : 'باز کردن منو'}
          aria-expanded={mobileMenuOpen}
          aria-controls="main-navigation"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="brand">
          <img src={logoUrl} alt={`لوگوی ${businessName}`} className="header-logo" />
          <div className="header-title">
            <h1 className="brand-title">مدیریت {businessName}</h1>
            <p className="brand-subtitle">مدیریت انبار و پیش‌فاکتورها</p>
          </div>
        </div>

        <div className="header-status">
          <span role="status" aria-live="polite" className={`offline-status offline-status-${offlineStatus}`}>
            {offlineSyncError ? 'خطا در همگام‌سازی' :
              !offlineCacheReady ? 'در حال آماده‌سازی آفلاین…' :
              offlineStatus === 'online' ? 'آنلاین' :
              offlineStatus === 'syncing' ? 'در حال همگام‌سازی…' :
                offlineStatus === 'sync-error' ? 'خطا در همگام‌سازی' :
                  offlineStatus === 'pending' ? 'تغییرات در صف همگام‌سازی' :
                    'آفلاین؛ تغییرات ذخیره می‌شوند'}
          </span>
          <span className="status-dot" />
          <span className="header-user-name">{session.user.user_metadata?.display_name || session.user.email || 'کاربر واردشده'}</span>
          <button type="button" className="profile-button" onClick={handleOpenProfile}>
            ویرایش پروفایل
          </button>
          <button type="button" onClick={handleSignOut} style={{ padding: '4px 10px', border: '1px solid #dbe5e2', background: '#fff', color: '#1e5048' }}>
            خروج
          </button>
        </div>
      </header>
      {offlineSyncError && (
        <div role="alert" style={{ margin: '10px 20px', padding: '10px 12px', borderRadius: 8, color: '#92400e', background: '#fef3c7', fontSize: 12 }}>
          {offlineSyncError} تغییرات محلی نگه داشته شده‌اند و با اتصال بعدی دوباره تلاش می‌شود.
          <button type="button" onClick={() => { setOfflineSyncError(''); syncPendingMutations(); }} style={{ marginRight: 8 }}>
            تلاش دوباره
          </button>
        </div>
      )}

      {profileOpen && (
        <div
          className="profile-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !profileLoading) setProfileOpen(false);
          }}
        >
          <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title" dir="rtl">
            <div className="profile-modal-header">
              <div>
                <p className="page-eyebrow">حساب کاربری</p>
                <h2 id="profile-modal-title">ویرایش پروفایل</h2>
              </div>
              <button
                type="button"
                className="profile-modal-close"
                aria-label="بستن"
                onClick={() => setProfileOpen(false)}
                disabled={profileLoading}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleProfileSave}>
              <label htmlFor="profile-name">نام نمایشی</label>
              <input
                id="profile-name"
                type="text"
                autoComplete="name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="نام شما"
              />
              <label htmlFor="profile-business-name">نام مجموعه / برند روی فاکتورها</label>
              <input
                id="profile-business-name"
                type="text"
                autoComplete="organization"
                maxLength={80}
                value={profileBusinessName}
                onChange={(e) => setProfileBusinessName(e.target.value)}
                placeholder={DEFAULT_BUSINESS_NAME}
              />
              <p className="profile-password-hint">این نام در سربرگ برنامه، فاکتور رسمی، پیش‌فاکتور و یادآوری‌ها نمایش داده می‌شود.</p>
              <label htmlFor="profile-business-logo">لوگوی مجموعه</label>
              <div className="business-logo-settings">
                <img src={profileLogoPreview} alt="پیش‌نمایش لوگوی مجموعه" />
                <div>
                  <input
                    id="profile-business-logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleProfileLogoChange}
                    disabled={profileLoading}
                  />
                  <p className="profile-password-hint">PNG، JPG یا WebP؛ تصویر به WebP فشرده می‌شود و حداکثر ۸ مگابایت باشد.</p>
                  {profileLogoUrl !== DEFAULT_LOGO_URL && !removeProfileLogo && (
                    <button
                      type="button"
                      className="profile-cancel-button"
                      onClick={() => {
                        setProfileLogoPreview(DEFAULT_LOGO_URL);
                        setProfileLogoFile(null);
                        setRemoveProfileLogo(true);
                      }}
                      disabled={profileLoading}
                    >
                      حذف لوگوی سفارشی
                    </button>
                  )}
                  {removeProfileLogo && <p className="profile-password-hint">لوگوی پیش‌فرض پس از ذخیره برمی‌گردد.</p>}
                </div>
              </div>
              <label htmlFor="profile-email">ایمیل</label>
              <input
                id="profile-email"
                type="email"
                autoComplete="email"
                required
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
              />
              <label htmlFor="profile-password">رمز عبور جدید</label>
              <input
                id="profile-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={profilePassword}
                onChange={(e) => setProfilePassword(e.target.value)}
                placeholder="برای حفظ رمز فعلی خالی بگذارید"
              />
              <p className="profile-password-hint">برای تغییر رمز، حداقل ۶ کاراکتر وارد کنید.</p>

              {profileError && <div className="profile-notice error" role="alert">{profileError}</div>}
              {profileMessage && <div className="profile-notice success" role="status">{profileMessage}</div>}

              <div className="profile-modal-actions">
                <button type="button" className="profile-cancel-button" onClick={() => setProfileOpen(false)} disabled={profileLoading}>
                  بستن
                </button>
                <button type="submit" className="profile-save-button" disabled={profileLoading}>
                  {profileLoading ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {authError && <div role="alert" style={{ margin: '12px 20px', padding: 10, borderRadius: 6, color: '#b91c1c', background: '#fee2e2' }}>{authError}</div>}

      <div className="app-layout">
        {mobileMenuOpen && (
          <button
            type="button"
            className="mobile-menu-backdrop"
            aria-label="بستن منو"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
        <aside className={`sidebar ${mobileMenuOpen ? 'mobile-menu-open' : ''}`} id="main-navigation">
          <p className="sidebar-label">منوی اصلی</p>

          <nav className="section-nav" aria-label="بخش‌های برنامه">
            {/* 1. مشتریان */}
            <button
              type="button"
              className={`nav-button ${activeSection === "customers" ? "active" : ""}`}
              aria-keyshortcuts="F1"
              onClick={() => handleSectionChange("customers")}
            >
              <span className="nav-icon">👤</span>
              <span className="nav-text">مشتریان</span>
              <span className="nav-shortcut">F1</span>
            </button>

            {/* 2. موجودی انبار */}
            <button
              type="button"
              className={`nav-button ${activeSection === "inventory" ? "active" : ""}`}
              aria-keyshortcuts="F2"
              onClick={() => handleSectionChange("inventory")}
            >
              <span className="nav-icon">▦</span>
              <span className="nav-text">موجودی انبار</span>
              <span className="nav-count">{formatDisplay(inventory.length)}</span>
              <span className="nav-shortcut">F2</span>
            </button>

            {/* 3. پیش‌فاکتور */}
            <button
              type="button"
              className={`nav-button ${activeSection === "quotations" ? "active" : ""}`}
              aria-keyshortcuts="F3"
              onClick={() => handleSectionChange("quotations")}
            >
              <span className="nav-icon">▤</span>
              <span className="nav-text">پیش‌فاکتور</span>
              <span className="nav-count">{formatDisplay(selectedItems.length)}</span>
              <span className="nav-shortcut">F3</span>
            </button>

            {/* 4. فاکتور رسمی */}
            <button
              type="button"
              className={`nav-button ${activeSection === "official" ? "active" : ""}`}
              aria-keyshortcuts="F4"
              onClick={() => handleSectionChange("official")}
            >
              <span className="nav-icon">📜</span>
              <span className="nav-text">فاکتور رسمی</span>
              <span className="nav-shortcut">F4</span>
            </button>

            {/* 5. گزارش مالی */}
            <button
              type="button"
              className={`nav-button ${activeSection === "reports" ? "active" : ""}`}
              aria-keyshortcuts="F5"
              onClick={() => handleSectionChange("reports")}
            >
              <span className="nav-icon">📊</span>
              <span className="nav-text">گزارش مالی</span>
              <span className="nav-shortcut">F5</span>
            </button>

            {/* 6. آنالیز پیشرفته */}
            <button
              type="button"
              className={`nav-button ${activeSection === "analytics" ? "active" : ""}`}
              aria-keyshortcuts="F6"
              onClick={() => handleSectionChange("analytics")}
            >
              <span className="nav-icon">📈</span>
              <span className="nav-text">آنالیز پیشرفته</span>
              <span className="nav-shortcut">F6</span>
            </button>

            {/* 7. تقویم مراسم‌ها */}
            <button
              type="button"
              className={`nav-button ${activeSection === "calendar" ? "active" : ""}`}
              aria-keyshortcuts="F7"
              onClick={() => handleSectionChange("calendar")}
            >
              <span className="nav-icon">📅</span>
              <span className="nav-text">تقویم مراسم‌ها</span>
              <span className="nav-shortcut">F7</span>
            </button>

            {/* 8. یادآوری مراسم و تسویه */}
            <button
              type="button"
              className={`nav-button ${activeSection === "reminders" ? "active" : ""}`}
              aria-keyshortcuts="F8"
              onClick={() => handleSectionChange("reminders")}
            >
              <span className="nav-icon">🔔</span>
              <span className="nav-text">یادآوری مراسم و تسویه</span>
              <span className="nav-shortcut">F8</span>
            </button>

            <button
              type="button"
              className={`nav-button ${activeSection === "tutorial" ? "active" : ""}`}
              onClick={() => handleSectionChange("tutorial")}
            >
              <span className="nav-icon">📖</span>
              <span className="nav-text">آموزش نرم‌افزار</span>
            </button>

            <button
              type="button"
              className={`nav-button ${activeSection === "contact" ? "active" : ""}`}
              onClick={() => handleSectionChange("contact")}
            >
              <span className="nav-icon">📞</span>
              <span className="nav-text">ارتباط با ما</span>
            </button>
          </nav>

          <div className="sidebar-note">
            <span className="sidebar-note-icon">✓</span>
            <p>نرم‌افزار مدیریت {businessName}.</p>
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
                  : activeSection === "reminders"
                  ? "یادآوری مراسم و پیگیری تسویه"
                  : activeSection === "tutorial"
                  ? "آموزش نرم‌افزار"
                  : "ارتباط با ما"}
              </h2>
            </div>

            {activeSection === "inventory" && (
              <button type="button" className="refresh-button" onClick={fetchData}>
                ↻ تازه‌سازی
              </button>
            )}
          </div>

          <div className="panel-container">
            {activeSection === "customers" && <CustomersPanel businessName={businessName} />}
            {activeSection === "inventory" && (
              <InventoryPanel 
                items={inventory} 
                refresh={fetchData} 
                onItemSelected={handleSelectItem} 
                onItemUpdated={handleItemUpdated} 
              />
            )}
            {activeSection === "quotations" && <QuotationPanel selectedItems={selectedItems} setSelectedItems={setSelectedItems} businessName={businessName} logoUrl={logoUrl} />}
            {activeSection === "official" && <OfficialInvoicesPanel businessName={businessName} logoUrl={logoUrl} />}
            {activeSection === "reports" && <FinancialReportPanel businessName={businessName} logoUrl={logoUrl} />}
            {activeSection === "analytics" && <AnalyticsPanel />}
            {visitedSections.has("calendar") && (
              <div style={{ display: activeSection === "calendar" ? "block" : "none" }}>
                <CalendarPanel />
              </div>
            )}
            {visitedSections.has("reminders") && (
              <div style={{ display: activeSection === "reminders" ? "block" : "none" }}>
                <RemindersPanel businessName={businessName} logoUrl={logoUrl} />
              </div>
            )}
            {activeSection === "tutorial" && <TutorialPanel />}
            {activeSection === "contact" && <ContactPanel />}
          </div>
        </section>
      </div>
    </main>
  );
}
