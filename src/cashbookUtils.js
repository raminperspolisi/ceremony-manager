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
  const normalized = String(value ?? '')
    .replace(/[۰-۹]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))
    .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
    .replace(/[\s-]/g, '');
  return /^\d{16}$/.test(normalized) ? normalized : null;
};

export const maskCardNumber = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 16 ? `•••• •••• •••• ${toPersianDigits(digits.slice(-4))}` : '';
};

export const parseJalaliDate = (value) => {
  const normalized = String(value ?? '')
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

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export const getInvoiceSalesCost = (invoice) => {
  const items = [invoice?.items_data, invoice?.items_json, invoice?.items]
    .find((value) => Array.isArray(value)) || [];
  return items.reduce((total, item) => {
    if (['rent', 'اجاره', 'اجاره‌ای'].includes(item.item_type || item.type)) return total;
    const quantity = Number(item.qty || item.quantity || item.requestedQuantity || 1);
    if (!Number.isFinite(quantity) || quantity <= 0) return total;

    const lineCost = numberOrNull(item.total_cost);
    if (lineCost !== null && lineCost > 0) return total + lineCost;
    const unitCost = [item.base_cost, item.cost, item.unit_cost]
      .map(numberOrNull)
      .find((cost) => cost !== null && cost > 0);
    return unitCost === undefined ? total : total + unitCost * quantity;
  }, 0);
};

export const getInvoiceIssueDate = (invoice) => String(
  invoice?.created_at || invoice?.invoice_date || invoice?.issue_date || '',
).slice(0, 10);

export const getPeriodCostOfGoodsEntries = (invoices, fromDate, toDate) => invoices.flatMap((invoice) => {
  const transactionDate = getInvoiceIssueDate(invoice);
  const amount = getInvoiceSalesCost(invoice);
  if (!transactionDate || transactionDate < fromDate || transactionDate > toDate || amount <= 0) return [];
  return [{
    id: `cost-of-goods-${invoice.id}`,
    transaction_type: 'expense',
    amount,
    transaction_date: transactionDate,
    category: 'بهای تمام‌شدهٔ کالای فروخته‌شده',
    description: `بهای تمام‌شدهٔ اقلام فروشی فاکتور #${invoice.invoice_number || invoice.id}`,
    invoice_id: invoice.id,
    isCostOfGoods: true,
  }];
});

export const summarizeCashTransactions = (transactions, fromDate, toDate, invoices = []) => {
  const summary = transactions.reduce((current, transaction) => {
    if (transaction.transaction_date < fromDate || transaction.transaction_date > toDate) return current;
    if (transaction.transaction_type === 'income') current.income += Number(transaction.amount || 0);
    if (transaction.transaction_type === 'expense') current.expenses += Number(transaction.amount || 0);
    if (transaction.transaction_type === 'transfer') current.transfers += Number(transaction.amount || 0);
    return current;
  }, { income: 0, expenses: 0, transfers: 0 });
  summary.expenses += getPeriodCostOfGoodsEntries(invoices, fromDate, toDate)
    .reduce((total, item) => total + item.amount, 0);
  return summary;
};

export const getInvoicePaymentStatus = (paidAmount, totalAmount) => {
  if (Number(paidAmount) <= 0) return 'unpaid';
  return Number(paidAmount) >= Number(totalAmount) ? 'paid' : 'deposit_paid';
};
