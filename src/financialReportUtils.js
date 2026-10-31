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
