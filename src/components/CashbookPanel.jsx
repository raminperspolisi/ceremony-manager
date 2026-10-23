import React, { useEffect, useMemo, useState } from 'react';
import { insertRows, readTable, recordCashTransaction, updateRows } from '../offlineSync';
import FormattedNumberInput from './FormattedNumberInput';
import {
  calculateAccountBalances,
  EXPENSE_CATEGORIES,
  formatJalaliDate,
  parseJalaliDate,
} from '../cashbookUtils';

const ACCOUNT_TYPES = [
  { value: 'cash', label: 'صندوق نقدی' },
  { value: 'bank', label: 'حساب بانکی' },
];

const TRANSACTION_TYPES = [
  { value: 'income', label: 'دریافت وجه' },
  { value: 'expense', label: 'پرداخت هزینه' },
  { value: 'transfer', label: 'انتقال بین حساب‌ها' },
];

const money = (value) => `${Math.round(Number(value) || 0).toLocaleString('fa-IR')} تومان`;
const todayJalali = () => new Date().toLocaleDateString('fa-IR');
const accountLabel = (account) => `${account.account_name} (${account.account_type === 'cash' ? 'صندوق' : 'بانک'})`;
const newTransactionForm = () => ({
  transaction_type: 'income',
  amount: '',
  account_id: '',
  transfer_to_account_id: '',
  invoice_id: '',
  category: EXPENSE_CATEGORIES[0],
  description: '',
  transaction_date: todayJalali(),
});

export default function CashbookPanel() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState('cash');
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingDate, setOpeningDate] = useState(todayJalali);
  const [transactionForm, setTransactionForm] = useState(newTransactionForm);
  const [accountFilter, setAccountFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const balances = useMemo(
    () => calculateAccountBalances(accounts, transactions),
    [accounts, transactions],
  );
  const cashBalance = accounts
    .filter((account) => account.account_type === 'cash')
    .reduce((sum, account) => sum + (balances.get(String(account.id)) || 0), 0);
  const bankBalance = accounts
    .filter((account) => account.account_type === 'bank')
    .reduce((sum, account) => sum + (balances.get(String(account.id)) || 0), 0);

  const refreshData = async () => {
    setLoading(true);
    const [accountResult, transactionResult, invoiceResult] = await Promise.all([
      readTable('financial_accounts', { orderBy: 'id', ascending: false }),
      readTable('cash_transactions', { orderBy: 'transaction_date', ascending: false, limit: 1000 }),
      readTable('invoices', { orderBy: 'created_at', ascending: false }),
    ]);
    const failures = [
      accountResult.error && `حساب‌ها: ${accountResult.error.message}`,
      transactionResult.error && `گردش‌ها: ${transactionResult.error.message}`,
      invoiceResult.error && `فاکتورها: ${invoiceResult.error.message}`,
    ].filter(Boolean);
    setLoadError(failures.join('؛ '));
    if (!accountResult.error) setAccounts(accountResult.data || []);
    if (!transactionResult.error) setTransactions(transactionResult.data || []);
    if (!invoiceResult.error) setInvoices(invoiceResult.data || []);
    setLoading(false);
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void refreshData(); }, 0);
    const handleDataUpdate = () => { void refreshData(); };
    window.addEventListener('offline-data-updated', handleDataUpdate);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener('offline-data-updated', handleDataUpdate);
    };
  }, []);

  const visibleTransactions = transactions.filter((transaction) => (
    (accountFilter === 'all'
      || String(transaction.account_id) === accountFilter
      || String(transaction.transfer_to_account_id) === accountFilter)
    && (typeFilter === 'all' || transaction.transaction_type === typeFilter)
  ));

  const handleAccountSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFeedback('');
    setErrorMessage('');
    const name = accountName.trim();
    if (!name) {
      setErrorMessage('نام حساب را وارد کنید.');
      setBusy(false);
      return;
    }

    const accountDate = editingAccountId ? null : parseJalaliDate(openingDate);
    if (!editingAccountId && !accountDate) {
      setErrorMessage('تاریخ شمسی افتتاح حساب معتبر نیست.');
      setBusy(false);
      return;
    }

    const result = editingAccountId
      ? await updateRows('financial_accounts', { account_name: name }, [
        { column: 'id', operator: 'eq', value: editingAccountId },
      ])
      : await insertRows('financial_accounts', [{
        account_name: name,
        account_type: accountType,
        opening_balance: Number(openingBalance) || 0,
        opening_date: accountDate,
      }]);
    setBusy(false);
    if (result.error) {
      setErrorMessage(`ذخیرهٔ حساب ناموفق بود: ${result.error.message}`);
      return;
    }

    setFeedback(result.offline ? 'حساب ذخیره شد و پس از اتصال همگام می‌شود.' : 'حساب با موفقیت ذخیره شد.');
    setAccountFormOpen(false);
    setEditingAccountId(null);
    setAccountName('');
    setOpeningBalance('');
    setOpeningDate(todayJalali());
    await refreshData();
  };

  const startEditAccount = (account) => {
    setEditingAccountId(account.id);
    setAccountName(account.account_name);
    setAccountType(account.account_type);
    setAccountFormOpen(true);
  };

  const handleTransactionSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFeedback('');
    setErrorMessage('');
    const amount = Math.round(Number(transactionForm.amount));
    const transactionDate = parseJalaliDate(transactionForm.transaction_date);
    const selectedAccountId = transactionForm.account_id || accounts[0]?.id;
    const account = accounts.find((item) => String(item.id) === String(selectedAccountId));
    if (!account) {
      setErrorMessage('حساب موردنظر را انتخاب کنید.');
      setBusy(false);
      return;
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setErrorMessage('مبلغ باید عدد صحیح و بیشتر از صفر باشد.');
      setBusy(false);
      return;
    }
    if (!transactionDate) {
      setErrorMessage('تاریخ شمسی گردش معتبر نیست.');
      setBusy(false);
      return;
    }

    const transaction = {
      transaction_type: transactionForm.transaction_type,
      amount,
      account_id: account.id,
      transaction_date: transactionDate,
      description: transactionForm.description.trim(),
      category: transactionForm.transaction_type === 'expense' ? transactionForm.category : null,
    };
    if (transactionForm.transaction_type === 'transfer') {
      const destination = accounts.find((item) => String(item.id) === String(transactionForm.transfer_to_account_id));
      if (!destination || String(destination.id) === String(account.id)) {
        setErrorMessage('حساب مقصد انتقال باید با حساب مبدا متفاوت باشد.');
        setBusy(false);
        return;
      }
      if ((balances.get(String(account.id)) || 0) < amount) {
        setErrorMessage('ماندهٔ حساب مبدا برای این انتقال کافی نیست.');
        setBusy(false);
        return;
      }
      transaction.transfer_to_account_id = destination.id;
    }
    if (transactionForm.transaction_type === 'expense'
      && (balances.get(String(account.id)) || 0) < amount) {
      setErrorMessage('ماندهٔ حساب برای پرداخت این هزینه کافی نیست.');
      setBusy(false);
      return;
    }
    if (transactionForm.transaction_type === 'income' && transactionForm.invoice_id) {
      const invoice = invoices.find((item) => String(item.id) === String(transactionForm.invoice_id));
      if (!invoice) {
        setErrorMessage('فاکتور انتخاب‌شده پیدا نشد؛ فهرست را تازه‌سازی کنید.');
        setBusy(false);
        return;
      }
      const remaining = Math.max(
        Number(invoice.total_price || invoice.total_amount || 0) - Number(invoice.paid_amount || 0),
        0,
      );
      if (amount > remaining) {
        setErrorMessage(`مبلغ دریافت بیشتر از ماندهٔ فاکتور (${money(remaining)}) است.`);
        setBusy(false);
        return;
      }
      transaction.invoice_id = invoice.id;
    }

    const result = await recordCashTransaction(transaction);
    setBusy(false);
    if (result.error) {
      setErrorMessage(`ثبت گردش مالی ناموفق بود: ${result.error.message}`);
      return;
    }
    setFeedback(result.offline
      ? 'گردش مالی در دستگاه ذخیره شد و پس از اتصال همگام می‌شود.'
      : 'گردش مالی با موفقیت ثبت شد.');
    setTransactionForm(newTransactionForm());
    await refreshData();
  };

  const accountOptions = accounts.map((account) => (
    <option key={account.id} value={account.id}>{accountLabel(account)}</option>
  ));

  return (
    <div className="cashbook-panel" dir="rtl">
      <div className="cashbook-heading">
        <div>
          <p className="page-eyebrow">مدیریت نقدینگی</p>
          <h3>صندوق و بانک</h3>
          <p>دریافت، هزینه و انتقال وجه را ثبت کنید؛ دریافت فاکتور به‌صورت یکپارچه در سوابق تسویه می‌شود.</p>
        </div>
        <button
          type="button"
          className="cashbook-secondary-button"
          onClick={() => {
            setEditingAccountId(null);
            setAccountName('');
            setAccountType('cash');
            setOpeningBalance('');
            setOpeningDate(todayJalali());
            setAccountFormOpen((open) => !open);
          }}
        >
          {accountFormOpen && !editingAccountId ? 'بستن فرم حساب' : 'افزودن حساب'}
        </button>
      </div>

      {loadError && <div className="cashbook-alert cashbook-alert-error" role="alert">{loadError}</div>}
      {feedback && <div className="cashbook-alert cashbook-alert-success" role="status">{feedback}</div>}
      {errorMessage && <div className="cashbook-alert cashbook-alert-error" role="alert">{errorMessage}</div>}

      <div className="cashbook-summary">
        <article><span>موجودی صندوق</span><strong>{money(cashBalance)}</strong></article>
        <article><span>موجودی بانک</span><strong>{money(bankBalance)}</strong></article>
        <article><span>جمع موجودی</span><strong>{money(cashBalance + bankBalance)}</strong></article>
      </div>

      {accountFormOpen && (
        <form className="cashbook-form" onSubmit={handleAccountSubmit}>
          <h4>{editingAccountId ? 'تغییر نام حساب' : 'افزودن حساب صندوق یا بانک'}</h4>
          <label>
            نام حساب
            <input value={accountName} onChange={(event) => setAccountName(event.target.value)} maxLength={80} required />
          </label>
          {!editingAccountId && (
            <>
              <label>
                نوع حساب
                <select value={accountType} onChange={(event) => setAccountType(event.target.value)}>
                  {ACCOUNT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label>
                موجودی اولیه (تومان)
                <FormattedNumberInput value={openingBalance} onValueChange={setOpeningBalance} allowDecimal={false} inputMode="numeric" />
              </label>
              <label>
                تاریخ افتتاح (شمسی)
                <input value={openingDate} onChange={(event) => setOpeningDate(event.target.value)} placeholder="۱۴۰۵/۰۷/۰۱" required />
              </label>
            </>
          )}
          <div className="cashbook-form-actions">
            <button type="submit" className="cashbook-primary-button" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره حساب'}</button>
            <button type="button" className="cashbook-secondary-button" onClick={() => { setAccountFormOpen(false); setEditingAccountId(null); }}>انصراف</button>
          </div>
        </form>
      )}

      <section className="cashbook-accounts" aria-label="حساب‌های صندوق و بانک">
        <div className="cashbook-section-title"><h4>حساب‌ها</h4><span>{accounts.length.toLocaleString('fa-IR')} حساب</span></div>
        {!accounts.length && !loading && <p className="cashbook-empty">هنوز حسابی ثبت نشده است؛ برای شروع یک صندوق یا حساب بانکی بسازید.</p>}
        <div className="cashbook-account-grid">
          {accounts.map((account) => (
            <article className="cashbook-account-card" key={account.id}>
              <div>
                <span>{account.account_type === 'cash' ? 'صندوق نقدی' : 'حساب بانکی'}</span>
                <h5>{account.account_name}</h5>
              </div>
              <strong>{money(balances.get(String(account.id)) || 0)}</strong>
              <small>موجودی آغازین: {money(account.opening_balance)} · از {formatJalaliDate(account.opening_date)}</small>
              <button type="button" className="cashbook-link-button" onClick={() => startEditAccount(account)}>تغییر نام</button>
            </article>
          ))}
        </div>
      </section>

      <section className="cashbook-transactions">
        <div className="cashbook-section-title"><h4>ثبت گردش جدید</h4></div>
        {!accounts.length ? (
          <p className="cashbook-empty">برای ثبت گردش، ابتدا یک حساب بسازید.</p>
        ) : (
          <form className="cashbook-form cashbook-transaction-form" onSubmit={handleTransactionSubmit}>
            <label>
              نوع گردش
              <select
                value={transactionForm.transaction_type}
                onChange={(event) => setTransactionForm((current) => ({
                  ...current,
                  transaction_type: event.target.value,
                  invoice_id: '',
                  transfer_to_account_id: '',
                }))}
              >
                {TRANSACTION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label>
              مبلغ (تومان)
              <FormattedNumberInput
                value={transactionForm.amount}
                onValueChange={(amount) => setTransactionForm((current) => ({ ...current, amount }))}
                allowDecimal={false}
                inputMode="numeric"
                required
              />
            </label>
            <label>
              {transactionForm.transaction_type === 'transfer' ? 'حساب مبدا' : 'حساب'}
              <select value={transactionForm.account_id || String(accounts[0]?.id || '')} onChange={(event) => setTransactionForm((current) => ({ ...current, account_id: event.target.value }))} required>
                {accountOptions}
              </select>
            </label>
            {transactionForm.transaction_type === 'transfer' && (
              <label>
                حساب مقصد
                <select value={transactionForm.transfer_to_account_id} onChange={(event) => setTransactionForm((current) => ({ ...current, transfer_to_account_id: event.target.value }))} required>
                  <option value="">انتخاب کنید</option>
                  {accountOptions}
                </select>
              </label>
            )}
            {transactionForm.transaction_type === 'expense' && (
              <label>
                دسته هزینه
                <select value={transactionForm.category} onChange={(event) => setTransactionForm((current) => ({ ...current, category: event.target.value }))}>
                  {EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
            )}
            {transactionForm.transaction_type === 'income' && (
              <label>
                اتصال به فاکتور (اختیاری)
                <select value={transactionForm.invoice_id} onChange={(event) => setTransactionForm((current) => ({ ...current, invoice_id: event.target.value }))}>
                  <option value="">دریافت متفرقه</option>
                  {invoices.filter((invoice) => Number(invoice.total_price || 0) > Number(invoice.paid_amount || 0)).map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      #{String(invoice.id).replace(/\d/g, (digit) => String.fromCharCode(Number(digit) + 1728))} · {invoice.customer_name || 'مشتری'} · مانده {money(Math.max(Number(invoice.total_price || 0) - Number(invoice.paid_amount || 0), 0))}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              تاریخ (شمسی)
              <input
                value={transactionForm.transaction_date}
                onChange={(event) => setTransactionForm((current) => ({ ...current, transaction_date: event.target.value }))}
                placeholder="۱۴۰۵/۰۷/۰۱"
                required
              />
            </label>
            <label className="cashbook-description-field">
              توضیحات
              <input
                value={transactionForm.description}
                onChange={(event) => setTransactionForm((current) => ({ ...current, description: event.target.value }))}
                maxLength={240}
                placeholder={transactionForm.transaction_type === 'expense' ? 'شرح یا گیرندهٔ هزینه' : 'توضیح اختیاری'}
              />
            </label>
            <div className="cashbook-form-actions cashbook-transaction-submit">
              <button type="submit" className="cashbook-primary-button" disabled={busy}>
                {busy ? 'در حال ثبت…' : 'ثبت گردش مالی'}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="cashbook-ledger">
        <div className="cashbook-section-title">
          <h4>دفتر گردش حساب</h4>
          <div className="cashbook-filters">
            <select aria-label="فیلتر حساب" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
              <option value="all">همهٔ حساب‌ها</option>
              {accountOptions}
            </select>
            <select aria-label="فیلتر نوع گردش" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">همهٔ گردش‌ها</option>
              {TRANSACTION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
        </div>
        {loading ? <p className="cashbook-empty">در حال بارگذاری…</p> : visibleTransactions.length === 0 ? (
          <p className="cashbook-empty">گردشی برای نمایش وجود ندارد.</p>
        ) : (
          <div className="cashbook-table-wrap">
            <table className="cashbook-table">
              <thead>
                <tr><th>تاریخ</th><th>نوع</th><th>حساب</th><th>دسته / مرجع</th><th>توضیحات</th><th>مبلغ</th></tr>
              </thead>
              <tbody>
                {visibleTransactions.map((transaction) => {
                  const sourceAccount = accounts.find((account) => String(account.id) === String(transaction.account_id));
                  const destinationAccount = accounts.find((account) => String(account.id) === String(transaction.transfer_to_account_id));
                  const invoice = invoices.find((item) => String(item.id) === String(transaction.invoice_id));
                  const typeLabel = TRANSACTION_TYPES.find((type) => type.value === transaction.transaction_type)?.label || transaction.transaction_type;
                  return (
                    <tr key={transaction.id}>
                      <td>{formatJalaliDate(transaction.transaction_date)}</td>
                      <td><span className={`cashbook-type-badge cashbook-type-${transaction.transaction_type}`}>{typeLabel}</span></td>
                      <td>{transaction.transaction_type === 'transfer'
                        ? `${sourceAccount?.account_name || 'حساب'} ← ${destinationAccount?.account_name || 'حساب'}`
                        : sourceAccount?.account_name || 'حساب حذف‌شده'}</td>
                      <td>{transaction.category || (invoice ? `فاکتور #${invoice.id}` : '—')}</td>
                      <td>{transaction.description || '—'}</td>
                      <td className={`cashbook-amount cashbook-amount-${transaction.transaction_type}`}>{money(transaction.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
