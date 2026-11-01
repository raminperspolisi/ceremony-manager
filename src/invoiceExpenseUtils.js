export const sumInvoiceExpenses = (expenses = []) => expenses.reduce((total, expense) => {
  const amount = Number(expense.amount);
  return total + (Number.isFinite(amount) && amount > 0 ? amount : 0);
}, 0);

export const getInvoiceExpenses = (expenses = [], invoiceId) => expenses.filter(
  (expense) => String(expense.invoice_id) === String(invoiceId),
);
