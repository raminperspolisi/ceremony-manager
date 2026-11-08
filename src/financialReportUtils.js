import { getInvoiceSalesCost } from './cashbookUtils.js';

const getItemCategory = (item) => {
  const type = String(item?.item_type || item?.type || '').trim().toLocaleLowerCase('fa-IR');
  if (['rent', 'اجاره', 'اجاره‌ای', 'اجاره ای'].includes(type)) return 'rent';
  if (['sale', 'فروش', 'فروشی'].includes(type)) return 'sale';
  return 'unclassified';
};

export const getInvoiceItems = (invoice) => {
  const itemLists = [invoice?.items_data, invoice?.items_json, invoice?.items];
  return itemLists.find((items) => Array.isArray(items) && items.length > 0)
    || itemLists.find(Array.isArray)
    || [];
};

export const getInvoiceItemDetails = (item) => {
  const quantityValue = Number(item?.qty ?? item?.requestedQuantity ?? 1);
  const quantity = Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : 0;
  const level = String(item?.price_level || '1');
  const selectedPrice = level === '2' ? item?.p2 : level === '3' ? item?.p3 : item?.p1;
  const unitPriceValue = Number(item?.unit_price ?? selectedPrice ?? item?.price ?? item?.p1 ?? 0);
  const unitPrice = Number.isFinite(unitPriceValue) && unitPriceValue >= 0 ? unitPriceValue : 0;

  return {
    category: getItemCategory(item),
    quantity,
    unitPrice,
    total: quantity * unitPrice,
  };
};

export const calculateInvoiceItemsTotal = (items) => (
  (Array.isArray(items) ? items : []).reduce(
    (total, item) => total + getInvoiceItemDetails(item).total,
    0,
  )
);

export const summarizeInvoiceRevenue = (invoices) => {
  const summary = {
    totalRevenue: 0,
    rentRevenue: 0,
    saleRevenue: 0,
    unclassifiedRevenue: 0,
  };

  for (const invoice of invoices) {
    const invoiceTotal = Number(invoice.total_price ?? invoice.total_amount ?? 0);
    if (Number.isFinite(invoiceTotal)) summary.totalRevenue += invoiceTotal;

    const items = getInvoiceItems(invoice);
    if (!Array.isArray(items) || items.length === 0) {
      summary.unclassifiedRevenue += Number.isFinite(invoiceTotal) ? invoiceTotal : 0;
      continue;
    }

    for (const item of items) {
      const { category, total } = getInvoiceItemDetails(item);
      if (category === 'rent') summary.rentRevenue += total;
      else if (category === 'sale') summary.saleRevenue += total;
      else summary.unclassifiedRevenue += total;
    }
  }

  return summary;
};

const positiveAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

export const summarizeCeremonyProfit = (events, invoices, invoiceExpenses, transactions) => {
  const eventRows = new Map(events.map((event) => [String(event.id), {
    eventId: event.id,
    eventName: event.customer_name || event.event_type || 'مراسم بدون نام',
    eventType: event.event_type || '',
    eventDate: event.event_date || '',
    invoiceCount: 0,
    revenue: 0,
    invoiceExpenses: 0,
    otherExpenses: 0,
    goodsCost: 0,
  }]));
  const invoiceExpenseById = new Map();
  const invoiceExpenseTransactionIds = new Set();
  const unassigned = { revenue: 0, expenses: 0 };

  for (const expense of invoiceExpenses) {
    const amount = positiveAmount(expense.amount);
    const invoiceId = String(expense.invoice_id);
    invoiceExpenseById.set(invoiceId, (invoiceExpenseById.get(invoiceId) || 0) + amount);
    if (expense.cash_transaction_id !== null && expense.cash_transaction_id !== undefined) {
      invoiceExpenseTransactionIds.add(String(expense.cash_transaction_id));
    }
  }

  let invoiceRevenue = 0;
  let invoiceExpenseTotal = 0;
  let goodsCostTotal = 0;
  for (const invoice of invoices) {
    const revenue = positiveAmount(invoice.total_price ?? invoice.total_amount);
    const expense = invoiceExpenseById.get(String(invoice.id)) || 0;
    const goodsCost = getInvoiceSalesCost(invoice);
    const eventRow = invoice.event_id === null || invoice.event_id === undefined
      ? null
      : eventRows.get(String(invoice.event_id));

    invoiceRevenue += revenue;
    invoiceExpenseTotal += expense;
    goodsCostTotal += goodsCost;
    if (eventRow) {
      eventRow.invoiceCount += 1;
      eventRow.revenue += revenue;
      eventRow.invoiceExpenses += expense;
      eventRow.goodsCost += goodsCost;
    } else {
      unassigned.revenue += revenue;
      unassigned.expenses += expense + goodsCost;
    }
  }

  let otherIncomeTotal = 0;
  let otherExpenseTotal = 0;
  for (const transaction of transactions) {
    const amount = positiveAmount(transaction.amount);
    const isInvoiceExpense = invoiceExpenseTransactionIds.has(String(transaction.id));
    if (transaction.transaction_type === 'expense' && isInvoiceExpense) continue;

    const eventRow = transaction.event_id === null || transaction.event_id === undefined
      ? null
      : eventRows.get(String(transaction.event_id));
    if (transaction.transaction_type === 'income' && !transaction.invoice_id) {
      otherIncomeTotal += amount;
      if (eventRow) eventRow.revenue += amount;
      else unassigned.revenue += amount;
    } else if (transaction.transaction_type === 'expense') {
      otherExpenseTotal += amount;
      if (eventRow) eventRow.otherExpenses += amount;
      else unassigned.expenses += amount;
    }
  }

  const rows = [...eventRows.values()]
    .map((row) => {
      const totalExpenses = row.invoiceExpenses + row.otherExpenses + row.goodsCost;
      return {
        ...row,
        totalExpenses,
        profit: row.revenue - totalExpenses,
      };
    })
    .filter((row) => row.revenue > 0 || row.totalExpenses > 0)
    .sort((first, second) => (
      String(first.eventDate).localeCompare(String(second.eventDate))
      || String(first.eventName).localeCompare(String(second.eventName), 'fa')
    ));

  const totals = {
    revenue: invoiceRevenue + otherIncomeTotal,
    expenses: invoiceExpenseTotal + goodsCostTotal + otherExpenseTotal,
  };
  totals.profit = totals.revenue - totals.expenses;
  unassigned.profit = unassigned.revenue - unassigned.expenses;

  return { rows, totals, unassigned };
};
