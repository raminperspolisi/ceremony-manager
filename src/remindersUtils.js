const normalizeCustomerName = (value) => String(value ?? '')
  .normalize('NFKC')
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase('fa-IR');

export const attachCustomerPhones = (invoices, customers, quotations = []) => {
  const customersById = new Map(
    customers
      .filter((customer) => customer.id !== undefined && customer.id !== null)
      .map((customer) => [String(customer.id), customer.phone || '']),
  );
  const quotationsById = new Map(
    quotations
      .filter((quotation) => quotation.id !== undefined && quotation.id !== null)
      .map((quotation) => [String(quotation.id), quotation]),
  );
  const phonesByName = new Map();
  for (const customer of customers) {
    const name = normalizeCustomerName(customer['Full name']);
    const phone = String(customer.phone || '').trim();
    if (!name || !phone) continue;
    const phones = phonesByName.get(name) || new Set();
    phones.add(phone);
    phonesByName.set(name, phones);
  }

  return invoices.map((invoice) => {
    const directPhone = String(invoice.customer_phone || invoice.phone || '').trim();
    if (directPhone) return invoice;

    const quotation = invoice.quotation_id !== undefined && invoice.quotation_id !== null
      ? quotationsById.get(String(invoice.quotation_id))
      : null;
    const quotationPhone = String(quotation?.customer_phone || quotation?.phone || '').trim();
    const customerPhone = invoice.customer_id !== undefined && invoice.customer_id !== null
      ? customersById.get(String(invoice.customer_id)) || ''
      : '';
    const namePhones = phonesByName.get(normalizeCustomerName(invoice.customer_name));
    const matchedNamePhone = namePhones?.size === 1 ? [...namePhones][0] : '';
    const phone = quotationPhone || customerPhone || matchedNamePhone;
    return phone ? { ...invoice, customer_phone: phone } : invoice;
  });
};
