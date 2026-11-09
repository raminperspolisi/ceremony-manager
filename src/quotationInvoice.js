import { parseNumericInput } from './numberUtils.js';

export function calculateQuotationTotals(items, discountAmount, paidAmount = 0) {
  const totals = [1, 2, 3].map((level) => items.reduce((sum, item) => (
    sum
    + parseNumericInput(item[`price_level${level}`]) * parseNumericInput(item.requestedQuantity, true)
  ), 0));
  const discount = Math.max(0, parseNumericInput(discountAmount));
  const paid = Math.max(0, parseNumericInput(paidAmount));
  const finalTotals = totals.map((total) => Math.max(0, total - discount));

  return {
    totals,
    discount,
    paid,
    finalTotals,
    remainingTotals: finalTotals.map((total) => Math.max(0, total - paid)),
  };
}

const normalizeInventoryTitle = (title) => String(title || '')
  .normalize('NFKC')
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[\u200c\u0640]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase();

const normalizeInventoryType = (type) => {
  const normalized = String(type || 'sale')
    .normalize('NFKC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u0640\s]/g, '')
    .toLocaleLowerCase();

  if (['rent', 'rental', 'اجاره', 'اجاره‌ای', 'اجارهای'].includes(normalized)) return 'rent';
  if (['sale', 'sell', 'فروش', 'فروشی'].includes(normalized)) return 'sale';
  throw new Error(`نوع کالای «${type}» معتبر نیست؛ نوع باید فروش یا اجاره باشد.`);
};

const getInventoryType = (type) => {
  try {
    return normalizeInventoryType(type);
  } catch {
    return null;
  }
};

const hasInventoryId = (id) => (
  id !== undefined
  && id !== null
  && String(id).trim() !== ''
  && !String(id).startsWith('restored-')
);

export async function ensureQuotationInventoryLinks(items, { readTable, insertRows }) {
  const lines = Array.isArray(items) ? items : [];
  const { data: inventory, error: readError } = await readTable('inventory', {
    orderBy: 'sort_order',
    ascending: true,
  });
  if (readError) throw readError;

  const inventoryItems = inventory || [];
  let nextSortOrder = Math.max(0, ...inventoryItems.map((item) => Number(item.sort_order) || 0));
  let createdCount = 0;
  const resolvedLines = lines.map((line) => {
    const type = normalizeInventoryType(line.item_type);
    const reference = line.inventory_id ?? line.id;
    const existingById = hasInventoryId(reference)
      ? inventoryItems.find((item) => String(item.id) === String(reference))
      : null;

    if (existingById && getInventoryType(existingById.item_type) === type) {
      return { line, type, inventoryItem: existingById };
    }

    const normalizedTitle = normalizeInventoryTitle(line.title);
    if (!normalizedTitle) throw new Error('برای افزودن کالا به انبار، نام کالا یا خدمت لازم است.');

    const matches = inventoryItems.filter((item) => (
      normalizeInventoryTitle(item.title) === normalizedTitle
      && getInventoryType(item.item_type) === type
    ));
    if (matches.length > 1) {
      throw new Error(`برای «${line.title}» چند کالای هم‌نام و هم‌نوع در انبار وجود دارد؛ ابتدا موارد تکراری را بررسی کنید.`);
    }

    return { line, type, normalizedTitle, inventoryItem: matches[0] || null };
  });

  const resolvedIds = resolvedLines
    .filter(({ inventoryItem }) => inventoryItem)
    .map(({ inventoryItem }) => String(inventoryItem.id));
  const missingKeys = resolvedLines
    .filter(({ inventoryItem }) => !inventoryItem)
    .map(({ normalizedTitle, type }) => `${normalizedTitle}:${type}`);
  const referencedIds = [...resolvedIds, ...missingKeys];
  if (new Set(referencedIds).size !== referencedIds.length) {
    throw new Error('یک کالا بیش از یک بار در فاکتور آمده است؛ تعداد همان ردیف را اصلاح کنید.');
  }

  const linkedItems = [];
  for (const resolved of resolvedLines) {
    let { inventoryItem } = resolved;
    if (!inventoryItem) {
      const { line, type } = resolved;
      nextSortOrder += 1;
      const { data, error } = await insertRows('inventory', [{
        title: String(line.title).trim(),
        item_type: type,
        sort_order: nextSortOrder,
        base_cost: parseNumericInput(line.cost ?? line.base_cost),
        price_level1: parseNumericInput(line.p1 ?? line.price_level1 ?? line.unit_price ?? line.price),
        price_level2: parseNumericInput(line.p2 ?? line.price_level2),
        price_level3: parseNumericInput(line.p3 ?? line.price_level3),
        image: line.image || null,
      }]);
      if (error) throw error;
      inventoryItem = data?.[0];
      if (!inventoryItem?.id) throw new Error(`«${line.title}» ذخیره شد اما شناسهٔ آن از انبار دریافت نشد.`);
      inventoryItems.push(inventoryItem);
      createdCount += 1;
    }

    linkedItems.push({
      ...resolved.line,
      inventory_id: inventoryItem.id,
      item_type: resolved.type,
    });
  }

  return { items: linkedItems, createdCount };
}

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

  const quotationItems = quotation.items_json || quotation.items_data || [];
  const { items } = await ensureQuotationInventoryLinks(quotationItems, { readTable, insertRows });
  const { data, error } = await insertRows('invoices', [{
    quotation_id: String(quotation.id),
    customer_name: quotation.customer_name,
    customer_phone: quotation.customer_phone || quotation.phone || '',
    total_price: quotation.total_price,
    discount_amount: Number(quotation.discount_amount || 0),
    paid_amount: 0,
    payment_status: 'unpaid',
    items_data: items,
    is_official: true,
  }]);
  if (error) throw error;
  return { alreadyConverted: false, invoice: data?.[0] || null };
}

export function getInvoiceDeletionErrorMessage(error) {
  const message = error?.message || 'خطای نامشخص';
  if (
    error?.code === '23503'
    && message.includes('cash_transactions_invoice_id_fkey')
  ) {
    return 'این فاکتور به گردش صندوق یا بانک متصل است. برای حفظ گردش‌های مالی و امکان حذف فاکتور، migration فایل supabase/migrations/20261101120000_invoice_cash_transaction_set_null.sql را در SQL Editor سوپابیس اجرا کنید؛ گردش‌ها باقی می‌مانند و فقط اتصالشان به فاکتور حذف‌شده پاک می‌شود.';
  }
  if (
    error?.code === '23503'
    && message.includes('invoice_expenses_cash_transaction_id_fkey')
  ) {
    return 'این فاکتور هزینهٔ پرداخت‌شده دارد که به گردش صندوق/بانک وصل است؛ برای حفظ سوابق مالی، ابتدا باید فاکتور و هزینه‌های ثبت‌شده بررسی شوند.';
  }
  return message;
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
      const partialError = new Error(getInvoiceDeletionErrorMessage(error));
      partialError.partial = deletedQuotations;
      throw partialError;
    }
  }
}

export async function updateOfficialInvoice(id, updates, { updateRows }) {
  const { error } = await updateRows('invoices', updates, [{ column: 'id', operator: 'eq', value: id }]);
  if (error) throw error;
}

export async function updateQuotation(id, updates, { updateRows }) {
  if (id === undefined || id === null || id === '') {
    throw new Error('شناسهٔ پیش‌فاکتور معتبر نیست.');
  }
  const { data, error } = await updateRows('quotations', updates, [
    { column: 'id', operator: 'eq', value: id },
  ]);
  if (error) throw error;
  if (!data?.length) throw new Error('پیش‌فاکتور برای ذخیرهٔ تغییرات پیدا نشد.');
  return data;
}
