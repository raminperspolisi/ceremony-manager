export async function convertQuotationToInvoice(quotation, { readTable, insertRows }) {
  if (!quotation || quotation.id === undefined || quotation.id === null) {
    throw new Error('شناسهٔ پیش‌فاکتور معتبر نیست.');
  }

  const { data: invoices, error: readError } = await readTable('invoices');
  if (readError) throw readError;

  const existingInvoice = (invoices || []).find(
    (invoice) => String(invoice.quotation_id) === String(quotation.id),
  );
  if (existingInvoice) return { alreadyConverted: true, invoice: existingInvoice };

  const { data, error } = await insertRows('invoices', [{
    quotation_id: String(quotation.id),
    customer_name: quotation.customer_name,
    total_price: quotation.total_price,
    items_data: quotation.items_json || quotation.items_data || [],
    is_official: true,
  }]);
  if (error) throw error;
  return { alreadyConverted: false, invoice: data?.[0] || null };
}

export async function deleteSelectedDocuments(selectedIds, documents, { deleteRows }) {
  const selected = new Set(selectedIds);
  const quotationIds = documents
    .filter((document) => document.type === 'quotation' && selected.has(`quotation-${document.id}`))
    .map((document) => document.id);
  const invoiceIds = documents
    .filter((document) => document.type === 'official' && selected.has(`official-${document.id}`))
    .map((document) => document.id);

  let deletedQuotations = false;
  if (quotationIds.length) {
    const { error } = await deleteRows('quotations', [{ column: 'id', operator: 'in', value: quotationIds }]);
    if (error) throw error;
    deletedQuotations = true;
  }
  if (invoiceIds.length) {
    const { error } = await deleteRows('invoices', [{ column: 'id', operator: 'in', value: invoiceIds }]);
    if (error) {
      const partialError = new Error(error.message);
      partialError.partial = deletedQuotations;
      throw partialError;
    }
  }
}

export async function updateOfficialInvoice(id, updates, { updateRows }) {
  const { error } = await updateRows('invoices', updates, [{ column: 'id', operator: 'eq', value: id }]);
  if (error) throw error;
}
