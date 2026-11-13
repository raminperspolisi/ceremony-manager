import React, { useState, useEffect } from 'react';
import { deleteRows, insertRows, payInvoiceExpense, readTable, recordCashTransaction, updateRows } from '../offlineSync';
import { formatDisplay, formatPersianDigits } from '../styles';
import FormattedNumberInput from './FormattedNumberInput';
import PersianDateInput from './PersianDateInput';
import { getInvoiceDeletionErrorMessage, updateOfficialInvoice } from '../quotationInvoice';
import { EXPENSE_CATEGORIES, formatJalaliDate, getInvoicePaymentStatus, parseJalaliDate } from '../cashbookUtils';
import { formatPersianDate } from '../dateUtils';
import { renderBusinessContactHtml } from '../profileLinks';
import { sumInvoiceExpenses } from '../invoiceExpenseUtils';
import { buildInvoicePrintHtml } from '../invoicePrintTemplate';
import EmptyState from './EmptyState';
import { useToast } from './useToast';

// مقادیر مجاز وضعیت پرداخت
const PAYMENT_STATUSES = [
  { value: 'unpaid', label: 'تسویه نشده', color: '#dc2626', bg: '#fee2e2' },
  { value: 'deposit_paid', label: 'بیعانه پرداخت شده', color: '#a16207', bg: '#fef9c3' },
  { value: 'paid', label: 'تسویه شده', color: '#16a34a', bg: '#dcfce7' }
];

const getStatusMeta = (status) =>
  PAYMENT_STATUSES.find(s => s.value === status) || PAYMENT_STATUSES[0];
const todayIsoDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const isValidIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

export default function OfficialInvoicesPanel({ businessName = 'تشریفات آژو', logoUrl = '/azho-logo.png', businessContact }) {
  const { toast, confirm } = useToast();
  const [invoices, setInvoices] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAction, setBulkAction] = useState('');
  const [detailsInvoice, setDetailsInvoice] = useState(null);
  const [invoiceExpenses, setInvoiceExpenses] = useState([]);
  const [invoiceExpenseAccounts, setInvoiceExpenseAccounts] = useState([]);
  const [invoiceExpensesLoading, setInvoiceExpensesLoading] = useState(false);
  const [invoiceExpensesError, setInvoiceExpensesError] = useState('');
  const [invoiceExpenseAccountsError, setInvoiceExpenseAccountsError] = useState('');
  const [invoiceExpenseFeedback, setInvoiceExpenseFeedback] = useState('');
  const [invoicePaymentFeedback, setInvoicePaymentFeedback] = useState('');
  const [invoiceExpenseBusy, setInvoiceExpenseBusy] = useState(false);
  const [invoicePaymentBusy, setInvoicePaymentBusy] = useState(false);
  const [invoicePaymentOpen, setInvoicePaymentOpen] = useState(false);
  const [invoicePaymentAmount, setInvoicePaymentAmount] = useState('');
  const [invoicePaymentAccountId, setInvoicePaymentAccountId] = useState('');
  const [invoicePaymentDate, setInvoicePaymentDate] = useState(() => formatJalaliDate(todayIsoDate()));
  const [editingInvoiceExpenseId, setEditingInvoiceExpenseId] = useState(null);
  const [invoiceExpenseForm, setInvoiceExpenseForm] = useState({
    category: EXPENSE_CATEGORIES[0],
    description: '',
    amount: '',
    expenseDate: todayIsoDate(),
  });
  const [expensePaymentAccounts, setExpensePaymentAccounts] = useState({});
  const [expensePaymentDate, setExpensePaymentDate] = useState(todayIsoDate());

  // حالت ویرایش فاکتور
  const [editingId, setEditingId] = useState(null);
  const [orderDate, setOrderDate] = useState('');
  const [ceremonyDate, setCeremonyDate] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customers, setCustomers] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryLoadError, setInventoryLoadError] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerListOpen, setIsCustomerListOpen] = useState(false);
  const [customerLoadError, setCustomerLoadError] = useState('');
  const [inventoryPickerOpen, setInventoryPickerOpen] = useState(false);
  const [inventorySearchTerm, setInventorySearchTerm] = useState('');
  const [editableItems, setEditableItems] = useState([]);
  const [discountAmount, setDiscountAmount] = useState('');
  const [paidAmount, setPaidAmount] = useState('');

  // حالت نمایش چک‌لیست برای هر فاکتور
  const [checklistOpenId, setChecklistOpenId] = useState(null);
  const [newChecklistTask, setNewChecklistTask] = useState('');

  // پاپ‌آپ‌های عملیات فاکتور
  const [printInvoice, setPrintInvoice] = useState(null);
  const [whatsAppInvoice, setWhatsAppInvoice] = useState(null);
  const [whatsAppPhone, setWhatsAppPhone] = useState('');

  useEffect(() => {
    fetchOfficialInvoices();
    const fetchCustomers = async () => {
      const { data, error } = await readTable('customers', { columns: 'id, "Full name", phone, address' });
      if (error) {
        setCustomerLoadError(`بارگذاری فهرست مشتریان ناموفق بود: ${error.message}`);
        return;
      }
      setCustomers(data || []);
      setCustomerLoadError('');
    };
    const fetchInventory = async () => {
      const { data, error } = await readTable('inventory', {
        columns: 'id, title, item_type, price_level1, price_level2, price_level3, base_cost',
        orderBy: 'title',
        ascending: true,
      });
      if (error) {
        setInventoryLoadError(`بارگذاری کالاهای انبار ناموفق بود: ${error.message}`);
        return;
      }
      setInventoryItems(data || []);
      setInventoryLoadError('');
    };
    fetchCustomers();
    fetchInventory();
    const refreshData = () => {
      fetchOfficialInvoices();
      fetchCustomers();
      fetchInventory();
    };
    window.addEventListener('offline-data-updated', refreshData);
    return () => window.removeEventListener('offline-data-updated', refreshData);
  }, []);

  useEffect(() => {
    if (!detailsInvoice) return undefined;
    let active = true;
    const fetchExpenseData = async () => {
      setInvoiceExpensesLoading(true);
      setInvoiceExpensesError('');
      const [expenseResult, accountResult] = await Promise.all([
        readTable('invoice_expenses', {
          filters: [{ column: 'invoice_id', operator: 'eq', value: detailsInvoice.id }],
          orderBy: 'expense_date',
          ascending: false,
        }),
        readTable('financial_accounts', { orderBy: 'account_name', ascending: true }),
      ]);
      if (!active) return;
      setInvoiceExpensesError(expenseResult.error?.message || '');
      setInvoiceExpenseAccountsError(accountResult.error?.message || '');
      if (!expenseResult.error) setInvoiceExpenses(expenseResult.data || []);
      if (!accountResult.error) setInvoiceExpenseAccounts(accountResult.data || []);
      setInvoiceExpensesLoading(false);
    };
    void fetchExpenseData();
    const refreshExpenseData = () => { void fetchExpenseData(); };
    window.addEventListener('offline-data-updated', refreshExpenseData);
    return () => {
      active = false;
      window.removeEventListener('offline-data-updated', refreshExpenseData);
    };
  }, [detailsInvoice]);

  useEffect(() => {
    const handleAppEscape = (event) => {
      if (isCustomerListOpen) {
        event.preventDefault();
        setIsCustomerListOpen(false);
        return;
      }
      if (invoicePaymentOpen) {
        event.preventDefault();
        setInvoicePaymentOpen(false);
        return;
      }
      if (inventoryPickerOpen) {
        event.preventDefault();
        setInventoryPickerOpen(false);
        return;
      }
      if (editingId !== null) {
        event.preventDefault();
        handleCancelEdit();
        return;
      }
      if (checklistOpenId !== null) {
        event.preventDefault();
        setChecklistOpenId(null);
        return;
      }
      if (printInvoice) {
        event.preventDefault();
        setPrintInvoice(null);
        return;
      }
      if (whatsAppInvoice) {
        event.preventDefault();
        setWhatsAppInvoice(null);
        return;
      }
      if (detailsInvoice) {
        event.preventDefault();
        setDetailsInvoice(null);
      }
    };
    window.addEventListener('app-escape', handleAppEscape);
    return () => window.removeEventListener('app-escape', handleAppEscape);
  }, [checklistOpenId, detailsInvoice, editingId, inventoryPickerOpen, invoicePaymentOpen, isCustomerListOpen, printInvoice, whatsAppInvoice]);

  const filteredCustomers = customers.filter((customer) => {
    const query = customerSearch.trim().toLocaleLowerCase('fa-IR');
    return query && [customer['Full name'], customer.phone].some((value) =>
      String(value ?? '').toLocaleLowerCase('fa-IR').includes(query)
    );
  }).slice(0, 8);

  // محاسبه مانده بدهی
  const calcRemaining = (total, paid) => Math.max(0, Number(total || 0) - Number(paid || 0));

  const resetInvoiceExpenseForm = () => {
    setEditingInvoiceExpenseId(null);
    setInvoiceExpenseForm({
      category: EXPENSE_CATEGORIES[0],
      description: '',
      amount: '',
      expenseDate: todayIsoDate(),
    });
  };

  const handleOpenInvoiceDetails = (invoice) => {
    setInvoiceExpenses([]);
    setInvoiceExpenseAccounts([]);
    setInvoiceExpensesError('');
    setInvoiceExpenseAccountsError('');
    setInvoiceExpenseFeedback('');
    setInvoicePaymentFeedback('');
    setInvoicePaymentOpen(false);
    setExpensePaymentAccounts({});
    resetInvoiceExpenseForm();
    setDetailsInvoice(invoice);
  };

  const handleSaveInvoiceExpense = async (event) => {
    event.preventDefault();
    if (!detailsInvoice) return;
    setInvoiceExpenseFeedback('');
    const amount = Math.round(Number(invoiceExpenseForm.amount));
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setInvoiceExpenseFeedback('مبلغ هزینه باید عدد صحیح و بیشتر از صفر باشد.');
      return;
    }
    if (!isValidIsoDate(invoiceExpenseForm.expenseDate)) {
      setInvoiceExpenseFeedback('تاریخ هزینه معتبر نیست.');
      return;
    }

    setInvoiceExpenseBusy(true);
    const expense = {
      category: invoiceExpenseForm.category,
      description: invoiceExpenseForm.description.trim(),
      amount,
      expense_date: invoiceExpenseForm.expenseDate,
    };
    const result = editingInvoiceExpenseId
      ? await updateRows('invoice_expenses', expense, [
        { column: 'id', operator: 'eq', value: editingInvoiceExpenseId },
        { column: 'invoice_id', operator: 'eq', value: detailsInvoice.id },
      ])
      : await insertRows('invoice_expenses', [{
        ...expense,
        invoice_id: detailsInvoice.id,
        is_paid: false,
      }]);
    setInvoiceExpenseBusy(false);
    if (result.error) {
      setInvoiceExpenseFeedback(`ثبت هزینه ناموفق بود: ${result.error.message}`);
      return;
    }
    if (editingInvoiceExpenseId && !result.data?.length) {
      setInvoiceExpenseFeedback('هزینه تغییر نکرد؛ ممکن است قبلاً پرداخت شده باشد.');
      return;
    }
    setInvoiceExpenseFeedback(result.offline
      ? 'هزینه ذخیره شد و پس از اتصال همگام می‌شود.'
      : 'هزینهٔ فاکتور ثبت شد.');
    resetInvoiceExpenseForm();
    window.dispatchEvent(new Event('offline-data-updated'));
  };

  const handleEditInvoiceExpense = (expense) => {
    setEditingInvoiceExpenseId(expense.id);
    setInvoiceExpenseForm({
      category: expense.category || EXPENSE_CATEGORIES[0],
      description: expense.description || '',
      amount: String(expense.amount || ''),
      expenseDate: expense.expense_date || '',
    });
  };

  const handleDeleteInvoiceExpense = async (expense) => {
    if (!await confirm('این هزینهٔ پرداخت‌نشده از فاکتور حذف شود؟')) return;
    setInvoiceExpenseBusy(true);
    setInvoiceExpenseFeedback('');
    const { error } = await deleteRows('invoice_expenses', [
      { column: 'id', operator: 'eq', value: expense.id },
      { column: 'invoice_id', operator: 'eq', value: detailsInvoice.id },
    ]);
    setInvoiceExpenseBusy(false);
    if (error) {
      setInvoiceExpenseFeedback(`حذف هزینه ناموفق بود: ${error.message}`);
      return;
    }
    if (String(editingInvoiceExpenseId) === String(expense.id)) resetInvoiceExpenseForm();
    setInvoiceExpenseFeedback('هزینهٔ پرداخت‌نشده حذف شد.');
    window.dispatchEvent(new Event('offline-data-updated'));
  };

  const handlePayInvoiceExpense = async (expense) => {
    const accountId = expensePaymentAccounts[expense.id];
    const account = invoiceExpenseAccounts.find((item) => String(item.id) === String(accountId));
    if (!account) {
      setInvoiceExpenseFeedback('برای ثبت پرداخت، حساب صندوق یا بانک را انتخاب کنید.');
      return;
    }
    if (!isValidIsoDate(expensePaymentDate)) {
      setInvoiceExpenseFeedback('تاریخ پرداخت معتبر نیست.');
      return;
    }
    setInvoiceExpenseBusy(true);
    setInvoiceExpenseFeedback('');
    const { error } = await payInvoiceExpense(expense.id, account.id, expensePaymentDate);
    setInvoiceExpenseBusy(false);
    if (error) {
      setInvoiceExpenseFeedback(`ثبت پرداخت ناموفق بود: ${error.message}`);
      return;
    }
    setInvoiceExpenseFeedback('هزینه پرداخت شد و در صندوق/بانک ثبت شد.');
  };

  const handleRecordInvoicePayment = async (event) => {
    event.preventDefault();
    if (!detailsInvoice) return;

    const account = invoiceExpenseAccounts.find(
      (item) => String(item.id) === String(invoicePaymentAccountId),
    );
    if (!account) {
      setInvoicePaymentFeedback('برای ثبت دریافت، حساب صندوق یا بانک را انتخاب کنید.');
      return;
    }

    const amount = Number(invoicePaymentAmount);
    const total = Number(detailsInvoice.total_price || detailsInvoice.total_amount || 0);
    const paid = Number(detailsInvoice.paid_amount || 0);
    const remaining = calcRemaining(total, paid);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining) {
      setInvoicePaymentFeedback(`مبلغ دریافت باید عدد صحیحی بین ۱ تا ماندهٔ فاکتور (${formatDisplay(remaining)} تومان) باشد.`);
      return;
    }

    const transactionDate = parseJalaliDate(invoicePaymentDate);
    if (!transactionDate) {
      setInvoicePaymentFeedback('تاریخ دریافت معتبر نیست.');
      return;
    }

    setInvoicePaymentBusy(true);
    setInvoicePaymentFeedback('');
    try {
      const result = await recordCashTransaction({
        transaction_type: 'income',
        amount,
        account_id: account.id,
        invoice_id: detailsInvoice.id,
        transaction_date: transactionDate,
        description: `دریافت بابت فاکتور شماره ${detailsInvoice.id}`,
      });
      if (result.error) {
        setInvoicePaymentFeedback(`ثبت دریافت ناموفق بود: ${result.error.message}`);
        return;
      }

      const newPaidAmount = paid + amount;
      const serverInvoice = result.data?.invoice;
      setDetailsInvoice((current) => current && String(current.id) === String(detailsInvoice.id)
        ? {
            ...current,
            ...(serverInvoice || {}),
            paid_amount: serverInvoice?.paid_amount ?? newPaidAmount,
            payment_status: serverInvoice?.payment_status ?? getInvoicePaymentStatus(newPaidAmount, total),
          }
        : current);
      setInvoicePaymentAmount('');
      setInvoicePaymentFeedback(result.offline
        ? 'دریافت در این دستگاه ثبت شد و پس از اتصال همگام می‌شود.'
        : `دریافت ${formatDisplay(amount)} تومان در حساب «${account.account_name}» ثبت شد.`);
      await fetchOfficialInvoices();
    } catch (error) {
      setInvoicePaymentFeedback(`ثبت دریافت ناموفق بود: ${error.message}`);
    } finally {
      setInvoicePaymentBusy(false);
    }
  };

  async function fetchOfficialInvoices() {
    const { data, error } = await readTable('invoices', { orderBy: 'created_at', ascending: false });
    if (data) setInvoices(data);
    if (error) console.error("Error fetching invoices:", error.message);
    setSelectedIds([]);
  }

  const handleToggleSelect = (id) => {
    const nextIds = selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
    setSelectedIds(nextIds);
    if (nextIds.length > 1 && bulkAction !== 'delete') setBulkAction('');
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(invoices.map(inv => inv.id));
      if (invoices.length > 1 && bulkAction !== 'delete') setBulkAction('');
    } else {
      setSelectedIds([]);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!await confirm(`آیا از حذف ${formatDisplay(selectedIds.length)} فاکتور انتخاب‌شده مطمئن هستید؟`)) return;

    const { error } = await deleteRows('invoices', [{ column: 'id', operator: 'in', value: selectedIds }]);
    if (error) {
      toast('error', `خطا در حذف گروهی فاکتورها: ${getInvoiceDeletionErrorMessage(error)}`);
    } else {
      fetchOfficialInvoices();
      toast('success', 'فاکتورهای انتخاب‌شده حذف شدند.');
    }
  };

  // انجام عملیات انتخاب‌شده روی یک فاکتور مشخص (دابل‌کلیک روی ردیف یا دکمهٔ «انجام»)
  const runInvoiceAction = async (action, invoice) => {
    if (!action) {
      toast('info', 'ابتدا از فهرست «عملیات» یک مورد را انتخاب کنید، سپس روی ردیف فاکتور دابل‌کلیک کنید.');
      return;
    }

    if (action === 'delete') {
      if (!await confirm(`آیا از حذف فاکتور #${formatPersianDigits(invoice.id)} اطمینان دارید؟`)) return;
      const { error } = await deleteRows('invoices', [{ column: 'id', operator: 'eq', value: invoice.id }]);
      if (error) toast('error', 'خطا در حذف فاکتور: ' + getInvoiceDeletionErrorMessage(error));
      else {
        fetchOfficialInvoices();
        toast('success', 'فاکتور حذف شد.');
      }
      return;
    }

    if (action === 'edit') handleStartEdit(invoice);
    if (action === 'print') setPrintInvoice(invoice);
    if (action === 'whatsapp') {
      setWhatsAppPhone(invoice.customer_phone || invoice.phone || '');
      setWhatsAppInvoice(invoice);
    }
    if (action === 'checklist') setChecklistOpenId(invoice.id);
  };

  const handleApplyBulkAction = async () => {
    if (!bulkAction) {
      toast('warning', 'ابتدا یک عملیات را انتخاب کنید.');
      return;
    }
    if (!selectedIds.length) {
      toast('warning', 'ابتدا حداقل یک فاکتور را انتخاب کنید.');
      return;
    }
    if (bulkAction === 'delete') {
      await handleDeleteSelected();
      return;
    }
    if (selectedIds.length !== 1) {
      toast('warning', 'این عملیات فقط برای یک فاکتور قابل انجام است؛ فقط یک مورد را انتخاب کنید.');
      return;
    }

    const invoice = invoices.find((item) => item.id === selectedIds[0]);
    if (!invoice) {
      toast('error', 'فاکتور انتخاب‌شده پیدا نشد. فهرست را تازه‌سازی کنید.');
      return;
    }
    await runInvoiceAction(bulkAction, invoice);
  };

  // ساخت متن پیام واتساپ برای پیش‌نمایش و ارسال
  const buildWhatsAppMessage = (inv) => {
    const paid = Number(inv.paid_amount || 0);
    const total = Number(inv.total_price || 0);
    const discount = Number(inv.discount_amount || 0);
    const remaining = calcRemaining(total, paid);
    const statusMeta = getStatusMeta(inv.payment_status);

    return `سلام ${inv.customer_name || 'مشتری عزیز'} عزیز،\n` +
      `با تشکر از انتخاب ${businessName} 🕊️\n` +
      `جزئیات فاکتور شماره #${formatPersianDigits(inv.id)}:\n` +
      `📅 تاریخ مراسم: ${inv.ceremony_date || 'تعیین نشده'}\n` +
      `🧾 جمع اقلام: ${formatDisplay(total + discount)} تومان\n` +
      `🎁 تخفیف: ${formatDisplay(discount)} تومان\n` +
      `💰 مبلغ نهایی: ${formatDisplay(total)} تومان\n` +
      `✅ مبلغ پرداختی / پیش‌پرداخت: ${formatDisplay(paid)} تومان\n` +
      `📌 مانده بدهی: ${formatDisplay(remaining)} تومان\n` +
      `🔖 وضعیت پرداخت: ${statusMeta.label}\n` +
      `در صورت داشتن هرگونه سوال در خدمت شما هستیم.`;
  };

  // ارسال پیام مستقیم به واتساپ مشتری از پاپ‌آپ
  const handleSendWhatsApp = () => {
    const digits = String(whatsAppPhone || '').replace(/\D/g, '');
    if (!digits) {
      toast('warning', 'لطفا شماره موبایل مشتری را وارد کنید.');
      return;
    }

    const cleanPhone = digits.startsWith('0') ? `98${digits.slice(1)}` : digits;
    const text = encodeURIComponent(buildWhatsAppMessage(whatsAppInvoice));
    window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
    setWhatsAppInvoice(null);
  };

  // مدیریت چک‌لیست مراسم
  const getDefaultChecklist = () => [
    { id: 1, title: 'تماس یادآوری و هماهنگی اولیه با مشتری (۲ روز مانده)', done: false },
    { id: 2, title: 'بارگیری و آماده‌سازی اقلام در انبار (۱ روز مانده)', done: false },
    { id: 3, title: 'اجرای کامل مراسم در محل (روز مراسم)', done: false }
  ];

  const handleToggleChecklistItem = async (inv, itemIndex) => {
    let currentChecklist = inv.checklist;
    if (!currentChecklist || !Array.isArray(currentChecklist)) {
      currentChecklist = getDefaultChecklist();
    }

    const updatedChecklist = currentChecklist.map((item, idx) =>
      idx === itemIndex ? { ...item, done: !item.done } : item
    );

    const { error } = await updateRows('invoices', { checklist: updatedChecklist }, [{ column: 'id', operator: 'eq', value: inv.id }]);

    if (error) {
      toast('error', `خطا در بروزرسانی چک‌لیست: ${error.message}`);
    } else {
      fetchOfficialInvoices();
    }
  };

  const handleAddChecklistItem = async (event, inv) => {
    event.preventDefault();
    const title = newChecklistTask.trim();
    if (!title) return;

    const currentChecklist = Array.isArray(inv.checklist)
      ? inv.checklist
      : getDefaultChecklist();
    const updatedChecklist = [...currentChecklist, { title, done: false }];
    const { error } = await updateRows('invoices', { checklist: updatedChecklist }, [{ column: 'id', operator: 'eq', value: inv.id }]);

    if (error) {
      toast('error', `خطا در افزودن کار به چک‌لیست: ${error.message}`);
      return;
    }

    setNewChecklistTask('');
    fetchOfficialInvoices();
  };

  // کمکی برای گرفتن قیمت فعال بر اساس سطح انتخابی کالا
  const getActiveUnitPrice = (item) => {
    const lvl = String(item.price_level || '1');
    if (lvl === '2') return Number(item.p2 ?? 0);
    if (lvl === '3') return Number(item.p3 ?? 0);
    return Number(item.p1 ?? item.price ?? 0);
  };

  const handleStartEdit = (inv) => {
    setEditingId(inv.id);
    setCustomerName(inv.customer_name || '');
    setCustomerSearch(inv.customer_name || '');
    setIsCustomerListOpen(false);
    setCustomerPhone(inv.customer_phone || inv.phone || '');
    setOrderDate(isValidIsoDate(inv.order_date) ? inv.order_date : parseJalaliDate(inv.order_date) || '');
    setCeremonyDate(isValidIsoDate(inv.ceremony_date) ? inv.ceremony_date : parseJalaliDate(inv.ceremony_date) || '');
    setCustomerAddress(inv.customer_address || '');
    setPaidAmount(inv.paid_amount || '');
    setDiscountAmount(String(inv.discount_amount || 0));

    const normalizedItems = (inv.items_data || []).map(item => {
      const lvl = String(item.price_level || '1');
      return {
        ...item,
        item_type: item.item_type || 'sale',
        inventory_id: item.inventory_id || '',
        price_level: lvl,
        p1: Number(item.p1 || item.price || 0),
        p2: Number(item.p2 || 0),
        p3: Number(item.p3 || 0),
        base_cost: Number(item.base_cost ?? item.cost ?? item.unit_cost ?? 0),
        qty: Number(item.qty || 1)
      };
    });

    setEditableItems(normalizedItems);
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...editableItems];
    updated[index][field] = value;
    setEditableItems(updated);
  };

  const handleInventoryLinkChange = (index, inventoryId) => {
    const inventoryItem = inventoryItems.find((item) => String(item.id) === inventoryId);
    setEditableItems((current) => current.map((item, itemIndex) => (
      itemIndex === index
        ? {
            ...item,
            inventory_id: inventoryId,
            ...(inventoryItem ? { item_type: inventoryItem.item_type || 'sale' } : {}),
          }
        : item
    )));
  };

  const handlePriceLevelChange = (index, level) => {
    const updated = [...editableItems];
    updated[index].price_level = String(level);
    setEditableItems(updated);
  };

  const handleUnitPriceChange = (index, value) => {
    const updated = [...editableItems];
    const item = updated[index];
    const lvl = String(item.price_level || '1');

    if (lvl === '2') item.p2 = value;
    else if (lvl === '3') item.p3 = value;
    else item.p1 = value;

    setEditableItems(updated);
  };

  const handleAddEditableItem = () => {
    setInventorySearchTerm('');
    setInventoryPickerOpen(true);
  };

  const handleAddInventoryItemToInvoice = (inventoryItem) => {
    setEditableItems((current) => [
      ...current,
      {
        title: inventoryItem.title || '',
        item_type: inventoryItem.item_type || 'sale',
        inventory_id: String(inventoryItem.id),
        rental_checkout_date: '',
        rental_return_date: '',
        price_level: '1',
        qty: 1,
        p1: Number(inventoryItem.price_level1 ?? 0),
        p2: Number(inventoryItem.price_level2 ?? 0),
        p3: Number(inventoryItem.price_level3 ?? 0),
        base_cost: Number(inventoryItem.base_cost ?? 0),
      },
    ]);
    setInventoryPickerOpen(false);
    toast('success', `«${inventoryItem.title}» به اقلام فاکتور اضافه شد.`);
  };

  const handleRemoveEditableItem = (index) => {
    setEditableItems(editableItems.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async (id) => {
    const normalizedItems = editableItems.map((item) => ({
      ...item,
      p1: Number(item.p1) || 0,
      p2: Number(item.p2) || 0,
      p3: Number(item.p3) || 0,
      base_cost: Number(item.base_cost) || 0,
      qty: Number(item.qty) || 1,
      inventory_id: Number.isSafeInteger(Number(item.inventory_id)) && Number(item.inventory_id) > 0
        ? Number(item.inventory_id)
        : null,
    }));
    const rentalItemsWithoutDates = normalizedItems.filter((item) => (
      item.inventory_id
      && item.item_type === 'rent'
      && (!item.rental_checkout_date
        || !item.rental_return_date
        || item.rental_return_date < item.rental_checkout_date)
    ));
    if (rentalItemsWithoutDates.length) {
      toast('error', 'برای هر کالای اجاره‌ای متصل به انبار، تاریخ تحویل و مهلت عودت معتبر را وارد کنید.');
      return;
    }
    if (normalizedItems.some((item) => item.inventory_id) && !navigator.onLine) {
      toast('warning', 'برای ذخیرهٔ فاکتورهای متصل به موجودی، اتصال آنلاین لازم است.');
      return;
    }
    const grossTotal = normalizedItems.reduce((sum, item) => {
      const q = Number(item.qty || 1);
      const p = getActiveUnitPrice(item);
      return sum + (q * p);
    }, 0);
    const discount = Number(discountAmount) || 0;
    if (!Number.isSafeInteger(discount) || discount < 0 || discount > grossTotal) {
      toast('error', 'مبلغ تخفیف باید عدد صحیح و بین صفر تا مبلغ کل فاکتور باشد.');
      return;
    }
    const newTotalPrice = grossTotal - discount;
    if (newTotalPrice < Number(paidAmount || 0)) {
      toast('error', 'مبلغ کل فاکتور نمی‌تواند از مبلغی که تاکنون در صندوق یا بانک دریافت شده کمتر باشد.');
      return;
    }

    try {
      await updateOfficialInvoice(id, {
        customer_name: customerName,
        customer_phone: customerPhone,
        order_date: orderDate,
        ceremony_date: ceremonyDate,
        customer_address: customerAddress,
        items_data: normalizedItems,
        discount_amount: discount,
        total_price: newTotalPrice,
        payment_status: getInvoicePaymentStatus(paidAmount, newTotalPrice),
      }, { updateRows });
      setEditingId(null);
      setIsCustomerListOpen(false);
      fetchOfficialInvoices();
    } catch (error) {
      toast('error', `خطا در ذخیره اطلاعات: ${error.message}`);
    }
  };

  // ================= چاپ فاکتور رسمی A4 =================
  const buildInvoiceHtml = (inv, autoPrint = false) => {
    const items = inv.items_data || [];
    const paid = Number(inv.paid_amount || 0);
    const total = Number(inv.total_price || 0);
    const remaining = calcRemaining(total, paid);
    const statusMeta = getStatusMeta(inv.payment_status);
    const discount = Number(inv.discount_amount || 0);
    const officialItems = items.map((item) => {
      const quantity = Number(item.qty || 1);
      const price = getActiveUnitPrice(item);
      const isRent = item.item_type === 'rent' || item.item_type === 'اجاره' || item.item_type === 'اجاره‌ای';
      const levelText = item.price_level === '2' ? 'درجه ۲' : item.price_level === '3' ? 'درجه ۳' : 'درجه ۱';
      return {
        title: item.title,
        type: isRent ? 'اجاره‌ای' : 'فروشی',
        rentalCheckoutDate: isRent ? formatPersianDate(item.rental_checkout_date) : '',
        rentalReturnDate: isRent ? formatPersianDate(item.rental_return_date) : '',
        quantity,
        prices: [{ label: levelText, unit: price, total: quantity * price }],
      };
    });

    return buildInvoicePrintHtml({
      documentType: 'فاکتور رسمی فروش و اجاره',
      businessName,
      logoUrl,
      number: formatPersianDigits(inv.id),
      createdDate: inv.created_at ? new Date(inv.created_at).toLocaleDateString('fa-IR') : '—',
      customerName: inv.customer_name,
      customerPhone: inv.customer_phone,
      customerAddress: inv.customer_address,
      orderDate: inv.order_date ? formatPersianDigits(inv.order_date) : '—',
      ceremonyDate: inv.ceremony_date ? formatPersianDigits(inv.ceremony_date) : '—',
      items: officialItems,
      totals: [
        { label: 'جمع اقلام', value: total + discount },
        { label: 'تخفیف', value: discount },
        { label: 'مبلغ نهایی', value: total, emphasis: true },
        { label: 'مبلغ پرداختی / پیش‌پرداخت', value: paid },
        { label: 'مانده بدهی', value: remaining },
        { label: 'وضعیت تسویه', text: statusMeta.label, unit: '' },
      ],
      note: 'این فاکتور رسمی شامل کالاها و خدمات ثبت‌شده در سفارش است. شرایط تحویل و عودت اقلام اجاره‌ای در شرح هر قلم درج شده است.',
      contactHtml: renderBusinessContactHtml(businessContact),
      autoPrint,
    });
  };

  // باز کردن پنجرهٔ چاپ مرورگر با همان قالب پیش‌نمایش
  const handlePrint = (inv) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast('warning', 'مرورگر اجازهٔ باز کردن پنجرهٔ چاپ را نداد؛ لطفا اجازهٔ پاپ‌آپ را فعال کنید.');
      return;
    }
    printWindow.document.write(buildInvoiceHtml(inv, true));
    printWindow.document.close();
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setIsCustomerListOpen(false);
    setInventoryPickerOpen(false);
  };

  // داده‌های پاپ‌آپ‌ها
  const checklistInvoice = invoices.find((invoice) => invoice.id === checklistOpenId) || null;
  const checklistItems = Array.isArray(checklistInvoice?.checklist)
    ? checklistInvoice.checklist
    : getDefaultChecklist();
  const filteredInventoryItems = inventoryItems.filter((item) => (
    String(item.title || '').toLocaleLowerCase('fa-IR')
      .includes(inventorySearchTerm.trim().toLocaleLowerCase('fa-IR'))
  ));
  const editableTotal = editableItems.reduce((sum, item) => sum + (Number(item.qty || 1) * getActiveUnitPrice(item)), 0);
  const editableNetTotal = Math.max(0, editableTotal - (Number(discountAmount) || 0));
  const whatsAppMessage = whatsAppInvoice ? buildWhatsAppMessage(whatsAppInvoice) : '';

  // ================= رابط کاربری =================
  return (
    <div style={{ background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
      <div className="official-invoices-toolbar">
        <div className="official-invoices-title-actions">
          <h3 style={{ margin: 0, color: '#1e293b', fontSize: '15px' }}>لیست فاکتورهای رسمی</h3>
          <div className="official-invoices-bulk-actions">
            <label className="official-invoices-action-select-label" htmlFor="official-invoices-action">عملیات</label>
            <select
              id="official-invoices-action"
              value={bulkAction}
              onChange={(event) => setBulkAction(event.target.value)}
              aria-label="عملیات روی فاکتورهای انتخاب‌شده"
            >
              <option value="">انتخاب عملیات</option>
              <option value="print" disabled={selectedIds.length > 1}>چاپ فاکتور</option>
              <option value="whatsapp" disabled={selectedIds.length > 1}>ارسال در واتساپ</option>
              <option value="checklist" disabled={selectedIds.length > 1}>نمایش چک‌لیست</option>
              <option value="edit" disabled={selectedIds.length > 1}>ویرایش فاکتور</option>
              <option value="delete">حذف فاکتور</option>
            </select>
            <button type="button" className="official-invoices-apply-button" onClick={handleApplyBulkAction}>
              انجام
            </button>
            <span className="official-invoices-hint">💡 دابل‌کلیک روی ردیف = انجام همین عملیات</span>
            <span className="official-invoices-selected-count">
              {selectedIds.length > 1
                ? `${formatDisplay(selectedIds.length)} انتخاب‌شده؛ این عملیات فقط برای یک فاکتور است`
                : `${formatDisplay(selectedIds.length)} انتخاب‌شده`}
            </span>
          </div>
        </div>
      </div>

      <div className="official-invoices-table-wrap" style={{ overflowX: 'auto' }}>
        <table className="official-invoices-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '10px', width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  onChange={handleSelectAll}
                  checked={invoices.length > 0 && selectedIds.length === invoices.length}
                />
              </th>
              <th style={{ padding: '10px' }}>شماره</th>
              <th style={{ padding: '10px' }}>نام مشتری</th>
              <th style={{ padding: '10px' }}>تاریخ مراسم</th>
              <th style={{ padding: '10px' }}>مبلغ نهایی (تومان)</th>
              <th style={{ padding: '10px' }}>پرداختی (تومان)</th>
              <th style={{ padding: '10px' }}>مانده (تومان)</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>وضعیت پرداخت</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>جزئیات</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan="9"><EmptyState
                  icon="invoice"
                  title="هنوز فاکتور رسمی ثبت نشده"
                  description="فاکتور رسمی پس از تبدیل یک پیش‌فاکتور صادر می‌شود."
                /></td>
              </tr>
            ) : (
              invoices.map((inv) => {
                const statusMeta = getStatusMeta(inv.payment_status || 'unpaid');

                return (
                  <tr
                    key={inv.id}
                    className={selectedIds.includes(inv.id) ? 'is-selected' : undefined}
                    onDoubleClick={() => void runInvoiceAction(bulkAction, inv)}
                    title="دابل‌کلیک: انجام عملیات انتخاب‌شده در فهرست «عملیات»"
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: selectedIds.includes(inv.id) ? '#f8fafc' : 'transparent',
                      cursor: 'pointer',
                      touchAction: 'manipulation'
                    }}
                  >
                    <td style={{ padding: '10px', textAlign: 'center' }} onDoubleClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(inv.id)}
                        onChange={() => handleToggleSelect(inv.id)}
                      />
                    </td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#0284c7' }}>#{formatPersianDigits(inv.id)}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold' }}>
                      <div>
                        <div>{inv.customer_name}</div>
                        {inv.customer_phone && <div style={{ fontSize: '10px', color: '#64748b' }}>{formatPersianDigits(inv.customer_phone)}</div>}
                        {inv.quotation_id && (
                          <div style={{ fontSize: '10px', color: '#15803d' }}>
                            صادرشده از پیش‌فاکتور #{formatPersianDigits(inv.quotation_id)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      {inv.ceremony_date ? formatPersianDigits(inv.ceremony_date) : <span style={{ color: '#94a3b8' }}>ثبت نشده</span>}
                    </td>
                    <td style={{ padding: '10px', color: '#0369a1' }}>
                      {formatDisplay(inv.total_price || 0)}
                    </td>
                    <td style={{ padding: '10px', color: '#0d9488' }}>
                      {formatDisplay(inv.paid_amount || 0)}
                    </td>
                    <td style={{ padding: '10px', color: calcRemaining(inv.total_price, inv.paid_amount) > 0 ? '#b45309' : '#16a34a' }}>
                      {formatDisplay(calcRemaining(inv.total_price, inv.paid_amount))}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <span style={{
                        background: statusMeta.bg,
                        color: statusMeta.color,
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap'
                      }}>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="official-invoices-actions-cell" style={{ padding: '10px', textAlign: 'center' }} onDoubleClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="official-invoice-details-button"
                        aria-label={`نمایش جزئیات فاکتور ${formatPersianDigits(inv.id)}`}
                        title="نمایش همهٔ جزئیات فاکتور"
                        onClick={() => handleOpenInvoiceDetails(inv)}
                      >
                        ◉
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* پایین: پاپ‌آپ‌های عملیات فاکتور */}

      {/* پاپ‌آپ ویرایش فاکتور */}
      {editingId !== null && (
        <div
          className="invoice-details-backdrop official-invoice-backdrop"
          onMouseDown={(event) => { if (event.target === event.currentTarget) handleCancelEdit(); }}
        >
          <section className="invoice-details-modal official-invoice-modal official-invoice-modal-wide" role="dialog" aria-modal="true" aria-labelledby="official-invoice-edit-title" dir="rtl">
            <div className="invoice-details-heading">
              <div>
                <span className="page-eyebrow">ویرایش فاکتور</span>
                <h3 id="official-invoice-edit-title">فاکتور شماره #{formatPersianDigits(editingId)}</h3>
              </div>
              <button type="button" className="invoice-details-close" onClick={handleCancelEdit} aria-label="بستن ویرایش فاکتور">×</button>
            </div>

            {inventoryLoadError && <p className="inventory-ops-message error" role="alert">{inventoryLoadError}</p>}

            <div className="official-invoice-edit-grid">
              <label className="official-invoice-edit-field">
                <span>نام مشتری</span>
                <input
                  type="text"
                  value={customerName}
                  onFocus={() => {
                    setCustomerSearch(customerName);
                    setIsCustomerListOpen(true);
                  }}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setCustomerSearch(e.target.value);
                    setIsCustomerListOpen(true);
                  }}
                  placeholder="جست‌وجوی مشتری"
                  autoComplete="off"
                />
                {isCustomerListOpen && (
                  <div className="official-invoice-customer-list">
                    {customerLoadError ? (
                      <div role="alert" className="official-invoice-customer-error">{customerLoadError}</div>
                    ) : filteredCustomers.length ? filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        className="official-invoice-customer-option"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          const name = customer['Full name'] || '';
                          setCustomerName(name);
                          setCustomerSearch(name);
                          setCustomerPhone(customer.phone || '');
                          setCustomerAddress(customer.address || '');
                          setIsCustomerListOpen(false);
                        }}
                      >
                        <span>{customer['Full name'] || 'بدون نام'}</span>
                        <small dir="ltr">{customer.phone ? formatPersianDigits(customer.phone) : 'بدون شماره'}</small>
                      </button>
                    )) : (
                      <div className="official-invoice-customer-hint">
                        {customerSearch.trim() ? 'مشتری پیدا نشد؛ نام را می‌توانید دستی وارد کنید.' : 'برای جست‌وجو نام یا شماره را بنویسید.'}
                      </div>
                    )}
                  </div>
                )}
              </label>
              <label className="official-invoice-edit-field">
                <span>موبایل</span>
                <input type="text" dir="ltr" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="09..." />
              </label>
              <label className="official-invoice-edit-field">
                <span>تاریخ سفارش</span>
                <PersianDateInput value={orderDate} onChange={setOrderDate} />
              </label>
              <label className="official-invoice-edit-field">
                <span>تاریخ مراسم</span>
                <PersianDateInput value={ceremonyDate} onChange={setCeremonyDate} />
              </label>
              <label className="official-invoice-edit-field official-invoice-edit-field-wide">
                <span>نشانی مشتری</span>
                <input type="text" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="آدرس مشتری" />
              </label>
            </div>

            <div className="official-invoice-items-head">
              <h4 className="invoice-details-items-title">مدیریت اقلام فاکتور</h4>
              <button type="button" className="official-invoice-add-item" onClick={handleAddEditableItem}>
                + افزودن قلم جدید
              </button>
            </div>

            <div className="invoice-details-items-wrap">
              <table className="invoice-details-items official-invoice-edit-items">
                <thead>
                  <tr>
                    <th>نام کالا / خدمت</th>
                    <th>نوع کالا</th>
                    <th>سطح قیمت فعال</th>
                    <th>تعداد</th>
                    <th>اتصال به انبار / بازهٔ اجاره</th>
                    <th>قیمت واحد فعال (تومان)</th>
                    <th style={{ textAlign: 'center' }}>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {editableItems.map((item, itemIdx) => (
                    <tr key={itemIdx}>
                      <td>
                        <input
                          type="text"
                          value={item.title || ''}
                          onChange={(e) => handleItemChange(itemIdx, 'title', e.target.value)}
                          style={{ width: '100%', padding: '5px', fontSize: '12px' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <select
                          value={item.item_type || 'sale'}
                          disabled={Boolean(item.inventory_id)}
                          onChange={(e) => handleItemChange(itemIdx, 'item_type', e.target.value)}
                          style={{ padding: '5px', fontSize: '12px' }}>
                          <option value="sale">فروشی</option>
                          <option value="rent">اجاره‌ای</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <select
                          value={item.price_level || '1'}
                          onChange={(e) => handlePriceLevelChange(itemIdx, e.target.value)}
                          style={{ padding: '5px', fontSize: '12px' }}>
                          <option value="1">درجه ۱ (پایه: {formatDisplay(item.p1 || 0)})</option>
                          <option value="2">درجه ۲ (پایه: {formatDisplay(item.p2 || 0)})</option>
                          <option value="3">درجه ۳ (پایه: {formatDisplay(item.p3 || 0)})</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <FormattedNumberInput
                          allowDecimal={false}
                          value={item.qty || 1}
                          onValueChange={(value) => handleItemChange(itemIdx, 'qty', Number(value))}
                          style={{ width: '60px', padding: '5px', fontSize: '12px', textAlign: 'center' }}
                        />
                      </td>
                      <td>
                        <select
                          value={item.inventory_id || ''}
                          onChange={(event) => handleInventoryLinkChange(itemIdx, event.target.value)}
                          style={{ width: '100%', padding: '5px', fontSize: '12px' }}
                        >
                          <option value="">خدمت / بدون کنترل موجودی</option>
                          {inventoryItems.map((inventoryItem) => (
                            <option key={inventoryItem.id} value={inventoryItem.id}>
                              {inventoryItem.title} — {inventoryItem.item_type === 'rent' ? 'اجاره‌ای' : 'فروشی'}
                            </option>
                          ))}
                        </select>
                        {item.inventory_id && item.item_type === 'rent' && (
                          <div style={{ display: 'grid', gap: '4px', marginTop: '5px' }}>
                            <label>
                              <span>تحویل </span>
                              <PersianDateInput
                                value={item.rental_checkout_date || ''}
                                onChange={(value) => handleItemChange(itemIdx, 'rental_checkout_date', value)}
                              />
                            </label>
                            <label>
                              <span>مهلت عودت </span>
                              <PersianDateInput
                                value={item.rental_return_date || ''}
                                onChange={(value) => handleItemChange(itemIdx, 'rental_return_date', value)}
                              />
                            </label>
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <FormattedNumberInput
                          value={getActiveUnitPrice(item)}
                          onValueChange={(value) => handleUnitPriceChange(itemIdx, value)}
                          emptyWhenZero
                          style={{ width: '110px', padding: '5px', fontSize: '12px', textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="official-invoice-remove-item"
                          onClick={() => handleRemoveEditableItem(itemIdx)}>
                          حذف قلم
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="official-invoice-payment-summary">
              <div>
                <strong style={{ color: '#0369a1' }}>جمع اقلام:</strong>{' '}
                <span style={{ color: '#0369a1', fontWeight: 'bold' }}>{formatDisplay(editableTotal)} تومان</span>
              </div>
              <label className="official-invoice-discount-field">
                <span>تخفیف (تومان)</span>
                <FormattedNumberInput
                  allowDecimal={false}
                  inputMode="numeric"
                  value={discountAmount}
                  onValueChange={setDiscountAmount}
                />
              </label>
              <div>
                <strong style={{ color: '#1d5b4b' }}>مبلغ نهایی:</strong>{' '}
                <span style={{ color: '#1d5b4b', fontWeight: 'bold' }}>{formatDisplay(editableNetTotal)} تومان</span>
              </div>
              <div>
                <strong style={{ color: '#0d9488' }}>مبلغ پرداختی (بیعانه):</strong>{' '}
                <span style={{ color: '#0d9488', fontWeight: 'bold' }}>{formatDisplay(paidAmount)} تومان</span>
                <small style={{ display: 'block', color: '#64748b', marginTop: 4 }}>مبلغ پرداختی فقط با ثبت گردش دریافت در صندوق/بانک تغییر می‌کند.</small>
              </div>
              <div>
                <strong style={{ color: '#dc2626' }}>مانده بدهی:</strong>{' '}
                <span style={{ color: '#dc2626', fontWeight: 'bold' }}>{formatDisplay(calcRemaining(editableNetTotal, paidAmount))} تومان</span>
              </div>
              <div>
                <strong style={{ color: '#334155' }}>وضعیت تسویه:</strong>{' '}
                <span style={{ color: getStatusMeta(getInvoicePaymentStatus(paidAmount, editableNetTotal)).color, fontWeight: 'bold' }}>
                  {getStatusMeta(getInvoicePaymentStatus(paidAmount, editableNetTotal)).label}
                </span>
              </div>
            </div>

            <div className="official-invoice-modal-actions">
              <button type="button" className="official-invoices-apply-button" onClick={() => handleSaveEdit(editingId)}>ذخیره تغییرات</button>
              <button type="button" className="official-invoices-cancel-button" onClick={handleCancelEdit}>انصراف</button>
            </div>
          </section>
        </div>
      )}

      {editingId !== null && inventoryPickerOpen && (
        <div
          className="quotation-inventory-picker-backdrop official-invoice-inventory-picker-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setInventoryPickerOpen(false);
          }}
        >
          <section
            className="quotation-inventory-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="official-invoice-inventory-picker-title"
            dir="rtl"
          >
            <header className="quotation-inventory-picker-heading">
              <div>
                <span className="quotation-heading-kicker">انتخاب از موجودی انبار</span>
                <h2 id="official-invoice-inventory-picker-title">افزودن اقلام به فاکتور</h2>
                <p>{formatDisplay(inventoryItems.length)} کالا در انبار ثبت شده است.</p>
              </div>
              <button
                type="button"
                aria-label="بستن فهرست اقلام انبار"
                onClick={() => setInventoryPickerOpen(false)}
              >
                ×
              </button>
            </header>
            <label className="quotation-inventory-picker-search">
              <span>جستجوی کالا</span>
              <input
                type="search"
                value={inventorySearchTerm}
                onChange={(event) => setInventorySearchTerm(event.target.value)}
                placeholder="نام کالا را وارد کنید..."
                autoFocus
              />
            </label>
            {inventoryLoadError && <p className="quotation-inventory-stock-error" role="alert">{inventoryLoadError}</p>}
            <div className="quotation-inventory-picker-list">
              {filteredInventoryItems.length === 0 ? (
                <EmptyState
                  icon={inventoryItems.length === 0 ? 'box' : 'search'}
                  title={inventoryItems.length === 0 ? 'هنوز کالایی در انبار ثبت نشده' : 'موردی پیدا نشد'}
                  description={inventoryItems.length === 0 ? 'ابتدا کالا را در بخش انبار ثبت کنید.' : 'عبارت جستجو را تغییر دهید.'}
                />
              ) : (
                <table className="quotation-inventory-picker-table">
                  <thead>
                    <tr>
                      <th>عنوان کالا</th>
                      <th>نوع</th>
                      <th>نرخ سطح ۱</th>
                      <th>روش افزودن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventoryItems.map((item) => (
                      <tr
                        key={item.id}
                        tabIndex={0}
                        title="برای افزودن کالا به فاکتور دابل‌کلیک کنید"
                        onDoubleClick={() => handleAddInventoryItemToInvoice(item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleAddInventoryItemToInvoice(item);
                          }
                        }}
                      >
                        <td>{item.title}</td>
                        <td>{item.item_type === 'rent' ? 'اجاره‌ای' : 'فروشی'}</td>
                        <td>{formatDisplay(item.price_level1 || 0)} تومان</td>
                        <td>برای افزودن دابل‌کلیک کنید</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <footer className="quotation-inventory-picker-footer">
              <span>پس از انتخاب اقلام، تعداد و جزئیات را در فاکتور ویرایش کنید.</span>
              <button type="button" onClick={() => setInventoryPickerOpen(false)}>پایان انتخاب</button>
            </footer>
          </section>
        </div>
      )}

      {/* پاپ‌آپ چک‌لیست مراسم */}
      {checklistInvoice && (
        <div
          className="invoice-details-backdrop official-invoice-backdrop"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setChecklistOpenId(null); }}
        >
          <section className="invoice-details-modal official-invoice-modal official-invoice-modal-narrow" role="dialog" aria-modal="true" aria-labelledby="official-invoice-checklist-title" dir="rtl">
            <div className="invoice-details-heading">
              <div>
                <span className="page-eyebrow">چک‌لیست مراسم</span>
                <h3 id="official-invoice-checklist-title">{checklistInvoice.customer_name || 'مشتری بدون نام'}</h3>
                <div className="official-invoice-modal-subtitle">
                  فاکتور #{formatPersianDigits(checklistInvoice.id)} — تاریخ مراسم: {checklistInvoice.ceremony_date ? formatPersianDigits(checklistInvoice.ceremony_date) : 'تعیین نشده'}
                </div>
              </div>
              <button type="button" className="invoice-details-close" onClick={() => setChecklistOpenId(null)} aria-label="بستن چک‌لیست">×</button>
            </div>

            <div className="official-invoice-checklist">
              {checklistItems.map((item, itemIdx) => (
                <label key={itemIdx} className={`official-invoice-checklist-item${item.done ? ' is-done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => handleToggleChecklistItem(checklistInvoice, itemIdx)}
                  />
                  <span>{item.title || item.text}</span>
                </label>
              ))}
            </div>

            <form className="official-invoice-checklist-form" onSubmit={(event) => handleAddChecklistItem(event, checklistInvoice)}>
              <input
                type="text"
                value={newChecklistTask}
                onChange={(event) => setNewChecklistTask(event.target.value)}
                placeholder="افزودن کار جدید به چک‌لیست..."
                aria-label="عنوان کار جدید در چک‌لیست"
                required
              />
              <button type="submit" className="official-invoice-checklist-add">افزودن</button>
            </form>

            <div className="official-invoice-modal-actions">
              <button type="button" className="official-invoices-cancel-button" onClick={() => setChecklistOpenId(null)}>بستن</button>
            </div>
          </section>
        </div>
      )}

      {/* پاپ‌آپ پیش‌نمایش و چاپ فاکتور */}
      {printInvoice && (
        <div
          className="invoice-details-backdrop official-invoice-backdrop"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setPrintInvoice(null); }}
        >
          <section className="invoice-details-modal official-invoice-modal official-invoice-modal-wide" role="dialog" aria-modal="true" aria-labelledby="official-invoice-print-title" dir="rtl">
            <div className="invoice-details-heading">
              <div>
                <span className="page-eyebrow">پیش‌نمایش چاپ</span>
                <h3 id="official-invoice-print-title">فاکتور شماره #{formatPersianDigits(printInvoice.id)}</h3>
              </div>
              <button type="button" className="invoice-details-close" onClick={() => setPrintInvoice(null)} aria-label="بستن پیش‌نمایش چاپ">×</button>
            </div>
            <iframe
              className="official-invoice-print-frame"
              title={`پیش‌نمایش فاکتور ${formatPersianDigits(printInvoice.id)}`}
              srcDoc={buildInvoiceHtml(printInvoice)}
            />
            <div className="official-invoice-modal-actions">
              <button type="button" className="official-invoices-apply-button" onClick={() => handlePrint(printInvoice)}>چاپ فاکتور</button>
              <button type="button" className="official-invoices-cancel-button" onClick={() => setPrintInvoice(null)}>بستن</button>
            </div>
          </section>
        </div>
      )}

      {/* پاپ‌آپ ارسال در واتساپ */}
      {whatsAppInvoice && (
        <div
          className="invoice-details-backdrop official-invoice-backdrop"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setWhatsAppInvoice(null); }}
        >
          <section className="invoice-details-modal official-invoice-modal official-invoice-modal-narrow" role="dialog" aria-modal="true" aria-labelledby="official-invoice-whatsapp-title" dir="rtl">
            <div className="invoice-details-heading">
              <div>
                <span className="page-eyebrow">ارسال در واتساپ</span>
                <h3 id="official-invoice-whatsapp-title">{whatsAppInvoice.customer_name || 'مشتری بدون نام'}</h3>
                <div className="official-invoice-modal-subtitle">فاکتور #{formatPersianDigits(whatsAppInvoice.id)}</div>
              </div>
              <button type="button" className="invoice-details-close" onClick={() => setWhatsAppInvoice(null)} aria-label="بستن ارسال واتساپ">×</button>
            </div>

            <label className="official-invoice-edit-field">
              <span>شماره موبایل مشتری</span>
              <input
                type="tel"
                dir="ltr"
                value={whatsAppPhone}
                onChange={(event) => setWhatsAppPhone(event.target.value)}
                placeholder="09123456789"
              />
            </label>

            <h4 className="invoice-details-items-title">پیش‌نمایش پیام</h4>
            <pre className="official-invoice-message-preview">{whatsAppMessage}</pre>

            <div className="official-invoice-modal-actions">
              <button type="button" className="official-invoices-apply-button" onClick={handleSendWhatsApp}>ارسال در واتساپ</button>
              <button type="button" className="official-invoices-cancel-button" onClick={() => setWhatsAppInvoice(null)}>انصراف</button>
            </div>
          </section>
        </div>
      )}

      {detailsInvoice && (() => {
        const detailsItems = [
          detailsInvoice.items_data,
          detailsInvoice.items_json,
          detailsInvoice.items,
        ].find(Array.isArray) || [];
        const total = Number(detailsInvoice.total_price || detailsInvoice.total_amount || 0);
        const discount = Number(detailsInvoice.discount_amount || 0);
        const grossTotal = total + discount;
        const paid = Number(detailsInvoice.paid_amount || 0);
        const status = getStatusMeta(detailsInvoice.payment_status);

        return (
          <div className="invoice-details-backdrop official-invoice-backdrop" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailsInvoice(null);
          }}>
            <section className="invoice-details-modal official-invoice-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-details-title" dir="rtl">
              <div className="invoice-details-heading">
                <div>
                  <span className="page-eyebrow">جزئیات کامل فاکتور</span>
                  <h3 id="invoice-details-title">فاکتور شماره #{formatPersianDigits(detailsInvoice.id)}</h3>
                </div>
                <button type="button" className="invoice-details-close" onClick={() => setDetailsInvoice(null)} aria-label="بستن جزئیات">×</button>
              </div>
              <dl className="invoice-details-grid">
                <div><dt>نام مشتری</dt><dd>{detailsInvoice.customer_name || 'ثبت نشده'}</dd></div>
                <div><dt>شماره تماس</dt><dd>{detailsInvoice.customer_phone || detailsInvoice.phone || 'ثبت نشده'}</dd></div>
                <div><dt>تاریخ سفارش</dt><dd>{detailsInvoice.order_date ? formatPersianDigits(detailsInvoice.order_date) : 'ثبت نشده'}</dd></div>
                <div><dt>تاریخ مراسم</dt><dd>{detailsInvoice.ceremony_date ? formatPersianDigits(detailsInvoice.ceremony_date) : 'ثبت نشده'}</dd></div>
                <div className="invoice-details-address"><dt>نشانی</dt><dd>{detailsInvoice.customer_address || 'ثبت نشده'}</dd></div>
                <div><dt>جمع اقلام</dt><dd>{formatDisplay(grossTotal)} تومان</dd></div>
                <div><dt>تخفیف</dt><dd>{formatDisplay(discount)} تومان</dd></div>
                <div><dt>مبلغ نهایی</dt><dd>{formatDisplay(total)} تومان</dd></div>
                <div><dt>مبلغ پرداختی</dt><dd>{formatDisplay(paid)} تومان</dd></div>
                <div><dt>مانده</dt><dd>{formatDisplay(calcRemaining(total, paid))} تومان</dd></div>
                <div><dt>وضعیت پرداخت</dt><dd><span style={{ color: status.color }}>{status.label}</span></dd></div>
                <div><dt>جمع هزینه‌های ثبت‌شده</dt><dd>{formatDisplay(sumInvoiceExpenses(invoiceExpenses))} تومان</dd></div>
                <div><dt>تاریخ ثبت</dt><dd>{detailsInvoice.created_at ? new Date(detailsInvoice.created_at).toLocaleDateString('fa-IR') : 'ثبت نشده'}</dd></div>
                {detailsInvoice.quotation_id && (
                  <div><dt>پیش‌فاکتور مبنا</dt><dd>شمارهٔ #{formatPersianDigits(detailsInvoice.quotation_id)}</dd></div>
                )}
              </dl>
              {calcRemaining(total, paid) > 0 && (
                <section className="official-invoice-receipt-section" aria-labelledby="invoice-receipt-title">
                  <div className="official-invoice-receipt-heading">
                    <div>
                      <h4 id="invoice-receipt-title">ثبت پیش‌پرداخت / دریافت</h4>
                      <p>مبلغ دریافت با انتخاب حساب ثبت و به پرداختی فاکتور اضافه می‌شود.</p>
                    </div>
                    <button
                      type="button"
                      className="official-invoices-apply-button"
                      onClick={() => {
                        setInvoicePaymentOpen((open) => !open);
                        setInvoicePaymentAmount(String(calcRemaining(total, paid)));
                        setInvoicePaymentAccountId('');
                        setInvoicePaymentDate(formatJalaliDate(todayIsoDate()));
                        setInvoicePaymentFeedback('');
                      }}
                    >
                      {invoicePaymentOpen ? 'بستن فرم دریافت' : 'ثبت دریافت'}
                    </button>
                  </div>
                  {invoicePaymentOpen && (
                    <form className="official-invoice-receipt-form" onSubmit={handleRecordInvoicePayment}>
                      <label>
                        حساب صندوق / بانک
                        <select
                          value={invoicePaymentAccountId}
                          onChange={(event) => setInvoicePaymentAccountId(event.target.value)}
                          required
                          disabled={invoicePaymentBusy || Boolean(invoiceExpenseAccountsError)}
                        >
                          <option value="">انتخاب حساب</option>
                          {invoiceExpenseAccounts.map((account) => (
                            <option key={account.id} value={account.id}>{account.account_name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        مبلغ دریافتی (تومان)
                        <FormattedNumberInput
                          allowDecimal={false}
                          inputMode="numeric"
                          value={invoicePaymentAmount}
                          onValueChange={setInvoicePaymentAmount}
                          required
                          disabled={invoicePaymentBusy}
                        />
                      </label>
                      <label>
                        تاریخ دریافت
                        <PersianDateInput
                          value={invoicePaymentDate}
                          onChange={setInvoicePaymentDate}
                          disabled={invoicePaymentBusy}
                        />
                      </label>
                      <button
                        type="submit"
                        className="official-invoices-apply-button"
                        disabled={invoicePaymentBusy || !invoiceExpenseAccounts.length || Boolean(invoiceExpenseAccountsError)}
                      >
                        {invoicePaymentBusy ? 'در حال ثبت…' : 'ثبت در صندوق/بانک'}
                      </button>
                    </form>
                  )}
                  {invoiceExpenseAccountsError && <p className="inventory-ops-message error" role="alert">بارگذاری حساب‌های صندوق/بانک ناموفق بود: {invoiceExpenseAccountsError}</p>}
                  {invoicePaymentFeedback && <p className="official-invoice-receipt-feedback" role="status">{invoicePaymentFeedback}</p>}
                </section>
              )}
              <section aria-labelledby="invoice-expenses-title">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <h4 id="invoice-expenses-title" className="invoice-details-items-title">هزینه‌های این فاکتور</h4>
                  <strong>جمع هزینه‌ها: {formatDisplay(sumInvoiceExpenses(invoiceExpenses))} تومان</strong>
                </div>
                {invoiceExpensesError && <p className="inventory-ops-message error" role="alert">بارگذاری هزینه‌های فاکتور ناموفق بود: {invoiceExpensesError}</p>}
                {invoiceExpenseAccountsError && <p className="inventory-ops-message error" role="alert">بارگذاری حساب‌های صندوق/بانک ناموفق بود (برای پرداخت، دسترسی حسابداری لازم است): {invoiceExpenseAccountsError}</p>}
                {invoiceExpensesLoading ? (
                  <p className="invoice-details-empty">در حال بارگذاری هزینه‌های فاکتور…</p>
                ) : invoiceExpenses.length ? (
                  <div className="invoice-details-items-wrap">
                    <table className="invoice-details-items">
                      <thead>
                        <tr><th>دسته</th><th>شرح</th><th>تاریخ هزینه</th><th>مبلغ</th><th>وضعیت پرداخت</th><th>اقدام</th></tr>
                      </thead>
                      <tbody>
                        {invoiceExpenses.map((expense) => {
                          const account = invoiceExpenseAccounts.find((item) => String(item.id) === String(expense.account_id));
                          const isPending = String(expense.id).startsWith('offline:');
                          return (
                            <tr key={expense.id}>
                              <td>{expense.category}</td>
                              <td>{expense.description || '—'}</td>
                              <td>{formatPersianDate(expense.expense_date)}</td>
                              <td>{formatDisplay(expense.amount)} تومان</td>
                              <td>
                                {expense.is_paid
                                  ? `پرداخت‌شده${account ? ` · ${account.account_name}` : ''} · ${formatPersianDate(expense.payment_date)}`
                                  : 'پرداخت‌نشده'}
                              </td>
                              <td>
                                {expense.is_paid ? (
                                  <span>ثبت‌شده در صندوق/بانک</span>
                                ) : (
                                  <div style={{ display: 'grid', gap: '6px', minWidth: '170px' }}>
                                    <select
                                      aria-label={`حساب پرداخت هزینه ${expense.description || expense.category}`}
                                      value={expensePaymentAccounts[expense.id] || ''}
                                      onChange={(event) => setExpensePaymentAccounts((current) => ({
                                        ...current,
                                        [expense.id]: event.target.value,
                                      }))}
                                    >
                                      <option value="">انتخاب حساب</option>
                                      {invoiceExpenseAccounts.map((item) => (
                                        <option key={item.id} value={item.id}>{item.account_name}</option>
                                      ))}
                                    </select>
                                    <PersianDateInput
                                      aria-label={`تاریخ پرداخت هزینه ${expense.description || expense.category}`}
                                      value={expensePaymentDate}
                                      onChange={setExpensePaymentDate}
                                    />
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                      <button
                                        type="button"
                                        className="official-invoices-apply-button"
                                        disabled={invoiceExpenseBusy || isPending || !invoiceExpenseAccounts.length || Boolean(invoiceExpenseAccountsError)}
                                        onClick={() => handlePayInvoiceExpense(expense)}
                                      >
                                        پرداخت و ثبت در صندوق
                                      </button>
                                      <button type="button" className="official-invoices-cancel-button" disabled={invoiceExpenseBusy || expense.is_paid} onClick={() => handleEditInvoiceExpense(expense)}>ویرایش</button>
                                      <button type="button" className="official-invoices-cancel-button" disabled={invoiceExpenseBusy || expense.is_paid} onClick={() => handleDeleteInvoiceExpense(expense)}>حذف</button>
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="invoice-details-empty">برای این فاکتور هنوز هزینه‌ای ثبت نشده است.</p>
                )}
                <form onSubmit={handleSaveInvoiceExpense} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', alignItems: 'end', marginTop: '14px' }}>
                  <label>
                    دسته‌بندی
                    <select
                      value={invoiceExpenseForm.category}
                      onChange={(event) => setInvoiceExpenseForm((current) => ({ ...current, category: event.target.value }))}
                      disabled={invoiceExpenseBusy || Boolean(invoiceExpensesError)}
                    >
                      {EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </label>
                  <label>
                    شرح هزینه
                    <input
                      type="text"
                      value={invoiceExpenseForm.description}
                      onChange={(event) => setInvoiceExpenseForm((current) => ({ ...current, description: event.target.value }))}
                      placeholder="مثلاً حمل‌ونقل یا گل‌آرایی"
                      maxLength={240}
                      disabled={invoiceExpenseBusy || Boolean(invoiceExpensesError)}
                    />
                  </label>
                  <label>
                    مبلغ (تومان)
                    <FormattedNumberInput
                      value={invoiceExpenseForm.amount}
                      onValueChange={(amount) => setInvoiceExpenseForm((current) => ({ ...current, amount }))}
                      allowDecimal={false}
                      inputMode="numeric"
                      placeholder="۰"
                      disabled={invoiceExpenseBusy || Boolean(invoiceExpensesError)}
                    />
                  </label>
                  <label>
                    تاریخ هزینه
                    <PersianDateInput
                      value={invoiceExpenseForm.expenseDate}
                      onChange={(expenseDate) => setInvoiceExpenseForm((current) => ({ ...current, expenseDate }))}
                      disabled={invoiceExpenseBusy || Boolean(invoiceExpensesError)}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="submit"
                      className="official-invoices-apply-button"
                      disabled={invoiceExpenseBusy || invoiceExpensesLoading || Boolean(invoiceExpensesError)}
                    >
                      {editingInvoiceExpenseId ? 'ذخیرهٔ تغییر هزینه' : 'ثبت هزینه'}
                    </button>
                    {editingInvoiceExpenseId && (
                      <button type="button" className="official-invoices-cancel-button" onClick={resetInvoiceExpenseForm} disabled={invoiceExpenseBusy}>انصراف</button>
                    )}
                  </div>
                </form>
                {invoiceExpenseFeedback && <p role="status" style={{ marginTop: '10px' }}>{invoiceExpenseFeedback}</p>}
                <p className="invoice-details-empty">هزینهٔ پرداخت‌نشده فقط به این فاکتور تعلق می‌گیرد؛ با زدن «پرداخت و ثبت در صندوق»، پرداخت از حساب انتخاب‌شده ثبت می‌شود. سود اجاره هنوز شامل استهلاک یا بهای تمام‌شدهٔ اقلام اجاره‌ای نیست.</p>
              </section>
              <h4 className="invoice-details-items-title">اقلام فاکتور</h4>
              {detailsItems.length ? (
                <div className="invoice-details-items-wrap">
                  <table className="invoice-details-items">
                    <thead><tr><th>قلم</th><th>نوع</th><th>تعداد</th><th>تحویل</th><th>مهلت عودت</th><th>قیمت واحد</th><th>جمع</th></tr></thead>
                    <tbody>{detailsItems.map((item, index) => {
                      const quantity = Number(item.qty || item.quantity || 1);
                      const price = getActiveUnitPrice(item);
                      return (
                        <tr key={`${item.id || item.title || 'item'}-${index}`}>
                          <td>{item.title || item.item_name || item.name || 'قلم بدون نام'}</td>
                          <td>{item.item_type === 'rent' ? 'اجاره‌ای' : 'فروشی'}</td>
                          <td>{formatDisplay(quantity)}</td>
                          <td>{formatPersianDate(item.rental_checkout_date)}</td>
                          <td>{formatPersianDate(item.rental_return_date)}</td>
                          <td>{formatDisplay(price)} تومان</td>
                          <td>{formatDisplay(quantity * price)} تومان</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              ) : <p className="invoice-details-empty">اقلامی برای این فاکتور ثبت نشده است.</p>}
            </section>
          </div>
        );
      })()}
    </div>
  );
}
