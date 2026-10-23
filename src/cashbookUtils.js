import moment from 'jalali-moment';

export const EXPENSE_CATEGORIES = [
  'تدارکات',
  'اجاره',
  'حقوق و دستمزد',
  'حمل‌ونقل',
  'قبوض',
  'تعمیرات',
  'تبلیغات',
  'سایر',
];

const toPersianDigits = (value) => String(value).replace(/\d/g, (digit) =>
  String.fromCharCode(digit.charCodeAt(0) + 1728)
);

export const normalizeCardNumber = (value) => {
  const normalized = String(value || '')
    .replace(/[۰-۹]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))
    .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
    .replace(/[\s-]/g, '');
  return /^\d{16}$/.test(normalized) ? normalized : null;
};

export const maskCardNumber = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 16 ? `•••• •••• •••• ${toPersianDigits(digits.slice(-4))}` : '';
};

export const parseJalaliDate = (value) => {
  const normalized = String(value || '')
    .trim()
    .replace(/[۰-۹]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))
    .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
    .replace(/-/g, '/');
  const parts = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!parts) return null;

  const parsed = moment(normalized, 'jYYYY/jM/jD', true);
  if (!parsed.isValid()) return null;

  const normalizedDate = `${parts[1]}/${parts[2].padStart(2, '0')}/${parts[3].padStart(2, '0')}`;
  return parsed.format('jYYYY/jMM/jDD') === normalizedDate ? parsed.format('YYYY-MM-DD') : null;
};

export const formatJalaliDate = (value) => {
  if (!value) return '—';
  const parsed = moment(value, 'YYYY-MM-DD', true);
  return parsed.isValid() ? toPersianDigits(parsed.locale('fa').format('jYYYY/jMM/jDD')) : '—';
};

export const calculateAccountBalances = (accounts, transactions) => {
  const balances = new Map(accounts.map((account) => [String(account.id), Number(account.opening_balance || 0)]));
  for (const transaction of transactions) {
    const amount = Number(transaction.amount || 0);
    if (transaction.transaction_type === 'income') {
      const key = String(transaction.account_id);
      balances.set(key, (balances.get(key) || 0) + amount);
    } else if (transaction.transaction_type === 'expense') {
      const key = String(transaction.account_id);
      balances.set(key, (balances.get(key) || 0) - amount);
    } else if (transaction.transaction_type === 'transfer') {
      const source = String(transaction.account_id);
      const destination = String(transaction.transfer_to_account_id);
      balances.set(source, (balances.get(source) || 0) - amount);
      balances.set(destination, (balances.get(destination) || 0) + amount);
    }
  }
  return balances;
};

export const summarizeCashTransactions = (transactions, fromDate, toDate) => transactions.reduce((summary, transaction) => {
  if (transaction.transaction_date < fromDate || transaction.transaction_date > toDate) return summary;
  if (transaction.transaction_type === 'income') summary.income += Number(transaction.amount || 0);
  if (transaction.transaction_type === 'expense') summary.expenses += Number(transaction.amount || 0);
  if (transaction.transaction_type === 'transfer') summary.transfers += Number(transaction.amount || 0);
  return summary;
}, { income: 0, expenses: 0, transfers: 0 });

export const getInvoicePaymentStatus = (paidAmount, totalAmount) => {
  if (Number(paidAmount) <= 0) return 'unpaid';
  return Number(paidAmount) >= Number(totalAmount) ? 'paid' : 'deposit_paid';
};
