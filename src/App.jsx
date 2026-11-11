import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import SMSAuthPanel from './components/SMSAuthPanel';
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
import BackupPanel from './components/BackupPanel';
import CashbookPanel from './components/CashbookPanel';
import DashboardPanel from './components/DashboardPanel';
import BusinessContactsPanel from './components/BusinessContactsPanel';
import BotOrdersPanel from './components/BotOrdersPanel';
import OrganizationManagementPanel from './components/OrganizationManagementPanel';
import { useToast } from './components/useToast';
import { formatDisplay } from './styles';
import { getBusinessContact, normalizeProfileLinks } from './profileLinks';
import {
  getOfflineSyncStatus,
  readTable,
  setOfflineOrganization,
  setOfflineUser,
  subscribeOfflineSyncStatus,
  syncPendingMutations,
  warmOfflineCache,
} from './offlineSync';

const DEFAULT_BUSINESS_NAME = 'تشریفات آژو';
const DEFAULT_LOGO_URL = '/azho-logo.png';
const BUSINESS_LOGO_BUCKET = 'business-logos';
const APP_SECTION_HISTORY_KEY = '__ceremonyManagerSection';
const APP_SECTION_POPUP_HISTORY_KEY = '__ceremonyManagerPopupSection';
const getInitialActiveSection = () => {
  const section = window.history.state?.[APP_SECTION_HISTORY_KEY];
  return typeof section === 'string' ? section : 'dashboard';
};
const getOrganizationLogoUrl = (organization) => {
  if (!organization?.id || !organization.logo_updated_at) return DEFAULT_LOGO_URL;
  const publicUrl = supabase.storage
    .from(BUSINESS_LOGO_BUCKET)
    .getPublicUrl(`${organization.id}/logo.webp`).data.publicUrl;
  return `${publicUrl}?v=${encodeURIComponent(organization.logo_updated_at)}`;
};
const SECTION_BY_FUNCTION_KEY = {
  F1: 'customers',
  F2: 'inventory',
  F3: 'quotations',
  F4: 'official',
  F5: 'reports',
  F6: 'analytics',
  F7: 'calendar',
  F8: 'reminders',
  F9: 'dashboard',
};
const SECTION_PERMISSION_BY_NAV = {
  dashboard: 'dashboard',
  customers: 'customers',
  'business-contacts': 'customers',
  inventory: 'inventory',
  'bot-orders': 'bot_orders',
  quotations: 'quotations',
  official: 'official',
  backup: 'backup',
  cashbook: 'accounting',
  reports: 'accounting',
  analytics: 'accounting',
  calendar: 'calendar',
  reminders: 'calendar',
  tutorial: 'tutorial',
  contact: 'contact',
};
const SECTION_FALLBACK_ORDER = [
  'dashboard', 'customers', 'business-contacts', 'inventory', 'quotations', 'official',
  'bot-orders', 'cashbook', 'reports', 'analytics', 'calendar',
  'reminders', 'backup', 'tutorial', 'contact',
];
const GLOBAL_SEARCH_TABLES = [
  { table: 'customers', section: 'customers', label: 'مشتری' },
  { table: 'inventory', section: 'inventory', label: 'کالا' },
  { table: 'quotations', section: 'quotations', label: 'پیش‌فاکتور' },
  { table: 'invoices', section: 'official', label: 'فاکتور رسمی' },
];
const SECTION_THEME_ICONS = {
  dashboard: '📊',
  customers: '👥',
  'business-contacts': '📇',
  inventory: '📦',
  'bot-orders': '🤖',
  quotations: '🧾',
  official: '📄',
  reports: '📈',
  analytics: '💹',
  calendar: '📅',
  reminders: '🔔',
  tutorial: '🎓',
  backup: '💾',
  cashbook: '🏦',
  'organization-management': '👤',
  'organization-creation': '🏢',
  contact: '💬',
};
const SECTION_TITLES = {
  dashboard: 'داشبورد',
  customers: 'مشتریان',
  'business-contacts': 'دفترچهٔ مخاطبان کاری',
  inventory: 'موجودی انبار',
  'bot-orders': 'سفارش‌های ربات',
  quotations: 'پیش‌فاکتور',
  official: 'فاکتور رسمی',
  reports: 'گزارش مالی',
  analytics: 'آنالیز پیشرفته و سود و زیان',
  calendar: 'تقویم مراسم‌ها',
  reminders: 'یادآوری مراسم و پیگیری تسویه',
  tutorial: 'آموزش نرم‌افزار',
  backup: 'پشتیبان‌گیری و بازیابی',
  cashbook: 'صندوق و بانک',
  'organization-management': 'مدیریت کاربران و دسترسی',
  'organization-creation': 'ساخت فضای کاری جدید',
  contact: 'ارتباط با ما',
};

const normalizeSearchText = (value) => String(value ?? '')
  .toLocaleLowerCase('fa-IR')
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/\s+/g, ' ')
  .trim();

async function readAllTableRows(table) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const result = await readTable(table, {
      orderBy: 'id',
      ascending: false,
      limit: pageSize,
      offset,
    });
    if (result.error) return result;
    rows.push(...(result.data || []));
    if ((result.data || []).length < pageSize) return { data: rows, error: null };
  }
}

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
  const { toast } = useToast();
  const applyServiceWorkerUpdate = useRef(false);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [organizationMemberships, setOrganizationMemberships] = useState([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState(null);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [organizationError, setOrganizationError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileLogoUrl, setProfileLogoUrl] = useState(DEFAULT_LOGO_URL);
  const [profileLogoPreview, setProfileLogoPreview] = useState(DEFAULT_LOGO_URL);
  const [profileLogoFile, setProfileLogoFile] = useState(null);
  const [removeProfileLogo, setRemoveProfileLogo] = useState(false);
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [profileWebsite, setProfileWebsite] = useState('');
  const [profileBusinessEmail, setProfileBusinessEmail] = useState('');
  const [profileInstagram, setProfileInstagram] = useState('');
  const [profileTelegram, setProfileTelegram] = useState('');
  const [profileRubika, setProfileRubika] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [telegramReminderStatus, setTelegramReminderStatus] = useState(null);
  const [telegramReminderCode, setTelegramReminderCode] = useState('');
  const [telegramReminderLoading, setTelegramReminderLoading] = useState(false);
  const [telegramReminderError, setTelegramReminderError] = useState('');
  const [telegramReminderMessage, setTelegramReminderMessage] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [windowMode, setWindowMode] = useState('normal');
  const windowRestoreModeRef = useRef('normal');
  const [activeSection, setActiveSection] = useState(getInitialActiveSection);
  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;
  const [sectionPopup, setSectionPopup] = useState(() => {
    const section = window.history.state?.[APP_SECTION_POPUP_HISTORY_KEY];
    return typeof section === 'string' ? section : null;
  });
  const sectionPopupRef = useRef(sectionPopup);
  const sectionPopupTriggerRef = useRef(null);
  const sectionPopupCloseButtonRef = useRef(null);
  const handleSectionChangeRef = useRef(null);
  const [visitedSections, setVisitedSections] = useState(() => new Set([getInitialActiveSection()]));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState(getOfflineSyncStatus);
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine);
  const [offlineCacheUserId, setOfflineCacheUserId] = useState(null);
  const [offlineSyncError, setOfflineSyncError] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState([]);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const backLayerStateRef = useRef({});
  backLayerStateRef.current = { profileOpen, profileLoading, mobileMenuOpen, globalSearchOpen, sectionPopup };
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [globalSearchError, setGlobalSearchError] = useState('');
  const [globalSearchRevision, setGlobalSearchRevision] = useState(0);
  const [botOrderNotification, setBotOrderNotification] = useState(null);
  const globalSearchCache = useRef(null);
  const [inventory, setInventory] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const sessionUserId = session?.user?.id;
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    let active = true;
    let registration;
    let updateAnnounced = false;
    const showUpdate = () => {
      if (!active || updateAnnounced || !registration?.waiting || !navigator.serviceWorker.controller) return;
      updateAnnounced = true;
      toast('info', 'نسخهٔ جدید آماده است.', {
        action: {
          label: 'بارگذاری مجدد',
          onClick: () => {
            applyServiceWorkerUpdate.current = true;
            registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
          },
        },
      });
    };
    const watchInstallingWorker = () => {
      const installing = registration?.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed') showUpdate();
        if (installing.state === 'activated') checkForUpdates();
      });
    };
    const reloadAfterUpdate = () => {
      if (applyServiceWorkerUpdate.current) window.location.reload();
    };
    const checkForUpdates = () => {
      if (!registration?.active || registration.installing || registration.waiting) return;
      registration.update().catch((error) => console.error('بررسی نسخهٔ جدید ناموفق بود:', error));
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdates();
    };
    const updateCheckTimer = window.setInterval(checkForUpdates, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', checkWhenVisible);
    navigator.serviceWorker.addEventListener('controllerchange', reloadAfterUpdate);
    navigator.serviceWorker.getRegistration().then((currentRegistration) => {
      if (!active) return;
      registration = currentRegistration;
      if (!registration) return;
      registration.addEventListener('updatefound', watchInstallingWorker);
      watchInstallingWorker();
      showUpdate();
      checkForUpdates();
    }).catch((error) => console.error('دریافت وضعیت سرویس‌ورکر ناموفق بود:', error));
    return () => {
      active = false;
      window.clearInterval(updateCheckTimer);
      document.removeEventListener('visibilitychange', checkWhenVisible);
      registration?.removeEventListener('updatefound', watchInstallingWorker);
      navigator.serviceWorker.removeEventListener('controllerchange', reloadAfterUpdate);
    };
  }, [toast]);
  const activeOrganizationMembership = organizationMemberships.find(
    (membership) => membership.organization_id === activeOrganizationId,
  ) || null;
  const activeOrganization = activeOrganizationMembership?.organizations || null;
  const isOrganizationAdmin = ['owner', 'admin'].includes(activeOrganizationMembership?.role);
  const hasSectionAccess = useCallback((section) => {
    if (section === 'organization-creation') return Boolean(activeOrganizationMembership);
    if (isOrganizationAdmin) return true;
    const permission = SECTION_PERMISSION_BY_NAV[section] || section;
    return Boolean(activeOrganizationMembership?.section_permissions?.[permission]);
  }, [activeOrganizationMembership, isOrganizationAdmin]);
  useEffect(() => {
    sectionPopupRef.current = sectionPopup;
  }, [sectionPopup]);
  function handleSectionChange(section) {
    if (
      (section === 'organization-management' && !isOrganizationAdmin)
      || (section !== 'organization-management' && !hasSectionAccess(section))
    ) return;
    if (section === activeSection && !sectionPopup) {
      setMobileMenuOpen(false);
      return;
    }

    if (!sectionPopup) {
      const trigger = mobileMenuOpen
        ? document.querySelector('.mobile-menu-toggle')
        : document.activeElement;
      if (trigger instanceof HTMLElement) sectionPopupTriggerRef.current = trigger;
    }
    const nextHistoryState = {
      ...(window.history.state || {}),
      [APP_SECTION_HISTORY_KEY]: activeSection,
      [APP_SECTION_POPUP_HISTORY_KEY]: section,
    };
    if (sectionPopup) window.history.replaceState(nextHistoryState, '');
    else window.history.pushState(nextHistoryState, '');
    setSectionPopup(section);
    setVisitedSections((visited) => new Set(visited).add(section));
    setMobileMenuOpen(false);
    if (profileOpen) setProfileOpen(false);
  }
  useEffect(() => {
    handleSectionChangeRef.current = handleSectionChange;
  });
  const closeSectionPopup = useCallback(() => {
    if (!sectionPopup) return;
    const nextHistoryState = { ...(window.history.state || {}) };
    delete nextHistoryState[APP_SECTION_POPUP_HISTORY_KEY];
    window.history.replaceState(nextHistoryState, '');
    setSectionPopup(null);
  }, [sectionPopup]);
  const offlineScopeId = sessionUserId && activeOrganizationId
    ? `${sessionUserId}:${activeOrganizationId}`
    : null;
  const offlineCacheReady = Boolean(offlineScopeId && offlineCacheUserId === offlineScopeId);
  const businessName = activeOrganization?.name
    || session?.user?.user_metadata?.business_name?.trim()
    || DEFAULT_BUSINESS_NAME;
  const logoUrl = getOrganizationLogoUrl(activeOrganization);
  const profileMetadata = session?.user?.user_metadata || {};
  const businessContact = getBusinessContact(profileMetadata);
  const minimizedWebsiteUrl = businessContact.website;
  const minimizedSocialLinks = businessContact.socialLinks;
  const minimizedWebsiteInvalid = Boolean(profileMetadata.business_website && !minimizedWebsiteUrl);

  useEffect(() => {
    let mounted = true;
    let authStateChanged = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authStateChanged = true;
      if (mounted) {
        setSession(nextSession);
        setOfflineUser(nextSession?.user?.id);
        setAuthError('');
        setAuthReady(true);
        if (!nextSession) {
          setOrganizationMemberships([]);
          setActiveOrganizationId(null);
          setOfflineOrganization(null);
          setInventory([]);
          setSelectedItems([]);
        }
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted || authStateChanged) return;
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
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);
    window.addEventListener('offline-sync-error', handleSyncError);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      unsubscribe();
      window.removeEventListener('offline-sync-error', handleSyncError);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // تابع دریافت داده‌ها
  const fetchData = async () => {
    try {
      const { data, error } = await readTable('inventory', {
        orderBy: 'sort_order',
        ascending: true,
      });
      if (error) throw error;
      setInventory(data || []);
    } catch (error) {
      console.error('خطا در دریافت اطلاعات:', error.message);
    }
  };

  const refreshOrganizationMemberships = useCallback(async (preferredOrganizationId) => {
    if (!sessionUserId) return [];
    setOrganizationLoading(true);
    setOrganizationError('');
    try {
      const { data, error } = await supabase
        .from('organization_memberships')
        .select('organization_id,user_id,role,section_permissions,organizations(id,name,is_initial,logo_updated_at)')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const memberships = data || [];
      setOrganizationMemberships(memberships);
      const preferred = memberships.find((membership) => (
        membership.organization_id === preferredOrganizationId
      ));
      const selected = preferred || memberships[0] || null;
      setActiveOrganizationId(selected?.organization_id || null);
      setOfflineOrganization(selected?.organization_id || null);
      return memberships;
    } catch (error) {
      setOrganizationError(error.message);
      setActiveOrganizationId(null);
      setOfflineOrganization(null);
      throw error;
    } finally {
      setOrganizationLoading(false);
    }
  }, [sessionUserId]);

  useEffect(() => {
    if (!sessionUserId) {
      setOrganizationMemberships([]);
      setActiveOrganizationId(null);
      setOfflineOrganization(null);
      setOrganizationLoading(false);
      return undefined;
    }
    let active = true;
    setOrganizationMemberships([]);
    setActiveOrganizationId(null);
    setOfflineOrganization(null);
    setOrganizationLoading(true);
    refreshOrganizationMemberships().catch((error) => {
      if (active) console.error('بارگیری فضای کاری ناموفق بود:', error.message);
    });
    return () => { active = false; };
  }, [sessionUserId, refreshOrganizationMemberships]);

  useEffect(() => {
    if (!activeOrganizationMembership || hasSectionAccess(activeSection)) return;
    const fallbackSection = SECTION_FALLBACK_ORDER.find((section) => hasSectionAccess(section));
    const nextSection = fallbackSection || (isOrganizationAdmin ? 'organization-management' : 'organization-creation');
    activeSectionRef.current = nextSection;
    setActiveSection(nextSection);
    setVisitedSections((visited) => new Set(visited).add(nextSection));
  }, [
    activeOrganizationId,
    activeOrganizationMembership,
    activeSection,
    isOrganizationAdmin,
    hasSectionAccess,
  ]);

  useEffect(() => {
    if (!sectionPopup) return;
    if (
      (sectionPopup === 'organization-management' && isOrganizationAdmin)
      || (sectionPopup !== 'organization-management' && hasSectionAccess(sectionPopup))
    ) return;
    closeSectionPopup();
  }, [closeSectionPopup, hasSectionAccess, isOrganizationAdmin, sectionPopup]);

  useEffect(() => {
    if (session && activeOrganizationId && hasSectionAccess('inventory')) fetchData();
    else setInventory([]);
  }, [session, activeOrganizationId, activeOrganizationMembership, hasSectionAccess]);

  useEffect(() => {
    const refreshSearchCache = () => {
      globalSearchCache.current = null;
      setGlobalSearchRevision((revision) => revision + 1);
    };
    window.addEventListener('offline-data-updated', refreshSearchCache);
    return () => window.removeEventListener('offline-data-updated', refreshSearchCache);
  }, []);

  useEffect(() => {
    const query = normalizeSearchText(globalSearch);
    if (!sessionUserId || !activeOrganizationId || query.length < 2) return undefined;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        let rows = globalSearchCache.current?.scopeId === offlineScopeId
          ? globalSearchCache.current.rows
          : null;
        let searchError = '';
        if (!rows) {
          const tables = await Promise.all(GLOBAL_SEARCH_TABLES.map(async ({ table, label }) => {
            const { data, error } = await readAllTableRows(table);
            return {
              table,
              label,
              data: data || [],
              error: error ? `${label}: ${error.message}` : '',
            };
          }));
          rows = tables.flatMap(({ table, data }) => data.map((row) => ({ table, row })));
          searchError = tables.map((result) => result.error).filter(Boolean).join('؛ ');
          if (!cancelled && !searchError) globalSearchCache.current = { scopeId: offlineScopeId, rows };
        }
        const matches = rows.flatMap(({ table, row }) => {
            const { section, label } = GLOBAL_SEARCH_TABLES.find((source) => source.table === table);
            const items = row.items_data || row.items_json || [];
            const values = [
              row.id,
              row['Full name'],
              row.customer_name,
              row.phone,
              row.address,
              row.customer_phone,
              ...(Array.isArray(items) ? items.map((item) => item.title || item.item_name || item.name) : []),
            ];
            if (!hasSectionAccess(section) || !values.some((value) => normalizeSearchText(value).includes(query))) return [];
            const name = row['Full name'] || row.customer_name || row.title || `شمارهٔ ${formatDisplay(row.id)}`;
            const detail = row.phone || row.customer_phone || (row.total_price ? `${formatDisplay(row.total_price)} تومان` : '');
            return [{ id: `${table}-${row.id}`, section, label, name, detail }];
          });
        if (cancelled) return;
        setGlobalSearchResults(matches.slice(0, 15));
        setGlobalSearchError(searchError);
      } catch (error) {
        if (!cancelled) {
          setGlobalSearchResults([]);
          setGlobalSearchError(`جستجو ناموفق بود: ${error.message}`);
        }
      } finally {
        if (!cancelled) setGlobalSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    globalSearch,
    globalSearchRevision,
    sessionUserId,
    activeOrganizationId,
    offlineScopeId,
    activeOrganizationMembership,
    hasSectionAccess,
  ]);

  useEffect(() => {
    if (!sessionUserId || !activeOrganizationId) return undefined;
    let mounted = true;
    warmOfflineCache().then(() => {
      if (mounted) setOfflineCacheUserId(offlineScopeId);
    }).catch((error) => {
      console.error('آماده‌سازی داده‌های آفلاین ناموفق بود:', error.message);
      setOfflineSyncError(error.message);
    });
    return () => { mounted = false; };
  }, [sessionUserId, activeOrganizationId, offlineScopeId]);

  useEffect(() => {
    if (!sessionUserId || !activeOrganizationId) return undefined;
    let lastRefreshAt = Date.now();
    let refreshing = false;
    let realtimeRefreshTimer;
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
    const refreshAfterRealtimeChange = () => {
      window.clearTimeout(realtimeRefreshTimer);
      realtimeRefreshTimer = window.setTimeout(async () => {
        if (!navigator.onLine || document.visibilityState === 'hidden' || refreshing) return;
        refreshing = true;
        lastRefreshAt = Date.now();
        try {
          await syncPendingMutations();
          await warmOfflineCache();
        } catch (error) {
          console.error('تازه‌سازی تغییرات زنده ناموفق بود:', error.message);
          setOfflineSyncError(error.message);
        } finally {
          refreshing = false;
        }
      }, 300);
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
    const refreshInterval = window.setInterval(refreshFromServer, 30000);
    const channel = supabase.channel(`live-data-${sessionUserId}-${activeOrganizationId}`);
    [
      'customers',
      'ceremonies',
      'events',
      'inventory',
      'quotations',
      'invoices',
      'invoice_expenses',
      'financial_accounts',
      'cash_transactions',
      'workspace_tasks',
    ].forEach((table) => {
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table,
        filter: `organization_id=eq.${activeOrganizationId}`,
      }, refreshAfterRealtimeChange);
    });
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error(`اشتراک همگام‌سازی زنده ناموفق بود: ${status}`);
      }
    });
    return () => {
      window.clearTimeout(realtimeRefreshTimer);
      window.clearInterval(refreshInterval);
      window.removeEventListener('online', refreshAfterReconnect);
      window.removeEventListener('focus', refreshFromServer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [sessionUserId, activeOrganizationId]);

  useEffect(() => {
    if (!sessionUserId || !activeOrganizationId || !hasSectionAccess('bot-orders')) {
      setBotOrderNotification(null);
      return undefined;
    }

    let mounted = true;
    let initialized = false;
    let checking = false;
    let channel;
    const knownOrderIds = new Set();
    const refreshBotOrders = async () => {
      if (checking || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const result = await readTable('bot_orders', {
          orderBy: 'created_at',
          ascending: false,
          limit: 300,
        });
        if (!mounted || result.error) return;

        const orders = result.data || [];
        if (!initialized) {
          orders.forEach((order) => knownOrderIds.add(String(order.id)));
          initialized = true;
          return;
        }
        if (result.offline) return;

        const newOrders = orders.filter((order) => (
          order.status === 'pending' && !knownOrderIds.has(String(order.id))
        ));
        orders.forEach((order) => knownOrderIds.add(String(order.id)));
        if (newOrders.length) {
          setBotOrderNotification((current) => ({
            orderId: String(newOrders[0].id),
            count: (current?.count || 0) + newOrders.length,
          }));
        }
      } catch (error) {
        console.error('بررسی سفارش‌های جدید ربات ناموفق بود:', error.message);
      } finally {
        checking = false;
      }
    };

    const startRealtimeNotifications = async () => {
      await refreshBotOrders();
      if (!mounted) return;
      channel = supabase
        .channel(`bot-order-notifications-${sessionUserId}-${activeOrganizationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'bot_orders',
            filter: `organization_id=eq.${activeOrganizationId}`,
          },
          () => { void refreshBotOrders(); },
        );
      channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`اشتراک اعلان سفارش‌های ربات ناموفق بود: ${status}`);
        }
      });
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshBotOrders();
    };
    const poll = window.setInterval(() => { void refreshBotOrders(); }, 30000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    void startRealtimeNotifications();

    return () => {
      mounted = false;
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [sessionUserId, activeOrganizationId, activeOrganizationMembership, hasSectionAccess]);

  useEffect(() => {
    const refreshInventoryCache = () => {
      if (sessionUserId && activeOrganizationId && hasSectionAccess('inventory')) fetchData();
    };
    window.addEventListener('offline-data-updated', refreshInventoryCache);
    return () => window.removeEventListener('offline-data-updated', refreshInventoryCache);
  }, [sessionUserId, activeOrganizationId, activeOrganizationMembership, hasSectionAccess]);

  useEffect(() => {
    const handleFunctionKey = (event) => {
      const section = SECTION_BY_FUNCTION_KEY[event.code] || SECTION_BY_FUNCTION_KEY[event.key];
      if (!session || !section || !hasSectionAccess(section) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || profileOpen) return;

      event.preventDefault();
      handleSectionChangeRef.current?.(section);
    };

    window.addEventListener('keydown', handleFunctionKey, true);
    return () => window.removeEventListener('keydown', handleFunctionKey, true);
  }, [
    profileOpen,
    session,
    activeOrganizationId,
    activeOrganizationMembership,
    hasSectionAccess,
  ]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (profileOpen) {
        if (!profileLoading) setProfileOpen(false);
        return;
      }
      if (mobileMenuOpen) {
        setMobileMenuOpen(false);
        return;
      }
      if (globalSearchOpen) {
        setGlobalSearchOpen(false);
        return;
      }
      const escapeEvent = new CustomEvent('app-escape', {
        detail: sectionPopup || activeSection,
        cancelable: true,
      });
      window.dispatchEvent(escapeEvent);
      if (!escapeEvent.defaultPrevented && sectionPopup) closeSectionPopup();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [activeSection, closeSectionPopup, globalSearchOpen, mobileMenuOpen, profileLoading, profileOpen, sectionPopup]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const closeMenuOnOutsidePointer = (event) => {
      if (!(event.target instanceof Element)) return;
      if (
        event.target.closest('#main-navigation')
        || event.target.closest('.mobile-menu-toggle')
      ) return;
      setMobileMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeMenuOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeMenuOnOutsidePointer, true);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!sectionPopup) {
      sectionPopupTriggerRef.current?.focus();
      sectionPopupTriggerRef.current = null;
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    sectionPopupCloseButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [sectionPopup]);

  useEffect(() => {
    if (!sessionUserId) return undefined;

    window.history.replaceState({
      ...(window.history.state || {}),
      [APP_SECTION_HISTORY_KEY]: activeSectionRef.current,
    }, '');

    const handlePopState = (event) => {
      const {
        profileOpen: isProfileOpen,
        profileLoading: isProfileLoading,
        mobileMenuOpen: isMobileMenuOpen,
        globalSearchOpen: isGlobalSearchOpen,
        sectionPopup: openSectionPopup,
      } = backLayerStateRef.current;
      if (openSectionPopup) {
        const appEscapeEvent = new CustomEvent('app-escape', {
          detail: openSectionPopup,
          cancelable: true,
        });
        window.dispatchEvent(appEscapeEvent);
        if (!appEscapeEvent.defaultPrevented) {
          sectionPopupRef.current = null;
          setSectionPopup(null);
        }
        const nextHistoryState = {
          ...(window.history.state || {}),
          [APP_SECTION_HISTORY_KEY]: activeSectionRef.current,
        };
        if (appEscapeEvent.defaultPrevented) {
          nextHistoryState[APP_SECTION_POPUP_HISTORY_KEY] = openSectionPopup;
        } else {
          delete nextHistoryState[APP_SECTION_POPUP_HISTORY_KEY];
        }
        window.history.pushState(nextHistoryState, '');
        return;
      }

      const popupSectionFromHistory = event.state?.[APP_SECTION_POPUP_HISTORY_KEY];
      if (typeof popupSectionFromHistory === 'string') {
        if (
          (popupSectionFromHistory === 'organization-management' && !isOrganizationAdmin)
          || (popupSectionFromHistory !== 'organization-management' && !hasSectionAccess(popupSectionFromHistory))
        ) return;
        sectionPopupRef.current = popupSectionFromHistory;
        setSectionPopup(popupSectionFromHistory);
        return;
      }

      let backConsumed = false;
      if (isProfileOpen) {
        if (!isProfileLoading) setProfileOpen(false);
        backConsumed = true;
      } else if (isMobileMenuOpen) {
        setMobileMenuOpen(false);
        backConsumed = true;
      } else if (isGlobalSearchOpen) {
        setGlobalSearchOpen(false);
        backConsumed = true;
      } else {
        const appEscapeEvent = new CustomEvent('app-escape', {
          detail: activeSectionRef.current,
          cancelable: true,
        });
        window.dispatchEvent(appEscapeEvent);
        backConsumed = appEscapeEvent.defaultPrevented;
      }

      if (backConsumed) {
        const nextHistoryState = {
          ...(window.history.state || {}),
          [APP_SECTION_HISTORY_KEY]: activeSectionRef.current,
        };
        if (openSectionPopup) nextHistoryState[APP_SECTION_POPUP_HISTORY_KEY] = openSectionPopup;
        window.history.pushState(nextHistoryState, '');
        return;
      }

      const section = event.state?.[APP_SECTION_HISTORY_KEY];
      if (typeof section !== 'string') return;
      if (section !== 'organization-management' && !hasSectionAccess(section)) return;
      if (section === 'organization-management' && !isOrganizationAdmin) return;
      activeSectionRef.current = section;
      setActiveSection(section);
      sectionPopupRef.current = null;
      setSectionPopup(null);
      setVisitedSections((visited) => new Set(visited).add(section));
      setMobileMenuOpen(false);
      setGlobalSearchOpen(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    sessionUserId,
    activeOrganizationId,
    activeOrganizationMembership,
    isOrganizationAdmin,
    hasSectionAccess,
  ]);

  const handleOrganizationChange = (event) => {
    const nextOrganizationId = event.target.value;
    const nextMembership = organizationMemberships.find(
      (membership) => membership.organization_id === nextOrganizationId,
    );
    if (!nextMembership) return;

    closeSectionPopup();
    setActiveOrganizationId(nextOrganizationId);
    setOfflineOrganization(nextOrganizationId);
    setOfflineCacheUserId(null);
    setInventory([]);
    setSelectedItems([]);
    setBotOrderNotification(null);
    setGlobalSearch('');
    setGlobalSearchResults([]);
    globalSearchCache.current = null;
    const allowed = (section) => (
      ['owner', 'admin'].includes(nextMembership.role)
      || Boolean(nextMembership.section_permissions?.[SECTION_PERMISSION_BY_NAV[section] || section])
    );
    const nextSection = SECTION_FALLBACK_ORDER.find(allowed)
      || (['owner', 'admin'].includes(nextMembership.role) ? 'organization-management' : 'organization-creation');
    activeSectionRef.current = nextSection;
    setActiveSection(nextSection);
    setVisitedSections(new Set([nextSection]));
  };

  const handleOrganizationCreated = async (organization) => {
    closeSectionPopup();
    await refreshOrganizationMemberships(organization?.id);
    setActiveSection('dashboard');
    activeSectionRef.current = 'dashboard';
    setVisitedSections(new Set(['dashboard']));
  };
  const handleSignIn = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    setAuthMessage('');
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

  const handleSignUp = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    setAuthMessage('');
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { phone_number: phone.trim() },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      setPassword('');
      if (!data.session) {
        setAuthMessage('اگر این ایمیل قابل ثبت باشد، لینک تأیید برای آن ارسال می‌شود. پس از تأیید ایمیل وارد برنامه شوید.');
      }
    } catch (error) {
      setAuthError('خطا در ثبت‌نام: ' + error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    closeSectionPopup();
    setAuthError('');
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError('خطا در خروج: ' + error.message);
    else {
      setInventory([]);
      setSelectedItems([]);
    }
  };

  const refreshTelegramReminderStatus = async () => {
    if (!activeOrganizationId) return;
    setTelegramReminderLoading(true);
    setTelegramReminderError('');
    try {
      const { data, error } = await supabase.rpc('get_telegram_reminder_link', {
        p_organization_id: activeOrganizationId,
      });
      if (error) throw error;
      setTelegramReminderStatus(data);
    } catch (error) {
      setTelegramReminderError(`دریافت وضعیت تلگرام ناموفق بود: ${error.message}`);
    } finally {
      setTelegramReminderLoading(false);
    }
  };

  const handleOpenProfile = () => {
    setProfileName(session.user.user_metadata?.display_name || '');
    setProfileWebsite(session.user.user_metadata?.business_website || '');
    setProfileBusinessEmail(session.user.user_metadata?.business_email || '');
    setProfileInstagram(session.user.user_metadata?.instagram_id || '');
    setProfileTelegram(session.user.user_metadata?.telegram_id || '');
    setProfileRubika(session.user.user_metadata?.rubika_id || '');
    setProfileLogoUrl(logoUrl);
    setProfileLogoPreview(logoUrl);
    setProfileLogoFile(null);
    setRemoveProfileLogo(false);
    setProfileEmail(session.user.email || '');
    setProfilePassword('');
    setProfileError('');
    setProfileMessage('');
    setTelegramReminderStatus(null);
    setTelegramReminderCode('');
    setTelegramReminderError('');
    setTelegramReminderMessage('');
    setProfileOpen(true);
    if (activeOrganizationId && hasSectionAccess('calendar')) refreshTelegramReminderStatus();
  };

  const createTelegramReminderCode = async () => {
    setTelegramReminderLoading(true);
    setTelegramReminderError('');
    setTelegramReminderMessage('');
    try {
      const { data, error } = await supabase.rpc('create_telegram_reminder_link', {
        p_organization_id: activeOrganizationId,
      });
      if (error) throw error;
      setTelegramReminderCode(data);
      setTelegramReminderMessage('کد تا ۱۵ دقیقه معتبر است؛ آن را در گفت‌وگوی خصوصی ربات با دستور /link ارسال کنید.');
    } catch (error) {
      setTelegramReminderError(`ساخت کد اتصال ناموفق بود: ${error.message}`);
    } finally {
      setTelegramReminderLoading(false);
    }
  };

  const disconnectTelegramReminders = async () => {
    setTelegramReminderLoading(true);
    setTelegramReminderError('');
    setTelegramReminderMessage('');
    try {
      const { error } = await supabase.rpc('unlink_telegram_reminder', {
        p_organization_id: activeOrganizationId,
      });
      if (error) throw error;
      setTelegramReminderStatus({ connected: false });
      setTelegramReminderCode('');
      setTelegramReminderMessage('اتصال تلگرام قطع شد و اعلان‌های این فضا ارسال نمی‌شوند.');
    } catch (error) {
      setTelegramReminderError(`قطع اتصال تلگرام ناموفق بود: ${error.message}`);
    } finally {
      setTelegramReminderLoading(false);
    }
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
    setProfileError('');
    setProfileMessage('');

    let profileLinks;
    try {
      profileLinks = normalizeProfileLinks({
        website: profileWebsite,
        email: profileBusinessEmail,
        instagram: profileInstagram,
        telegram: profileTelegram,
        rubika: profileRubika,
      });
    } catch (error) {
      setProfileError(error.message);
      return;
    }

    setProfileLoading(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      let activeSession = sessionData.session;
      if (!activeSession) {
        const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          throw new Error('نشست ورود شما معتبر نیست. لطفاً دوباره وارد حساب شوید و سپس پروفایل را ذخیره کنید.');
        }
        activeSession = refreshedData.session;
      }
      if (!activeSession) {
        throw new Error('نشست ورود شما معتبر نیست. لطفاً دوباره وارد حساب شوید و سپس پروفایل را ذخیره کنید.');
      }

      const emailChanged = profileEmail.trim() !== (activeSession.user.email || '');
      let updatedOrganization = activeOrganization;
      if (profileLogoFile || removeProfileLogo) {
        if (!isOrganizationAdmin || !activeOrganizationId) {
          throw new Error('فقط مدیر فضای کاری می‌تواند لوگوی مجموعه را تغییر دهد.');
        }

        const logoVersion = profileLogoFile ? new Date().toISOString() : null;
        const logoPath = `${activeOrganizationId}/logo.webp`;
        if (profileLogoFile) {
          const optimizedLogo = await resizeLogoToWebp(profileLogoFile);
          const { error: uploadError } = await supabase.storage
            .from(BUSINESS_LOGO_BUCKET)
            .upload(logoPath, optimizedLogo, {
              cacheControl: '3600',
              contentType: 'image/webp',
              upsert: true,
            });
          if (uploadError) throw uploadError;
        } else {
          const { error: removeError } = await supabase.storage
            .from(BUSINESS_LOGO_BUCKET)
            .remove([logoPath]);
          if (removeError) throw removeError;
        }

        const { error: logoVersionError } = await supabase.rpc('update_organization_logo_version', {
          p_organization_id: activeOrganizationId,
          p_logo_updated_at: logoVersion,
        });
        if (logoVersionError) throw logoVersionError;
        updatedOrganization = { ...activeOrganization, logo_updated_at: logoVersion };
        setOrganizationMemberships((memberships) => memberships.map((membership) => (
          membership.organization_id === activeOrganizationId
            ? { ...membership, organizations: updatedOrganization }
            : membership
        )));
      }

      const attributes = {
        data: {
          ...activeSession.user.user_metadata,
          display_name: profileName.trim(),
          business_website: profileLinks.website,
          business_email: profileLinks.email,
          instagram_id: profileLinks.instagram,
          telegram_id: profileLinks.telegram,
          rubika_id: profileLinks.rubika,
        }
      };
      if (emailChanged) attributes.email = profileEmail.trim();
      if (profilePassword) attributes.password = profilePassword;
      const { data, error } = await supabase.auth.updateUser(attributes);
      if (error) throw error;
      if (data.user) {
        setSession((current) => current ? { ...current, user: data.user } : activeSession);
      }
      setProfileLogoUrl(getOrganizationLogoUrl(updatedOrganization));
      setProfileLogoPreview(getOrganizationLogoUrl(updatedOrganization));
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
      <SMSAuthPanel
        isSignUp={isSignUp}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        authLoading={authLoading}
        authError={authError}
        authMessage={authMessage}
        onEmailSignIn={handleSignIn}
        onEmailSignUp={handleSignUp}
        onClearAuthMessages={() => {
          setAuthError('');
          setAuthMessage('');
        }}
        onSignInToggle={() => {
          setIsSignUp((current) => !current);
          setAuthError('');
          setAuthMessage('');
        }}
        onAuthenticated={() => {
          setAuthMessage('با موفقیت وارد سیستم شدید.');
        }}
      />
    );
  }

  if (organizationLoading) {
    return <main style={{ maxWidth: 620, margin: '15vh auto', padding: 24, textAlign: 'center' }}>در حال بارگیری فضاهای کاری…</main>;
  }

  if (organizationError) {
    return (
      <main className="login-card" style={{ maxWidth: 620, margin: '10vh auto', padding: 24, direction: 'rtl' }}>
        <h1>بارگیری فضای کاری ناموفق بود</h1>
        <p role="alert">{organizationError}</p>
        <button
          type="button"
          onClick={() => refreshOrganizationMemberships().catch((error) => setOrganizationError(error.message))}
        >
          تلاش دوباره
        </button>
        <button type="button" onClick={handleSignOut}>خروج</button>
      </main>
    );
  }

  if (!activeOrganizationId || !activeOrganizationMembership) {
    return (
      <main style={{ maxWidth: 760, margin: '8vh auto', padding: 24 }}>
        <OrganizationManagementPanel
          key="organization-creation"
          organization={null}
          membership={null}
          onOrganizationCreated={handleOrganizationCreated}
          onMembershipChanged={() => refreshOrganizationMemberships()}
        />
        <button type="button" onClick={handleSignOut}>خروج</button>
      </main>
    );
  }

  const renderSectionPage = (section, isPopup = false) => {
    let panelContent;
    if (section === 'organization-creation') {
      panelContent = (
        <OrganizationManagementPanel
          organization={null}
          membership={null}
          onOrganizationCreated={handleOrganizationCreated}
          onMembershipChanged={() => refreshOrganizationMemberships()}
        />
      );
    } else if (section === 'organization-management' && isOrganizationAdmin) {
      panelContent = (
        <OrganizationManagementPanel
          key={activeOrganizationId}
          organization={activeOrganization}
          membership={activeOrganizationMembership}
          onOrganizationCreated={handleOrganizationCreated}
          onMembershipChanged={() => refreshOrganizationMemberships(activeOrganizationId)}
        />
      );
    } else if (!hasSectionAccess(section)) {
      panelContent = <p role="alert">به این بخش دسترسی ندارید. برای دریافت دسترسی با مدیر فضای کاری تماس بگیرید.</p>;
    } else {
      panelContent = (
        <>
          {section === 'dashboard' && (
            <DashboardPanel
              onNavigate={handleSectionChange}
              businessName={businessName}
              businessContact={businessContact}
              onEditProfile={handleOpenProfile}
              canViewBusinessContacts={hasSectionAccess('business-contacts')}
              canViewCalendar={hasSectionAccess('calendar')}
            />
          )}
          {section === 'customers' && <CustomersPanel businessName={businessName} />}
          {section === 'business-contacts' && <BusinessContactsPanel organizationId={activeOrganizationId} />}
          {section === 'inventory' && (
            <InventoryPanel
              items={inventory}
              organizationId={activeOrganizationId}
              refresh={fetchData}
              onItemUpdated={handleItemUpdated}
              onItemsReordered={setInventory}
            />
          )}
          {section === 'bot-orders' && <BotOrdersPanel />}
          {section === 'quotations' && (
            <QuotationPanel
              inventoryItems={inventory}
              onItemSelected={handleSelectItem}
              onInventoryChanged={fetchData}
              selectedItems={selectedItems}
              setSelectedItems={setSelectedItems}
              businessName={businessName}
              logoUrl={logoUrl}
              businessContact={businessContact}
            />
          )}
          {section === 'official' && (
            <OfficialInvoicesPanel
              businessName={businessName}
              logoUrl={logoUrl}
              businessContact={businessContact}
            />
          )}
          {section === 'backup' && (
            <BackupPanel userId={sessionUserId} organizationId={activeOrganizationId} />
          )}
          {section === 'cashbook' && <CashbookPanel />}
          {section === 'reports' && <FinancialReportPanel businessName={businessName} logoUrl={logoUrl} />}
          {section === 'analytics' && <AnalyticsPanel />}
          {section === 'calendar' && <CalendarPanel active organizationId={activeOrganizationId} />}
          {section === 'reminders' && (
            <RemindersPanel businessName={businessName} logoUrl={logoUrl} active />
          )}
          {section === 'tutorial' && <TutorialPanel />}
          {section === 'contact' && <ContactPanel />}
          {!isPopup && section !== 'calendar' && visitedSections.has('calendar') && hasSectionAccess('calendar') && (
            <div style={{ display: 'none' }}>
              <CalendarPanel active={false} organizationId={activeOrganizationId} />
            </div>
          )}
          {!isPopup && section !== 'reminders' && visitedSections.has('reminders') && hasSectionAccess('reminders') && (
            <div style={{ display: 'none' }}>
              <RemindersPanel businessName={businessName} logoUrl={logoUrl} active={false} />
            </div>
          )}
        </>
      );
    }

    return (
      <section className={`main-content page-theme-${section}${isPopup ? ' section-popup-content' : ''}`}>
        <div className="page-heading">
          <div className="page-heading-title">
            <span className="page-heading-icon" aria-hidden="true">
              {SECTION_THEME_ICONS[section] || '✨'}
            </span>
            <div>
              <p className="page-eyebrow">مدیریت {businessName}</p>
              <h2 id={isPopup ? 'section-popup-title' : undefined}>
                {SECTION_TITLES[section] || 'بخش برنامه'}
              </h2>
            </div>
          </div>
          <div className="page-heading-actions">
            {section === 'inventory' && (
              <button type="button" className="refresh-button" onClick={fetchData}>
                ↻ تازه‌سازی
              </button>
            )}
          </div>
        </div>
        <div className="panel-container">{panelContent}</div>
      </section>
    );
  };

  const navigationSection = sectionPopup || activeSection;

  return (
    <>
      <main
        className={`app-container window-${windowMode}`}
        aria-hidden={windowMode === 'minimized' || windowMode === 'closed'}
        inert={windowMode === 'minimized' || windowMode === 'closed'}
      >
        <div className="app-window-titlebar">
          <div className="app-window-title">
            <span className="app-window-title-icon" aria-hidden="true">✦</span>
            <span>مدیریت {businessName}</span>
          </div>
          <div className="app-window-controls" role="group" aria-label="کنترل‌های پنجره">
            <button
              type="button"
              className="app-window-control minimize"
              aria-label="کوچک‌سازی"
              title="کوچک‌سازی"
              onClick={() => {
                windowRestoreModeRef.current = windowMode === 'maximized' ? 'maximized' : 'normal';
                setWindowMode('minimized');
              }}
            >
              <span aria-hidden="true">−</span>
            </button>
            <button
              type="button"
              className="app-window-control maximize"
              aria-label={windowMode === 'maximized' ? 'بازگردانی پنجره' : 'بزرگ‌نمایی'}
              title={windowMode === 'maximized' ? 'بازگردانی' : 'بزرگ‌نمایی'}
              onClick={() => {
                const nextMode = windowMode === 'maximized' ? 'normal' : 'maximized';
                windowRestoreModeRef.current = nextMode;
                setWindowMode(nextMode);
              }}
            >
              <span aria-hidden="true">{windowMode === 'maximized' ? '❐' : '□'}</span>
            </button>
            <button
              type="button"
              className="app-window-control close"
              aria-label="بستن پنجره"
              title="بستن پنجره"
              onClick={() => {
                windowRestoreModeRef.current = windowMode === 'maximized' ? 'maximized' : 'normal';
                setWindowMode('closed');
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>
      <header className="app-header" inert={Boolean(sectionPopup)}>
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

        <div
          className="global-search"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setGlobalSearchOpen(false);
          }}
        >
          <label htmlFor="global-search-input">جستجوی یکپارچه</label>
          <input
            id="global-search-input"
            type="search"
            value={globalSearch}
            onFocus={() => setGlobalSearchOpen(true)}
            onChange={(event) => {
              const value = event.target.value;
              setGlobalSearch(value);
              setGlobalSearchOpen(true);
              setGlobalSearchError('');
              if (normalizeSearchText(value).length >= 2) {
                setGlobalSearchLoading(true);
              } else {
                setGlobalSearchLoading(false);
                setGlobalSearchResults([]);
              }
            }}
            placeholder="نام، تلفن، کالا یا شماره فاکتور"
            aria-controls="global-search-results"
            aria-expanded={globalSearchOpen && normalizeSearchText(globalSearch).length >= 2}
            autoComplete="off"
          />
          {globalSearchOpen && normalizeSearchText(globalSearch).length >= 2 && (
            <div id="global-search-results" className="global-search-results" role="listbox" aria-label="نتایج جستجو">
              {globalSearchLoading && <p role="status">در حال جستجو…</p>}
              {!globalSearchLoading && globalSearchResults.length === 0 && !globalSearchError && (
                <p>موردی پیدا نشد.</p>
              )}
              {globalSearchError && <p className="global-search-error" role="alert">{globalSearchError}</p>}
              {globalSearchResults.map((result) => (
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  key={result.id}
                  onClick={() => {
                    handleSectionChange(result.section);
                    setGlobalSearch('');
                    setGlobalSearchOpen(false);
                  }}
                >
                  <span>{result.name}</span>
                  <small>{result.label}{result.detail ? ` · ${result.detail}` : ''}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="header-status">
          <span role="status" aria-live="polite" className={`offline-status offline-status-${offlineStatus}`}>
            {offlineSyncError ? 'خطا در همگام‌سازی' :
              !offlineCacheReady ? 'در حال آماده‌سازی آفلاین…' :
              !browserOnline || offlineStatus === 'offline' || offlineStatus === 'offline-pending'
                ? 'آفلاین؛ دسترسی مستقیم به پایگاه داده ندارید' :
              offlineStatus === 'server-unavailable' ? 'پایگاه داده در دسترس نیست؛ داده‌های محلی فعال‌اند' :
              offlineStatus === 'syncing' ? 'در حال همگام‌سازی…' :
                offlineStatus === 'sync-error' ? 'خطا در همگام‌سازی' :
                  offlineStatus === 'pending' ? 'آنلاین؛ همگام‌سازی در انتظار' :
                    'آنلاین'}
          </span>
          <span className="status-dot" />
        </div>
        </header>
      {botOrderNotification && (
        <div className="bot-order-notice" role="status" aria-live="polite">
          <span>
            سفارش جدید ربات ثبت شد
            {botOrderNotification.count > 1
              ? ` · ${formatDisplay(botOrderNotification.count)} سفارش جدید`
              : ` · شمارهٔ ${formatDisplay(botOrderNotification.orderId)}`}
          </span>
          <div className="bot-order-notice-actions">
            <button
              type="button"
              onClick={() => {
                handleSectionChange('bot-orders');
                setBotOrderNotification(null);
              }}
            >
              مشاهدهٔ سفارش‌ها
            </button>
            <button
              type="button"
              className="bot-order-notice-dismiss"
              aria-label="بستن اعلان سفارش جدید"
              onClick={() => setBotOrderNotification(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}
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
              <input id="profile-business-name" type="text" value={businessName} readOnly />
              <p className="profile-password-hint">نام فضای کاری از بخش «مدیریت کاربران و دسترسی» تغییر می‌کند.</p>
              <label htmlFor="profile-business-email">ایمیل مجموعه</label>
              <input
                id="profile-business-email"
                type="email"
                autoComplete="email"
                dir="ltr"
                value={profileBusinessEmail}
                onChange={(e) => setProfileBusinessEmail(e.target.value)}
                placeholder="info@example.com"
              />
              <p className="profile-password-hint">این ایمیل برای نمایش در کارت ارتباط و فاکتورهاست و با ایمیل ورود شما جداست.</p>
              <label htmlFor="profile-website">آدرس سایت مجموعه</label>
              <input
                id="profile-website"
                type="text"
                inputMode="url"
                dir="ltr"
                autoComplete="url"
                value={profileWebsite}
                onChange={(e) => setProfileWebsite(e.target.value)}
                placeholder="example.com"
              />
              <p className="profile-password-hint">در حالت کوچک‌سازی، سایت در همین صفحه نمایش داده می‌شود؛ اگر سایت نمایش درون‌برنامه‌ای را مسدود کند، می‌توانید آن را در زبانهٔ جدید باز کنید.</p>
              <label htmlFor="profile-instagram">آدرس پیج اینستاگرام</label>
              <input
                id="profile-instagram"
                type="text"
                inputMode="url"
                dir="ltr"
                value={profileInstagram}
                onChange={(e) => setProfileInstagram(e.target.value)}
                placeholder="@username یا instagram.com/username"
              />
              <label htmlFor="profile-telegram">آیدی تلگرام</label>
              <input
                id="profile-telegram"
                type="text"
                dir="ltr"
                value={profileTelegram}
                onChange={(e) => setProfileTelegram(e.target.value)}
                placeholder="@username"
              />
              <label htmlFor="profile-rubika">آیدی روبیکا</label>
              <input
                id="profile-rubika"
                type="text"
                dir="ltr"
                value={profileRubika}
                onChange={(e) => setProfileRubika(e.target.value)}
                placeholder="@username"
              />
              <label htmlFor="profile-business-logo">لوگوی مجموعه</label>
              <div className="business-logo-settings">
                <img src={profileLogoPreview} alt="پیش‌نمایش لوگوی مجموعه" />
                <div>
                  <input
                    id="profile-business-logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleProfileLogoChange}
                    disabled={profileLoading || !isOrganizationAdmin}
                  />
                  <p className="profile-password-hint">
                    {isOrganizationAdmin
                      ? 'PNG، JPG یا WebP؛ تصویر به WebP فشرده می‌شود و حداکثر ۸ مگابایت باشد.'
                      : 'برای تغییر لوگوی مجموعه، از مدیر فضای کاری بخواهید.'}
                  </p>
                  {profileLogoUrl !== DEFAULT_LOGO_URL && !removeProfileLogo && (
                    <button
                      type="button"
                      className="profile-cancel-button"
                      onClick={() => {
                        setProfileLogoPreview(DEFAULT_LOGO_URL);
                        setProfileLogoFile(null);
                        setRemoveProfileLogo(true);
                      }}
                      disabled={profileLoading || !isOrganizationAdmin}
                    >
                      حذف لوگوی سفارشی
                    </button>
                  )}
                  <button
                    type="button"
                    className={`nav-button ${navigationSection === 'organization-creation' ? 'active' : ''}`}
                    onClick={() => handleSectionChange('organization-creation')}
                  >
                    <span className="nav-icon">＋</span>
                    <span className="nav-text">ساخت فضای کاری جدید</span>
                  </button>
                  {removeProfileLogo && <p className="profile-password-hint">لوگوی پیش‌فرض پس از ذخیره برمی‌گردد.</p>}
                </div>
              </div>
              {activeOrganizationId && hasSectionAccess('calendar') && (
                <section
                  aria-labelledby="telegram-reminder-title"
                  style={{ margin: '18px 0', padding: 14, border: '1px solid #dbe3ec', borderRadius: 12 }}
                >
                  <h3 id="telegram-reminder-title" style={{ margin: '0 0 8px' }}>اعلان تلگرام مراسم‌ها</h3>
                  <p className="profile-password-hint">
                    با اتصال تلگرام، ۷ روز و ۱ روز قبل از هر مراسم پیام می‌گیرید؛ پیام شامل کارهای انجام‌نشدهٔ چک‌لیست هم هست.
                  </p>
                  {telegramReminderLoading && <p role="status">در حال بررسی اتصال تلگرام…</p>}
                  {!telegramReminderLoading && telegramReminderStatus?.connected && (
                    <p role="status">
                      تلگرام متصل است
                      {telegramReminderStatus.telegram_username
                        ? `: @${telegramReminderStatus.telegram_username}`
                        : '.'}
                    </p>
                  )}
                  {!telegramReminderLoading && !telegramReminderStatus?.connected && (
                    <p>تلگرامی برای دریافت اعلان‌های این فضای کاری متصل نیست.</p>
                  )}
                  {telegramReminderCode && (
                    <div>
                      <label htmlFor="telegram-reminder-code">کد اتصال موقت</label>
                      <input id="telegram-reminder-code" value={telegramReminderCode} readOnly dir="ltr" />
                      <p className="profile-password-hint">
                        در گفت‌وگوی خصوصی ربات، این دستور را بفرستید: <code dir="ltr">/link {telegramReminderCode}</code>
                      </p>
                    </div>
                  )}
                  {telegramReminderError && <div className="profile-notice error" role="alert">{telegramReminderError}</div>}
                  {telegramReminderMessage && <div className="profile-notice success" role="status">{telegramReminderMessage}</div>}
                  <div className="profile-modal-actions">
                    <button
                      type="button"
                      className="profile-cancel-button"
                      onClick={createTelegramReminderCode}
                      disabled={telegramReminderLoading}
                    >
                      {telegramReminderStatus?.connected ? 'اتصال دوباره / ساخت کد' : 'ساخت کد اتصال'}
                    </button>
                    <button
                      type="button"
                      className="profile-cancel-button"
                      onClick={refreshTelegramReminderStatus}
                      disabled={telegramReminderLoading}
                    >
                      بررسی اتصال
                    </button>
                    {telegramReminderStatus?.connected && (
                      <button
                        type="button"
                        className="profile-cancel-button"
                        onClick={disconnectTelegramReminders}
                        disabled={telegramReminderLoading}
                      >
                        قطع اتصال تلگرام
                      </button>
                    )}
                  </div>
                </section>
              )}
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

      <div className={`app-layout page-theme-${activeSection}`} inert={Boolean(sectionPopup)}>
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

          <div className="sidebar-account" aria-label="حساب کاربری">
            <span className="sidebar-account-name">
              {session.user.user_metadata?.display_name || session.user.email || 'کاربر واردشده'}
            </span>
            <div className="sidebar-account-actions">
              <button
                type="button"
                className="profile-button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleOpenProfile();
                }}
              >
                ویرایش پروفایل
              </button>
              <button
                type="button"
                className="sidebar-signout-button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleSignOut();
                }}
              >
                خروج
              </button>
            </div>
          </div>

          <div className="organization-switcher" dir="rtl">
            {organizationMemberships.length > 1 ? (
              <label>
                فضای کاری
                <select value={activeOrganizationId} onChange={handleOrganizationChange}>
                  {organizationMemberships.map((membership) => (
                    <option key={membership.organization_id} value={membership.organization_id}>
                      {membership.organizations?.name || 'فضای کاری'}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span>{activeOrganization?.name || businessName}</span>
            )}
          </div>

          <nav className="section-nav" aria-label="بخش‌های برنامه">
            <button
              type="button"
              className={`nav-button ${navigationSection === "dashboard" ? "active" : ""}`}
              hidden={!hasSectionAccess('dashboard')}
              aria-keyshortcuts="F9"
              onClick={() => handleSectionChange("dashboard")}
            >
              <span className="nav-icon">⌂</span>
              <span className="nav-text">داشبورد</span>
              <span className="nav-shortcut">F9</span>
            </button>

            {/* 1. مشتریان */}
            <button
              type="button"
              className={`nav-button ${navigationSection === "customers" ? "active" : ""}`}
              hidden={!hasSectionAccess('customers')}
              aria-keyshortcuts="F1"
              onClick={() => handleSectionChange("customers")}
            >
              <span className="nav-icon">👤</span>
              <span className="nav-text">مشتریان</span>
              <span className="nav-shortcut">F1</span>
            </button>

            <button
              type="button"
              className={`nav-button ${navigationSection === 'business-contacts' ? 'active' : ''}`}
              hidden={!hasSectionAccess('business-contacts')}
              onClick={() => handleSectionChange('business-contacts')}
            >
              <span className="nav-icon">📇</span>
              <span className="nav-text">دفترچهٔ مخاطبان کاری</span>
            </button>

            {/* 2. موجودی انبار */}
            <button
              type="button"
              className={`nav-button ${navigationSection === "inventory" ? "active" : ""}`}
              hidden={!hasSectionAccess('inventory')}
              aria-keyshortcuts="F2"
              onClick={() => handleSectionChange("inventory")}
            >
              <span className="nav-icon">▦</span>
              <span className="nav-text">موجودی انبار</span>
              <span className="nav-count">{formatDisplay(inventory.length)}</span>
              <span className="nav-shortcut">F2</span>
            </button>

            <button
              type="button"
              className={`nav-button ${navigationSection === "bot-orders" ? "active" : ""}`}
              hidden={!hasSectionAccess('bot-orders')}
              onClick={() => handleSectionChange("bot-orders")}
            >
              <span className="nav-icon">🛍</span>
              <span className="nav-text">سفارش‌های ربات</span>
            </button>

            {/* 3. پیش‌فاکتور */}
            <button
              type="button"
              className={`nav-button ${navigationSection === "quotations" ? "active" : ""}`}
              hidden={!hasSectionAccess('quotations')}
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
              className={`nav-button ${navigationSection === "official" ? "active" : ""}`}
              hidden={!hasSectionAccess('official')}
              aria-keyshortcuts="F4"
              onClick={() => handleSectionChange("official")}
            >
              <span className="nav-icon">📜</span>
              <span className="nav-text">فاکتور رسمی</span>
              <span className="nav-shortcut">F4</span>
            </button>

            <button
              type="button"
              className={`nav-button ${navigationSection === "backup" ? "active" : ""}`}
              hidden={!hasSectionAccess('backup')}
              onClick={() => handleSectionChange("backup")}
            >
              <span className="nav-icon">⬇</span>
              <span className="nav-text">پشتیبان‌گیری</span>
            </button>

            <button
              type="button"
              className={`nav-button ${navigationSection === "cashbook" ? "active" : ""}`}
              hidden={!hasSectionAccess('cashbook')}
              onClick={() => handleSectionChange("cashbook")}
            >
              <span className="nav-icon">💰</span>
              <span className="nav-text">صندوق و بانک</span>
            </button>

            {/* 5. گزارش مالی */}
            <button
              type="button"
              className={`nav-button ${navigationSection === "reports" ? "active" : ""}`}
              hidden={!hasSectionAccess('reports')}
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
              className={`nav-button ${navigationSection === "analytics" ? "active" : ""}`}
              hidden={!hasSectionAccess('analytics')}
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
              className={`nav-button ${navigationSection === "calendar" ? "active" : ""}`}
              hidden={!hasSectionAccess('calendar')}
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
              className={`nav-button ${navigationSection === "reminders" ? "active" : ""}`}
              hidden={!hasSectionAccess('reminders')}
              aria-keyshortcuts="F8"
              onClick={() => handleSectionChange("reminders")}
            >
              <span className="nav-icon">🔔</span>
              <span className="nav-text">یادآوری مراسم و تسویه</span>
              <span className="nav-shortcut">F8</span>
            </button>

            <button
              type="button"
              className={`nav-button ${navigationSection === "tutorial" ? "active" : ""}`}
              hidden={!hasSectionAccess('tutorial')}
              onClick={() => handleSectionChange("tutorial")}
            >
              <span className="nav-icon">📖</span>
              <span className="nav-text">آموزش نرم‌افزار</span>
            </button>

            <button
              type="button"
              className={`nav-button ${navigationSection === "contact" ? "active" : ""}`}
              hidden={!hasSectionAccess('contact')}
              onClick={() => handleSectionChange("contact")}
            >
              <span className="nav-icon">📞</span>
              <span className="nav-text">ارتباط با ما</span>
            </button>
            {isOrganizationAdmin && (
              <button
                type="button"
                className={`nav-button ${navigationSection === 'organization-management' ? 'active' : ''}`}
                onClick={() => handleSectionChange('organization-management')}
              >
                <span className="nav-icon">⚙</span>
                <span className="nav-text">مدیریت کاربران و دسترسی</span>
              </button>
            )}
          </nav>

          <div className="sidebar-note">
            <span className="sidebar-note-icon">✓</span>
            <p>نرم‌افزار مدیریت {businessName}.</p>
          </div>
        </aside>

        <nav className="mobile-bottom-nav" aria-label="ناوبری سریع">
          <button
            type="button"
            className={navigationSection === 'dashboard' ? 'active' : ''}
            hidden={!hasSectionAccess('dashboard')}
            aria-current={navigationSection === 'dashboard' ? 'page' : undefined}
            onClick={() => handleSectionChange('dashboard')}
          >
            <span aria-hidden="true">⌂</span><small>داشبورد</small>
          </button>
          <button
            type="button"
            className={navigationSection === 'customers' ? 'active' : ''}
            hidden={!hasSectionAccess('customers')}
            aria-current={navigationSection === 'customers' ? 'page' : undefined}
            onClick={() => handleSectionChange('customers')}
          >
            <span aria-hidden="true">♙</span><small>مشتریان</small>
          </button>
          <button
            type="button"
            className={navigationSection === 'calendar' ? 'active' : ''}
            hidden={!hasSectionAccess('calendar')}
            aria-current={navigationSection === 'calendar' ? 'page' : undefined}
            onClick={() => handleSectionChange('calendar')}
          >
            <span aria-hidden="true">▦</span><small>مراسم‌ها</small>
          </button>
          <button
            type="button"
            className={navigationSection === 'reminders' ? 'active' : ''}
            hidden={!hasSectionAccess('reminders')}
            aria-current={navigationSection === 'reminders' ? 'page' : undefined}
            onClick={() => handleSectionChange('reminders')}
          >
            <span aria-hidden="true">◷</span><small>یادآوری</small>
          </button>
          <button
            type="button"
            className={mobileMenuOpen ? 'active' : ''}
            aria-expanded={mobileMenuOpen}
            aria-controls="main-navigation"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">•••</span><small>بیشتر</small>
          </button>
        </nav>

        {renderSectionPage(activeSection)}
      </div>
      {sectionPopup && (
        <div
          className="section-page-popup-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSectionPopup();
          }}
        >
          <section
            className="section-page-popup"
            role="dialog"
            aria-modal="true"
            aria-labelledby="section-popup-title"
            dir="rtl"
          >
            <header className="section-page-popup-toolbar">
              <button
                ref={sectionPopupCloseButtonRef}
                type="button"
                className="section-page-popup-close"
                aria-label={`بستن ${SECTION_TITLES[sectionPopup] || 'صفحه'}`}
                title="بستن صفحه"
                onClick={closeSectionPopup}
              >
                ×
              </button>
            </header>
            {renderSectionPage(sectionPopup, true)}
          </section>
        </div>
      )}
      </main>
      {windowMode === 'minimized' && (
        <main className="minimized-site-view" dir="rtl">
          <header className="minimized-site-toolbar">
            <div className="minimized-site-brand">
              <span className="app-window-launcher-icon" aria-hidden="true">✦</span>
              <strong>{businessName}</strong>
            </div>
            <div className="minimized-site-actions">
              {minimizedWebsiteUrl && (
                <a href={minimizedWebsiteUrl} target="_blank" rel="noopener noreferrer">
                  بازکردن سایت در زبانهٔ جدید
                </a>
              )}
              <button type="button" onClick={() => setWindowMode(windowRestoreModeRef.current)}>
                بازگردانی برنامه
              </button>
            </div>
          </header>
          {minimizedWebsiteUrl ? (
            <iframe
              className="minimized-site-frame"
              src={minimizedWebsiteUrl}
              title={`وب‌سایت ${businessName}`}
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            />
          ) : (
            <section className="minimized-site-empty">
              <span className="app-window-launcher-icon" aria-hidden="true">✦</span>
              <h1>{minimizedWebsiteInvalid ? 'آدرس سایت معتبر نیست' : 'آدرس سایت ثبت نشده است'}</h1>
              <p>
                {minimizedWebsiteInvalid
                  ? 'برای نمایش سایت، آدرس معتبر را در بخش ویرایش پروفایل وارد کنید.'
                  : 'برای نمایش سایت مجموعه در این بخش، آدرس آن را در ویرایش پروفایل ثبت کنید.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setWindowMode(windowRestoreModeRef.current);
                  handleOpenProfile();
                }}
              >
                بازگردانی و ویرایش پروفایل
              </button>
            </section>
          )}
          {(minimizedSocialLinks.length > 0 || businessContact.email) && (
            <nav className="minimized-site-socials" aria-label="شبکه‌های اجتماعی مجموعه">
              <span>راه‌های ارتباطی:</span>
              {businessContact.email && (
                <a href={`mailto:${encodeURIComponent(businessContact.email)}`}>ایمیل مجموعه</a>
              )}
              {minimizedSocialLinks.map((link) => (
                <a key={link.key} href={link.href} target="_blank" rel="noopener noreferrer">
                  {link.label}
                </a>
              ))}
            </nav>
          )}
        </main>
      )}
      {windowMode === 'closed' && (
        <div className="app-window-launcher" role="status" aria-live="polite">
          <span className="app-window-launcher-icon" aria-hidden="true">✦</span>
          <span>برنامه بسته است</span>
          <button type="button" onClick={() => setWindowMode(windowRestoreModeRef.current)}>
            بازکردن برنامه
          </button>
        </div>
      )}
    </>
  );
}
