import React, { useState, useEffect } from 'react';
import { formatDisplay, formatPersianDigits } from '../styles';
import { deleteRows, insertRows, readTable, updateRows } from '../offlineSync';
import { formatPersianDate } from '../dateUtils';
import { getInventoryQuantity, getReservedQuantity } from '../inventoryUtils';
import FormattedNumberInput from './FormattedNumberInput';
import PersianDateInput from './PersianDateInput';
import { convertQuotationToInvoice, deleteSelectedDocuments, updateQuotation } from '../quotationInvoice';
import { renderBusinessContactHtml } from '../profileLinks';
import { buildInvoicePrintHtml } from '../invoicePrintTemplate';

const win95Style = {
  window: { 
    fontFamily: 'var(--font-main)',
    direction: 'rtl', 
    backgroundColor: '#f4f6f8',
    padding: '18px',
    border: '1px solid #dfe5eb',
    borderRadius: '12px',
    color: '#1a1a2e',
    fontSize: '13px',
    width: '100%',
    boxSizing: 'border-box'
  },
  header: { 
    backgroundColor: '#28645a',
    color: '#ffffff', 
    padding: '10px 12px', 
    fontWeight: 'bold', 
    fontSize: '14px', 
    borderRadius: '8px',
    marginBottom: '12px' 
  },
  input: { 
    border: '1px solid #d7dee5',
    background: '#fff', 
    padding: '6px 8px', 
    fontSize: '12px', 
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box'
  },
  button: { 
    backgroundColor: '#28645a',
    border: 'none', 
    padding: '7px 12px', 
    fontSize: '12px', 
    cursor: 'pointer',
    fontWeight: 'bold',
    color: '#ffffff',
    borderRadius: '6px',
    transition: 'all 0.2s ease'
  },
  tableHeader: { 
    background: '#f1f5f9', 
    borderBottom: '1px solid #e2e8f0', 
    padding: '8px 10px', 
    fontSize: '12px', 
    textAlign: 'right',
    color: '#64748b',
    fontWeight: 'bold'
  },
  tableCell: { 
    borderBottom: '1px solid #f1f5f9', 
    padding: '8px 10px', 
    fontSize: '12px',
    color: '#334155'
  }
};

const hasInventoryReference = (value) => (
  value !== undefined
  && value !== null
  && String(value).trim() !== ''
  && !String(value).startsWith('restored-')
);

export default function QuotationPanel({ inventoryItems = [], onItemSelected, onInventoryChanged, selectedItems = [], setSelectedItems, businessName = 'تشریفات آژو', logoUrl = '/azho-logo.png', businessContact }) {
  const items = selectedItems || [];
  const [customers, setCustomers] = useState([]);
  const [inventoryPickerOpen, setInventoryPickerOpen] = useState(false);
  const [inventorySearchTerm, setInventorySearchTerm] = useState('');
  const [editingInventoryItemId, setEditingInventoryItemId] = useState(null);
  const [inventoryEditForm, setInventoryEditForm] = useState({});
  const [savingInventoryItem, setSavingInventoryItem] = useState(false);
  const [inventoryCreateOpen, setInventoryCreateOpen] = useState(false);
  const [savingNewInventoryItem, setSavingNewInventoryItem] = useState(false);
  const [newInventoryForm, setNewInventoryForm] = useState({
    title: '',
    item_type: 'sale',
    warehouse_id: '',
    initial_quantity: '',
    base_cost: '',
    price_level1: '',
    price_level2: '',
    price_level3: '',
  });
  const [pickerWarehouses, setPickerWarehouses] = useState([]);
  const [pickerWarehouseId, setPickerWarehouseId] = useState('');
  const [pickerMovements, setPickerMovements] = useState([]);
  const [pickerReservations, setPickerReservations] = useState([]);
  const [pickerStockLoading, setPickerStockLoading] = useState(false);
  const [pickerStockError, setPickerStockError] = useState('');
  const [pickerStockOffline, setPickerStockOffline] = useState(false);
  const [pickerQuantities, setPickerQuantities] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showBuyingPrice, setShowBuyingPrice] = useState(false);
  
  const [showAddCustomerForm, setShowAddCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  const [quotationDate, setQuotationDate] = useState(new Date().toLocaleDateString('fa-IR'));
  const [discountAmount, setDiscountAmount] = useState('0');
  const [savedInvoices, setSavedInvoices] = useState([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const [convertingQuotationId, setConvertingQuotationId] = useState(null);
  const [editingQuotationId, setEditingQuotationId] = useState(null);

  useEffect(() => {
    fetchCustomers();
    fetchInvoices();
    const refreshData = () => {
      fetchCustomers();
      fetchInvoices();
    };
    window.addEventListener('offline-data-updated', refreshData);
    return () => window.removeEventListener('offline-data-updated', refreshData);
  }, []);

  useEffect(() => {
    const handleAppEscape = (event) => {
      if (inventoryPickerOpen) {
        event.preventDefault();
        if (inventoryCreateOpen) {
          setInventoryCreateOpen(false);
        } else if (editingInventoryItemId !== null) {
          setEditingInventoryItemId(null);
          setInventoryEditForm({});
        } else {
          setInventoryPickerOpen(false);
        }
        return;
      }
      if (isSearching) {
        event.preventDefault();
        setIsSearching(false);
        return;
      }
      if (showAddCustomerForm) {
        event.preventDefault();
        setShowAddCustomerForm(false);
        setNewCustomerName('');
        setNewCustomerPhone('');
      }
    };
    window.addEventListener('app-escape', handleAppEscape);
    return () => window.removeEventListener('app-escape', handleAppEscape);
  }, [editingInventoryItemId, inventoryCreateOpen, inventoryPickerOpen, isSearching, showAddCustomerForm]);

  useEffect(() => {
    if (!inventoryPickerOpen) return undefined;
    let active = true;
    Promise.all([
      readTable('inventory_warehouses', { orderBy: 'name', ascending: true }),
      readTable('inventory_stock_movements', { orderBy: 'created_at', ascending: false }),
      readTable('inventory_reservations', { orderBy: 'created_at', ascending: false }),
    ]).then(([warehouseResult, movementResult, reservationResult]) => {
      const failed = [warehouseResult, movementResult, reservationResult].find((result) => result.error);
      if (failed) throw failed.error;
      if (!active) return;
      const warehouses = warehouseResult.data || [];
      setPickerWarehouses(warehouses);
      setPickerMovements(movementResult.data || []);
      setPickerReservations(reservationResult.data || []);
      setPickerStockOffline(Boolean(warehouseResult.offline || movementResult.offline || reservationResult.offline));
      setPickerStockError('');
      setPickerWarehouseId((current) => (
        warehouses.some((warehouse) => String(warehouse.id) === String(current))
          ? current
          : String((warehouses.find((warehouse) => warehouse.is_default) || warehouses[0])?.id || '')
      ));
      setNewInventoryForm((current) => ({
        ...current,
        warehouse_id: warehouses.some((warehouse) => String(warehouse.id) === String(current.warehouse_id))
          ? current.warehouse_id
          : String((warehouses.find((warehouse) => warehouse.is_default) || warehouses[0])?.id || ''),
      }));
    }).catch((error) => {
      if (active) setPickerStockError(`دریافت موجودی انبار ناموفق بود: ${error.message}`);
    }).finally(() => {
      if (active) setPickerStockLoading(false);
    });
    return () => {
      active = false;
    };
  }, [inventoryPickerOpen]);

  async function fetchCustomers() {
    try {
      const { data, error } = await readTable('customers', { orderBy: 'Full name', ascending: true });
      
      if (error) throw error;
      if (data) setCustomers(data);
    } catch (err) {
      console.error('خطا در دریافت مشتریان:', err.message);
    }
  }

  async function handleAddNewCustomer() {
    if (!newCustomerName.trim()) { 
      alert("نام مشتری الزامی است."); 
      return; 
    }
    
    try {
      const { error } = await insertRows('customers', [{
          "Full name": newCustomerName.trim(), 
          "phone": newCustomerPhone.trim() 
        }]);

      if (error) throw error;

      alert("مشتری جدید با موفقیت اضافه شد.");
      setSelectedCustomer({ "Full name": newCustomerName.trim(), "phone": newCustomerPhone.trim() });
      setSearchTerm(newCustomerName.trim());
      setNewCustomerName('');
      setNewCustomerPhone('');
      setShowAddCustomerForm(false);
      setIsSearching(false);
      fetchCustomers();
    } catch (error) {
      alert("خطا در افزودن مشتری: " + error.message);
    }
  }

  async function fetchInvoices() {
    try {
      const { data: quotations, error: quotationError } = await readTable('quotations', {
        orderBy: 'created_at',
        ascending: false,
      });
      if (quotationError) throw quotationError;

      const { data: officialInvoices, error: invoiceError } = await readTable('invoices', {
        orderBy: 'created_at',
        ascending: false,
      });
      if (invoiceError) throw invoiceError;
      
      const combined = [
        ...(quotations || []).map(item => ({ ...item, type: 'quotation' })),
        ...(officialInvoices || []).map(item => ({ ...item, type: 'official' }))
      ];

      combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setSavedInvoices(combined);
      setSelectedInvoiceIds([]);
    } catch (err) {
      console.error('خطا در دریافت فاکتورها:', err.message);
    }
  }

  const getQuantity = (val) => {
    const quantity = Number(val);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  };

  const total1 = items.reduce((sum, item) => sum + (Number(item.price_level1) || 0) * getQuantity(item.requestedQuantity), 0);
  const total2 = items.reduce((sum, item) => sum + (Number(item.price_level2) || 0) * getQuantity(item.requestedQuantity), 0);
  const total3 = items.reduce((sum, item) => sum + (Number(item.price_level3) || 0) * getQuantity(item.requestedQuantity), 0);
  const numericDiscount = Math.max(0, Number(discountAmount) || 0);
  const finalTotal = Math.max(0, total1 - numericDiscount);
  const paidAmount = 0;
  const remainingAmount = Math.max(0, finalTotal - paidAmount);
  const filteredInventoryItems = inventoryItems.filter((item) => (
    item.title?.toLowerCase().includes(inventorySearchTerm.trim().toLowerCase())
  ));

  const handleAddPickerItem = (item) => {
    const quantity = Number(pickerQuantities[item.id] ?? 1);
    if (!Number.isFinite(quantity) || quantity <= 0 || (String(quantity).split('.')[1] || '').length > 3) {
      alert('تعداد باید عددی بیشتر از صفر و حداکثر با سه رقم اعشار باشد.');
      return;
    }
    if (setSelectedItems) {
      setSelectedItems((currentItems) => {
        const existing = currentItems.find((currentItem) => (
          String(currentItem.inventory_id || currentItem.id) === String(item.id)
        ));
        if (existing) {
          return currentItems.map((currentItem) => (
            currentItem === existing
              ? { ...currentItem, requestedQuantity: quantity, quantity }
              : currentItem
          ));
        }
        return [...currentItems, { ...item, requestedQuantity: quantity, quantity }];
      });
    } else {
      onItemSelected?.({ ...item, requestedQuantity: quantity, quantity });
    }
  };

  const handleStartInventoryItemEdit = (item) => {
    setEditingInventoryItemId(item.id);
    setInventoryEditForm({
      title: item.title || '',
      item_type: item.item_type || 'sale',
      price_level1: item.price_level1 ?? 0,
      price_level2: item.price_level2 ?? 0,
      price_level3: item.price_level3 ?? 0,
    });
  };

  const handleSaveInventoryItemEdit = async (item) => {
    if (!inventoryEditForm.title.trim()) {
      alert('نام کالا یا خدمت را وارد کنید.');
      return;
    }

    const updatedItem = {
      title: inventoryEditForm.title.trim(),
      item_type: inventoryEditForm.item_type || 'sale',
      price_level1: Number(inventoryEditForm.price_level1) || 0,
      price_level2: Number(inventoryEditForm.price_level2) || 0,
      price_level3: Number(inventoryEditForm.price_level3) || 0,
    };

    setSavingInventoryItem(true);
    try {
      const { error } = await updateRows(
        'inventory',
        updatedItem,
        [{ column: 'id', operator: 'eq', value: item.id }],
      );
      if (error) throw error;

      setSelectedItems?.((currentItems) => currentItems.map((currentItem) => (
        String(currentItem.id) === String(item.id)
          ? { ...currentItem, ...updatedItem }
          : currentItem
      )));
      setEditingInventoryItemId(null);
      setInventoryEditForm({});
      window.dispatchEvent(new Event('offline-data-updated'));
      onInventoryChanged?.();
    } catch (error) {
      alert(`خطا در ویرایش کالا: ${error.message}`);
    } finally {
      setSavingInventoryItem(false);
    }
  };

  const handleCreateInventoryItem = async (event) => {
    event.preventDefault();
    const title = newInventoryForm.title.trim();
    const initialQuantity = newInventoryForm.initial_quantity === ''
      ? 0
      : Number(newInventoryForm.initial_quantity);
    const baseCost = newInventoryForm.base_cost === '' ? 0 : Number(newInventoryForm.base_cost);
    if (!title) {
      alert('نام کالا یا خدمت را وارد کنید.');
      return;
    }
    if (!Number.isFinite(initialQuantity) || initialQuantity < 0
      || (String(newInventoryForm.initial_quantity).split('.')[1] || '').length > 3) {
      alert('موجودی اولیه باید عددی نامنفی با حداکثر سه رقم اعشار باشد.');
      return;
    }
    if (!Number.isSafeInteger(baseCost) || baseCost < 0) {
      alert('قیمت خرید باید عدد صحیح و نامنفی باشد.');
      return;
    }
    if (initialQuantity > 0 && !newInventoryForm.warehouse_id) {
      alert('برای ثبت موجودی اولیه، یک انبار انتخاب کنید.');
      return;
    }
    setSavingNewInventoryItem(true);
    let createdItem = null;
    try {
      const { data, error } = await insertRows('inventory', [{
        title,
        item_type: newInventoryForm.item_type,
        sort_order: Math.max(0, ...inventoryItems.map((item) => Number(item.sort_order) || 0)) + 1,
        base_cost: baseCost,
        price_level1: Number(newInventoryForm.price_level1) || 0,
        price_level2: Number(newInventoryForm.price_level2) || 0,
        price_level3: Number(newInventoryForm.price_level3) || 0,
      }]);
      if (error) throw error;
      createdItem = data?.[0];
      if (!createdItem?.id) throw new Error('کالا ذخیره شد اما شناسهٔ آن دریافت نشد.');

      if (initialQuantity > 0) {
        const movementResult = await insertRows('inventory_stock_movements', [{
          inventory_id: createdItem.id,
          warehouse_id: Number(newInventoryForm.warehouse_id),
          movement_type: 'opening',
          quantity_delta: initialQuantity,
          unit_cost: baseCost || null,
          note: 'موجودی اولیه هنگام ثبت کالا',
          source_type: 'manual',
          source_id: null,
          offline_sync_id: crypto.randomUUID(),
        }]);
        if (movementResult.error) {
          throw new Error(`کالا ثبت شد، اما ثبت موجودی اولیه ناموفق بود: ${movementResult.error.message}`);
        }
        setPickerMovements((current) => [...current, ...(movementResult.data || [])]);
      }

      const quotationItem = { ...createdItem, requestedQuantity: 1, quantity: 1 };
      setSelectedItems?.((currentItems) => [...currentItems, quotationItem]);
      setPickerQuantities((current) => ({ ...current, [createdItem.id]: '1' }));
      setNewInventoryForm({
        title: '',
        item_type: 'sale',
        warehouse_id: newInventoryForm.warehouse_id,
        initial_quantity: '',
        base_cost: '',
        price_level1: '',
        price_level2: '',
        price_level3: '',
      });
      setInventoryCreateOpen(false);
      window.dispatchEvent(new Event('inventory-data-updated'));
      await onInventoryChanged?.();
      alert('کالای جدید ثبت و به پیش‌فاکتور اضافه شد.');
    } catch (error) {
      if (createdItem) {
        window.dispatchEvent(new Event('inventory-data-updated'));
        await onInventoryChanged?.();
      }
      alert(`ثبت کالای جدید ناموفق بود: ${error.message}`);
    } finally {
      setSavingNewInventoryItem(false);
    }
  };

  const handleSaveAndPrint = async () => {
    if (!selectedCustomer) { 
      alert("لطفاً ابتدا مشتری را انتخاب کنید."); 
      return; 
    }
    if (items.length === 0) { 
      alert("لیست کالاها خالی است."); 
      return; 
    }
    if (!Number.isSafeInteger(numericDiscount) || numericDiscount > total1) {
      alert('مبلغ تخفیف باید عدد صحیح و بین صفر تا مبلغ کل درجهٔ یک باشد.');
      return;
    }

    const rentalItemsWithoutDates = items.filter((item) => {
      const inventoryReference = item.inventory_id || item.id;
      const isInventoryItem = hasInventoryReference(inventoryReference);
      const isRent = ['rent', 'اجاره', 'اجاره‌ای'].includes(item.item_type);
      return isInventoryItem
        && isRent
        && (!item.rental_checkout_date
          || !item.rental_return_date
          || item.rental_return_date < item.rental_checkout_date);
    });
    if (rentalItemsWithoutDates.length) {
      alert('برای هر کالای اجاره‌ای از انبار، تاریخ تحویل و مهلت عودت معتبر را وارد کنید.');
      return;
    }

    setIsSaving(true);
    try {
      const itemsPayload = items.map(i => {
        const qty = getQuantity(i.requestedQuantity);
        const inventoryReference = i.inventory_id || i.id;
        const unitPrice = Number(i.price_level1) || 0;
        const unitCost = Number(i.base_cost) || 0;
        const lineTotal = unitPrice * qty;
        const lineCost = unitCost * qty;
        const typeNormalized = (i.item_type === 'rent' || i.item_type === 'اجاره' || i.item_type === 'اجاره‌ای') ? 'rent' : 'sale';

        return {
          title: i.title,
          ...(hasInventoryReference(inventoryReference)
            ? { inventory_id: inventoryReference }
            : {}),
          qty: qty,
          p1: Number(i.price_level1) || 0,
          p2: Number(i.price_level2) || 0,
          p3: Number(i.price_level3) || 0,
          cost: unitCost,
          item_type: typeNormalized,
          unit_price: unitPrice,
          total_price: lineTotal,
          total_cost: lineCost,
          profit: lineTotal - lineCost,
          ...(typeNormalized === 'rent'
            ? {
                rental_checkout_date: i.rental_checkout_date || null,
                rental_return_date: i.rental_return_date || null,
              }
            : {}),
        };
      });

      const quotationPayload = {
        customer_name: selectedCustomer["Full name"],
        customer_phone: selectedCustomer.phone || '',
        items_json: itemsPayload,
        total_price: finalTotal,
        discount_amount: numericDiscount,
      };
      let savedQuotations;
      if (editingQuotationId) {
        const linkedInvoice = savedInvoices.find((invoice) => (
          invoice.type === 'official' && String(invoice.quotation_id) === editingQuotationId
        ));
        if (linkedInvoice) {
          throw new Error('این پیش‌فاکتور قبلاً رسمی شده و امکان ویرایش آن وجود ندارد.');
        }
        savedQuotations = await updateQuotation(
          editingQuotationId,
          quotationPayload,
          { updateRows },
        );
        alert('تغییرات پیش‌فاکتور با موفقیت ذخیره شد.');
        setEditingQuotationId(null);
      } else {
        const { data, error } = await insertRows('quotations', [quotationPayload]);
        if (error) throw error;
        savedQuotations = data;
        alert('پیش‌فاکتور با موفقیت ذخیره شد.');
      }
      await fetchInvoices();

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        const quotationRows = items.map((item) => {
          const quantity = getQuantity(item.requestedQuantity);
          const isRent = ['rent', 'اجاره', 'اجاره‌ای'].includes(item.item_type);
          const rentalDates = isRent
            ? `تحویل: ${formatPersianDate(item.rental_checkout_date)} | عودت: ${formatPersianDate(item.rental_return_date)}`
            : '';
          return {
            title: item.title,
            details: [isRent ? 'اجاره‌ای' : 'فروشی', rentalDates].filter(Boolean).join(' | '),
            quantity,
            prices: [
              { label: 'درجه ۱', unit: item.price_level1, total: Number(item.price_level1 || 0) * quantity },
              { label: 'درجه ۲', unit: item.price_level2, total: Number(item.price_level2 || 0) * quantity },
              { label: 'درجه ۳', unit: item.price_level3, total: Number(item.price_level3 || 0) * quantity },
            ],
          };
        });
        const savedQuotationId = savedQuotations?.[0]?.id;
        const quotationHtml = buildInvoicePrintHtml({
          documentType: 'پیش‌فاکتور فروش و اجاره',
          businessName,
          logoUrl,
          number: savedQuotationId ? formatPersianDigits(savedQuotationId) : 'ثبت آفلاین',
          createdDate: quotationDate,
          customerName: selectedCustomer['Full name'],
          customerPhone: selectedCustomer.phone,
          customerAddress: selectedCustomer.address,
          items: quotationRows,
          totals: [
            { label: 'جمع کل · درجه ۱', value: total1 },
            { label: 'جمع کل · درجه ۲', value: total2 },
            { label: 'جمع کل · درجه ۳', value: total3 },
            { label: 'تخفیف', value: numericDiscount },
            { label: 'مبلغ نهایی · درجه ۱', value: finalTotal, emphasis: true },
            { label: 'مبلغ پرداختی / پیش‌پرداخت', value: paidAmount },
            { label: 'مانده حساب', value: remainingAmount },
          ],
          note: 'این پیش‌فاکتور جهت برآورد هزینه صادر شده و دریافت وجه پس از صدور فاکتور رسمی ثبت می‌شود.',
          contactHtml: renderBusinessContactHtml(businessContact),
          autoPrint: true,
        });
        printWindow.document.write(quotationHtml);
        printWindow.document.close();
      }
    } catch (err) { 
      alert("خطا در ذخیره‌سازی پیش‌فاکتور: " + err.message); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const handleConvertToInvoice = async (e, inv) => {
    e.stopPropagation();
    if (inv.type === 'official') {
      alert('این فاکتور قبلاً رسمی است.');
      return; 
    }

    const existingInvoice = savedInvoices.find((invoice) =>
      invoice.type === 'official' && String(invoice.quotation_id) === String(inv.id),
    );
    if (existingInvoice) {
      alert(`این پیش‌فاکتور قبلاً به فاکتور رسمی شمارهٔ ${formatPersianDigits(existingInvoice.id)} تبدیل شده است.`);
      return;
    }

    const confirmConversion = window.confirm(`آیا مطمئن هستید که می‌خواهید پیش‌فاکتور «${inv.customer_name}» را به فاکتور رسمی تبدیل کنید؟`);
    if (!confirmConversion) return;

    setConvertingQuotationId(String(inv.id));
    try {
      const result = await convertQuotationToInvoice(inv, { readTable, insertRows });
      if (result.alreadyConverted) {
        alert(`این پیش‌فاکتور قبلاً به فاکتور رسمی شمارهٔ ${formatPersianDigits(result.invoice.id)} تبدیل شده است.`);
      } else {
        alert('فاکتور رسمی با موفقیت صادر شد و در گزارش مالی قرار گرفت.');
      }
      await fetchInvoices();
    } catch (error) {
      const detail = error.code === '23505'
        ? 'این پیش‌فاکتور قبلاً از دستگاه دیگری به فاکتور رسمی تبدیل شده است؛ فهرست را تازه‌سازی کنید.'
        : /quotation_id.*(column|schema)/i.test(error.message || '')
          ? 'ارتباط پیش‌فاکتور و فاکتور نیاز به migration supabase/migrations/20261023190000_link_quotations_to_invoices.sql دارد.'
        : (error.message || '').includes('این خروج موجودی با رزروهای فعال تداخل دارد')
          ? 'برای ثبت کسریِ تأییدشدهٔ موجودی و صدور فاکتور، migration supabase/migrations/20261101192000_invoice_inventory_reconciliation.sql را در SQL Editor سوپابیس اجرا کنید.'
        : error.message;
      alert(`خطا در صدور فاکتور رسمی: ${detail}`);
    } finally {
      setConvertingQuotationId(null);
    }

  };

  const handleQuantityChange = (itemId, value) => {
    if (setSelectedItems) {
      setSelectedItems(items.map(item => item.id === itemId ? { ...item, requestedQuantity: value } : item));
    }
  };

  const handleQuotationItemChange = (itemId, field, value) => {
    if (setSelectedItems) {
      setSelectedItems(items.map((item) => (
        item.id === itemId ? { ...item, [field]: value } : item
      )));
    }
  };

  const handleRemoveItem = (itemId) => {
    if (setSelectedItems) {
      setSelectedItems(items.filter(item => item.id !== itemId));
    }
  };

  const handleLoadInvoice = (inv, { editing = false, notify = true, discardChanges = true } = {}) => {
    if (
      editingQuotationId
      && (String(editingQuotationId) !== String(inv.id) || !editing)
      && discardChanges
      && !window.confirm('تغییرات ذخیره‌نشده کنار گذاشته شود؟')
    ) return;
    const itemsData = inv.items_json || inv.items_data || [];
    const restoredItems = itemsData.map((item, index) => ({
      id: item.id || `restored-${index}-${Date.now()}`, 
      inventory_id: item.inventory_id,
      title: item.title, 
      requestedQuantity: item.qty, 
      price_level1: item.p1 || item.unit_price || 0, 
      price_level2: item.p2 || 0, 
      price_level3: item.p3 || 0, 
      base_cost: item.cost || 0,
      item_type: item.item_type || 'sale',
      rental_checkout_date: item.rental_checkout_date || '',
      rental_return_date: item.rental_return_date || '',
    }));
    
    if (setSelectedItems) {
      setSelectedItems(restoredItems);
    }
    const matchingCustomer = customers.find((customer) => (
      customer['Full name'] === inv.customer_name
    ));
    setDiscountAmount(String(inv.discount_amount || 0));
    setSearchTerm(inv.customer_name || '');
    setSelectedCustomer(matchingCustomer || {
      'Full name': inv.customer_name || '',
      phone: inv.customer_phone || '',
    });
    setEditingQuotationId(editing && inv.type !== 'official' ? String(inv.id) : null);
    if (notify) alert(`پیش‌فاکتور مشتری «${inv.customer_name}» بارگذاری شد.`);
  };

  const handleEditQuotation = (event, quotation) => {
    event.stopPropagation();
    const linkedInvoice = savedInvoices.find((invoice) => (
      invoice.type === 'official' && String(invoice.quotation_id) === String(quotation.id)
    ));
    if (linkedInvoice) {
      alert('این پیش‌فاکتور قبلاً رسمی شده و امکان ویرایش آن وجود ندارد.');
      return;
    }
    handleLoadInvoice(quotation, { editing: true });
  };

  const handleCancelQuotationEdit = () => {
    const quotation = savedInvoices.find((invoice) => (
      invoice.type !== 'official' && String(invoice.id) === editingQuotationId
    ));
    if (quotation) {
      handleLoadInvoice(quotation, { notify: false, discardChanges: false });
    } else {
      setEditingQuotationId(null);
    }
  };

  const handleToggleSelectInvoice = (e, id) => {
    e.stopPropagation();
    setSelectedInvoiceIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };

  const handleDeleteSelectedInvoices = async () => {
    if (selectedInvoiceIds.length === 0) { 
      alert("لطفاً حداقل یک فاکتور را انتخاب کنید."); 
      return; 
    }
    
    if (!window.confirm(`آیا از حذف ${formatDisplay(selectedInvoiceIds.length)} فاکتور انتخاب‌شده اطمینان دارید؟`)) return;

    try {
      await deleteSelectedDocuments(selectedInvoiceIds, savedInvoices, { deleteRows });
      alert("فاکتورهای انتخاب‌شده با موفقیت حذف شدند.");
      fetchInvoices();
    } catch (err) {
      if (err.partial) {
        alert(`بخشی از حذف انجام شد اما عملیات کامل نشد: ${err.message} فهرست را تازه‌سازی و موارد باقی‌مانده را بررسی کنید.`);
        fetchInvoices();
      } else {
        alert("خطا در حذف دسته‌ای: " + err.message);
      }
    }
  };

  return (
    <div className="quotation-panel" style={win95Style.window}>
      <header className="quotation-heading">
        <div>
          <span className="quotation-heading-kicker">مدیریت اسناد فروش</span>
          <h2>مدیریت و صدور پیش‌فاکتور</h2>
          <p>اقلام را از انبار انتخاب کنید و پیش‌فاکتور مشتری را صادر کنید.</p>
        </div>
        <button
          type="button"
          className="quotation-new-button"
          onClick={() => {
            setInventorySearchTerm('');
            setPickerStockLoading(true);
            setPickerStockError('');
            setInventoryPickerOpen(true);
          }}
        >
          {editingQuotationId ? 'افزودن کالا به پیش‌فاکتور' : 'صدور پیش‌فاکتور جدید'}
        </button>
      </header>

      {editingQuotationId && (
        <div className="quotation-editing-banner" role="status">
          <span>در حال ویرایش پیش‌فاکتور شمارهٔ {formatPersianDigits(editingQuotationId)}؛ برای افزودن کالا از دکمهٔ بالا استفاده کنید.</span>
          <button type="button" onClick={handleCancelQuotationEdit}>لغو ویرایش</button>
        </div>
      )}

      <div className="quotation-workspace">
        <main className="quotation-editor">
          <div className="quotation-customer-bar">
            <div className="quotation-date-field">
              <label htmlFor="quotation-date">تاریخ صدور</label>
              <input
                id="quotation-date"
                style={{ ...win95Style.input, width: '120px', textAlign: 'center' }}
                value={quotationDate}
                onChange={(e) => setQuotationDate(e.target.value)}
              />
            </div>

            <div className="quotation-customer-field">
              <label htmlFor="quotation-customer-search">مشتری</label>
              <input
                id="quotation-customer-search"
                style={{ ...win95Style.input, width: '220px' }}
                placeholder="جستجوی نام مشتری..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedCustomer(null);
                  setIsSearching(true);
                }}
              />
              <button
                style={win95Style.button}
                onClick={() => setShowAddCustomerForm(!showAddCustomerForm)}>
                {showAddCustomerForm ? 'بستن فرم' : '+ مشتری جدید'}
              </button>
            </div>

            <button
              className="quotation-buying-price-toggle"
              onClick={() => setShowBuyingPrice(!showBuyingPrice)}>
              {showBuyingPrice ? 'مخفی کردن قیمت خرید' : 'نمایش قیمت خرید'}
            </button>
          </div>

          {showAddCustomerForm && (
            <div className="quotation-new-customer-form">
              <div className="accounting-field">
                <label htmlFor="quotation-new-customer-name">نام و نام خانوادگی</label>
                <input
                  id="quotation-new-customer-name"
                  style={win95Style.input}
                  placeholder="نام مشتری"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                />
              </div>
              <div className="accounting-field">
                <label htmlFor="quotation-new-customer-phone">شماره تماس</label>
                <input
                  id="quotation-new-customer-phone"
                  style={win95Style.input}
                  type="tel"
                  inputMode="tel"
                  placeholder="مثلاً 09123456789"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                />
              </div>
              <button
                className="quotation-add-customer-submit"
                style={{ ...win95Style.button, backgroundColor: '#10b981' }}
                onClick={handleAddNewCustomer}>
                ذخیره مشتری
              </button>
            </div>
          )}

          {isSearching && searchTerm && (
            <div className="quotation-customer-suggestions">
              {customers.filter(c => (c['Full name'] || '').toLowerCase().includes(searchTerm.toLowerCase())).map((c) => (
                <div
                  key={c.id || c['Full name']}
                  onClick={() => {
                    setSelectedCustomer(c);
                    setSearchTerm(c['Full name']);
                    setIsSearching(false);
                  }}>
                  <strong>{c['Full name']}</strong> {c.phone ? `(${formatPersianDigits(c.phone)})` : '(بدون تلفن)'}
                </div>
              ))}
            </div>
          )}

          <section className="quotation-table-card">
            <div className="quotation-section-heading">
              <div>
                <h3>اقلام پیش‌فاکتور</h3>
                <span>برای افزودن کالا، از فهرست انبار استفاده کنید.</span>
              </div>
              <span className="quotation-items-count">{formatDisplay(items.length)} قلم</span>
            </div>
            <div className="quotation-items-table-wrap">
          <table className="quotation-items-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "right", fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ ...win95Style.tableHeader, textAlign: 'center', width: '60px' }}>حذف</th>
                <th style={{ ...win95Style.tableHeader, width: '45px', textAlign: 'center' }}>ردیف</th>
                <th style={win95Style.tableHeader}>نام کالا / خدمت</th>
                <th style={{ ...win95Style.tableHeader, textAlign: 'center', width: '90px' }}>نوع کالا</th>
                <th style={{ ...win95Style.tableHeader, textAlign: 'center', width: '85px' }}>تعداد</th>
                <th style={{ ...win95Style.tableHeader, textAlign: 'center' }}>بازهٔ اجاره</th>
                <th style={win95Style.tableHeader}>درجه ۱ (تومان)</th>
                <th style={win95Style.tableHeader}>درجه ۲ (تومان)</th>
                <th style={win95Style.tableHeader}>درجه ۳ (تومان)</th>
                {showBuyingPrice && <th style={win95Style.tableHeader}>قیمت خرید (تومان)</th>}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr className="quotation-items-empty-row">
                  <td colSpan={showBuyingPrice ? 10 : 9} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                    هیچ کالایی به پیش‌فاکتور اضافه نشده است. (از دکمهٔ «صدور پیش‌فاکتور جدید» استفاده کنید)
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr key={item.id || index}>
                    <td data-label="حذف" style={{ ...win95Style.tableCell, textAlign: 'center' }}>
                      <button
                        className="invoice-item-remove-button"
                        onClick={() => handleRemoveItem(item.id)}>
                        حذف
                      </button>
                    </td>
                    <td data-label="ردیف" style={{ ...win95Style.tableCell, textAlign: 'center', color: '#64748b' }}>{formatDisplay(index + 1)}</td>
                    <td data-label="نام کالا / خدمت" style={{ ...win95Style.tableCell, fontWeight: '500', color: '#1e293b' }}>
                      {editingQuotationId ? (
                        <input
                          aria-label={`نام کالای ردیف ${index + 1}`}
                          value={item.title || ''}
                          onChange={(event) => handleQuotationItemChange(item.id, 'title', event.target.value)}
                          style={{ ...win95Style.input, width: '100%', minWidth: '130px', margin: 0 }}
                        />
                      ) : item.title}
                    </td>
                    <td data-label="نوع کالا" style={{ ...win95Style.tableCell, textAlign: 'center' }}>
                      {editingQuotationId ? (
                        <select
                          className="quotation-item-type-select"
                          aria-label={`نوع کالای ردیف ${index + 1}`}
                          value={['rent', 'اجاره', 'اجاره‌ای'].includes(item.item_type) ? 'rent' : 'sale'}
                          onChange={(event) => handleQuotationItemChange(item.id, 'item_type', event.target.value)}
                        >
                          <option value="sale">فروشی</option>
                          <option value="rent">اجاره‌ای</option>
                        </select>
                      ) : (
                        <span className={`quotation-item-type-badge ${['rent', 'اجاره', 'اجاره‌ای'].includes(item.item_type) ? 'is-rent' : 'is-sale'}`}>
                          {['rent', 'اجاره', 'اجاره‌ای'].includes(item.item_type) ? 'اجاره‌ای' : 'فروشی'}
                        </span>
                      )}
                    </td>
                    <td data-label="تعداد" style={{ ...win95Style.tableCell, width: '85px' }}>
                      <FormattedNumberInput
                        allowDecimal={false}
                        value={item.requestedQuantity ?? ""} 
                        onValueChange={(value) => handleQuantityChange(item.id, value)}
                        style={{ ...win95Style.input, width: '100%', textAlign: 'center' }} 
                      />
                    </td>
                    <td data-label="بازهٔ اجاره" style={{ ...win95Style.tableCell, minWidth: '180px' }}>
                      {['rent', 'اجاره', 'اجاره‌ای'].includes(item.item_type)
                        && hasInventoryReference(item.inventory_id || item.id) ? (
                        <div style={{ display: 'grid', gap: '4px' }}>
                          <label>
                            <span>تحویل </span>
                            <PersianDateInput
                              value={item.rental_checkout_date || ''}
                              onChange={(value) => handleQuotationItemChange(item.id, 'rental_checkout_date', value)}
                            />
                          </label>
                          <label>
                            <span>عودت </span>
                            <PersianDateInput
                              value={item.rental_return_date || ''}
                              onChange={(value) => handleQuotationItemChange(item.id, 'rental_return_date', value)}
                            />
                          </label>
                        </div>
                      ) : '—'}
                    </td>
                    <td data-label="درجه ۱ (تومان)" style={{ ...win95Style.tableCell, color: '#0369a1', fontWeight: '500' }}>
                      {editingQuotationId ? (
                        <FormattedNumberInput
                          allowDecimal={false}
                          aria-label={`قیمت درجهٔ یک ردیف ${index + 1}`}
                          value={item.price_level1 ?? 0}
                          onValueChange={(value) => handleQuotationItemChange(item.id, 'price_level1', value)}
                          style={{ ...win95Style.input, width: '100%', minWidth: '100px', margin: 0 }}
                        />
                      ) : formatDisplay(item.price_level1)}
                    </td>
                    <td data-label="درجه ۲ (تومان)" style={{ ...win95Style.tableCell, color: '#0369a1', fontWeight: '500' }}>
                      {editingQuotationId ? (
                        <FormattedNumberInput
                          allowDecimal={false}
                          aria-label={`قیمت درجهٔ دو ردیف ${index + 1}`}
                          value={item.price_level2 ?? 0}
                          onValueChange={(value) => handleQuotationItemChange(item.id, 'price_level2', value)}
                          style={{ ...win95Style.input, width: '100%', minWidth: '100px', margin: 0 }}
                        />
                      ) : formatDisplay(item.price_level2)}
                    </td>
                    <td data-label="درجه ۳ (تومان)" style={{ ...win95Style.tableCell, color: '#0369a1', fontWeight: '500' }}>
                      {editingQuotationId ? (
                        <FormattedNumberInput
                          allowDecimal={false}
                          aria-label={`قیمت درجهٔ سه ردیف ${index + 1}`}
                          value={item.price_level3 ?? 0}
                          onValueChange={(value) => handleQuotationItemChange(item.id, 'price_level3', value)}
                          style={{ ...win95Style.input, width: '100%', minWidth: '100px', margin: 0 }}
                        />
                      ) : formatDisplay(item.price_level3)}
                    </td>
                    {showBuyingPrice && (
                      <td data-label="قیمت خرید (تومان)" style={{ ...win95Style.tableCell, color: '#475569' }}>
                        {formatDisplay(item.base_cost)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
            </div>
          </section>
        </main>

        <aside className="quotation-summary-panel">
          <div className="quotation-summary-heading">
            <span>خلاصه پیش‌فاکتور</span>
            <span className="quotation-summary-dot" />
          </div>
          <div className="quotation-summary-customer">
            <span>مشتری</span>
            <strong>{selectedCustomer?.['Full name'] || 'انتخاب نشده'}</strong>
          </div>
          <div className="quotation-total-list">
            <div className="quotation-total-row">
              <span>مجموع کل · درجه ۱</span>
              <strong>{total1.toLocaleString('fa-IR')} <small>تومان</small></strong>
            </div>
            <div className="quotation-total-row">
              <span>مجموع کل · درجه ۲</span>
              <strong>{total2.toLocaleString('fa-IR')} <small>تومان</small></strong>
            </div>
            <div className="quotation-total-row">
              <span>مجموع کل · درجه ۳</span>
              <strong>{total3.toLocaleString('fa-IR')} <small>تومان</small></strong>
            </div>
            <label className="quotation-discount-field">
              تخفیف (تومان)
              <FormattedNumberInput
                allowDecimal={false}
                inputMode="numeric"
                value={discountAmount}
                onValueChange={setDiscountAmount}
              />
            </label>
            <div className="quotation-total-row discount">
              <span>مبلغ تخفیف</span>
              <strong>{formatDisplay(numericDiscount)} <small>تومان</small></strong>
            </div>
            <div className="quotation-total-row final">
              <span>مبلغ نهایی · درجه ۱</span>
              <strong>{formatDisplay(finalTotal)} <small>تومان</small></strong>
            </div>
            <div className="quotation-total-row">
              <span>مبلغ پرداختی</span>
              <strong>{formatDisplay(paidAmount)} <small>تومان</small></strong>
            </div>
            <div className="quotation-total-row remaining">
              <span>مانده حساب</span>
              <strong>{formatDisplay(remainingAmount)} <small>تومان</small></strong>
            </div>
          </div>
          <p className="quotation-summary-note">
          {items.length ? `${formatDisplay(items.length)} قلم کالا در این پیش‌فاکتور ثبت شده است. دریافت وجه پس از صدور فاکتور رسمی از صندوق/بانک ثبت می‌شود.` : 'هنوز کالایی به پیش‌فاکتور اضافه نشده است.'}
          </p>
          <button
            className="quotation-save-button"
            onClick={handleSaveAndPrint}
            disabled={isSaving}>
            {isSaving
              ? 'در حال ذخیره‌سازی...'
              : editingQuotationId
                ? 'ذخیره تغییرات و چاپ'
                : 'چاپ و ذخیره پیش‌فاکتور'}
          </button>
        </aside>
      </div>

      {inventoryPickerOpen && (
        <div
          className="quotation-inventory-picker-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setInventoryPickerOpen(false);
          }}
        >
          <section
            className="quotation-inventory-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quotation-inventory-picker-title"
            dir="rtl"
          >
            <header className="quotation-inventory-picker-heading">
              <div>
                <span className="quotation-heading-kicker">انتخاب از موجودی انبار</span>
                <h2 id="quotation-inventory-picker-title">اقلام پیش‌فاکتور</h2>
                <p>{formatDisplay(inventoryItems.length)} کالا در انبار ثبت شده است.</p>
              </div>
              <div className="quotation-inventory-picker-heading-actions">
                <button
                  type="button"
                  className="quotation-inventory-picker-add-button"
                  onClick={() => {
                    if (inventoryCreateOpen) setInventoryCreateOpen(false);
                    else setInventoryCreateOpen(true);
                  }}
                >
                  {inventoryCreateOpen ? 'بستن ثبت کالا' : '+ ثبت کالای جدید'}
                </button>
                <button
                  type="button"
                  aria-label="بستن فهرست اقلام"
                  onClick={() => setInventoryPickerOpen(false)}
                >
                  ×
                </button>
              </div>
            </header>
            {inventoryCreateOpen && (
              <form className="quotation-inventory-create-form" onSubmit={handleCreateInventoryItem}>
                <div className="quotation-inventory-create-heading">
                  <strong>ثبت کالا در انبار و افزودن به پیش‌فاکتور</strong>
                  <span>کالای ثبت‌شده با تعداد ۱ به پیش‌فاکتور اضافه می‌شود؛ تعداد را بعداً می‌توانید تغییر دهید.</span>
                </div>
                <label>
                  نام کالا / خدمت
                  <input
                    autoFocus
                    required
                    value={newInventoryForm.title}
                    onChange={(event) => setNewInventoryForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="نام کالا"
                  />
                </label>
                <label>
                  نوع
                  <select
                    value={newInventoryForm.item_type}
                    onChange={(event) => setNewInventoryForm((current) => ({ ...current, item_type: event.target.value }))}
                  >
                    <option value="sale">فروشی</option>
                    <option value="rent">اجاره‌ای</option>
                  </select>
                </label>
                <label>
                  نرخ سطح ۱
                  <FormattedNumberInput
                    allowDecimal={false}
                    value={newInventoryForm.price_level1}
                    onValueChange={(value) => setNewInventoryForm((current) => ({ ...current, price_level1: value }))}
                  />
                </label>
                <label>
                  نرخ سطح ۲
                  <FormattedNumberInput
                    allowDecimal={false}
                    value={newInventoryForm.price_level2}
                    onValueChange={(value) => setNewInventoryForm((current) => ({ ...current, price_level2: value }))}
                  />
                </label>
                <label>
                  نرخ سطح ۳
                  <FormattedNumberInput
                    allowDecimal={false}
                    value={newInventoryForm.price_level3}
                    onValueChange={(value) => setNewInventoryForm((current) => ({ ...current, price_level3: value }))}
                  />
                </label>
                <label>
                  قیمت خرید
                  <FormattedNumberInput
                    allowDecimal={false}
                    value={newInventoryForm.base_cost}
                    onValueChange={(value) => setNewInventoryForm((current) => ({ ...current, base_cost: value }))}
                  />
                </label>
                <label>
                  انبار موجودی اولیه
                  <select
                    value={newInventoryForm.warehouse_id}
                    onChange={(event) => setNewInventoryForm((current) => ({ ...current, warehouse_id: event.target.value }))}
                    disabled={pickerStockLoading || pickerWarehouses.length === 0}
                  >
                    <option value="">{pickerStockLoading ? 'در حال دریافت انبارها...' : 'انتخاب انبار'}</option>
                    {pickerWarehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}{warehouse.is_default ? ' (اصلی)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  موجودی اولیه
                  <FormattedNumberInput
                    value={newInventoryForm.initial_quantity}
                    onValueChange={(value) => setNewInventoryForm((current) => ({ ...current, initial_quantity: value }))}
                    placeholder="مثلاً ۱۰"
                  />
                </label>
                <div className="quotation-inventory-create-actions">
                  <button type="submit" disabled={savingNewInventoryItem || pickerStockLoading}>
                    {savingNewInventoryItem ? 'در حال ثبت...' : 'ثبت کالا و افزودن'}
                  </button>
                </div>
              </form>
            )}
            <label className="quotation-inventory-picker-search">
              <span>جستجوی کالا</span>
              <input
                type="search"
                value={inventorySearchTerm}
                onChange={(event) => setInventorySearchTerm(event.target.value)}
                placeholder="نام کالا را وارد کنید..."
                autoFocus={!inventoryCreateOpen}
              />
            </label>
            <div className="quotation-inventory-stock-toolbar">
              <label>
                نمایش موجودی انبار
                <select
                  value={pickerWarehouseId}
                  onChange={(event) => setPickerWarehouseId(event.target.value)}
                  disabled={pickerStockLoading || pickerWarehouses.length === 0}
                >
                  <option value="">انتخاب انبار</option>
                  {pickerWarehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}{warehouse.is_default ? ' (اصلی)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <span>
                {pickerStockLoading
                  ? 'در حال دریافت موجودی...'
                  : pickerStockOffline
                    ? 'موجودی آفلاین؛ ممکن است به‌روز نباشد'
                    : pickerWarehouses.find((warehouse) => String(warehouse.id) === pickerWarehouseId)?.name || 'انبار انتخاب نشده'}
              </span>
              <small>آزاد = موجودی کل منهای رزروهای فعال</small>
            </div>
            {pickerStockError && <p className="quotation-inventory-stock-error" role="alert">{pickerStockError}</p>}
            <div className="quotation-inventory-picker-list">
              {filteredInventoryItems.length === 0 ? (
                <p className="quotation-inventory-picker-empty">
                  {inventoryItems.length === 0 ? 'هنوز کالایی در انبار ثبت نشده است.' : 'کالایی با این نام پیدا نشد.'}
                </p>
              ) : (
                <table className="quotation-inventory-picker-table">
                  <thead>
                    <tr>
                      <th>ردیف</th>
                      <th>عنوان کالا / خدمت</th>
                      <th>نوع کالا</th>
                      <th>موجودی</th>
                      <th>رزرو</th>
                      <th>آزاد</th>
                      <th>نرخ سطح ۱</th>
                      <th>نرخ سطح ۲</th>
                      <th>نرخ سطح ۳</th>
                      <th>تعداد</th>
                      <th>عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventoryItems.map((item, index) => {
                      const isSelected = items.some((draft) => (
                        String(draft.inventory_id || draft.id) === String(item.id)
                      ));
                      const isEditing = String(editingInventoryItemId) === String(item.id);
                      const isRent = ['rent', 'اجاره', 'اجاره‌ای'].includes(item.item_type);
                      const onHand = pickerWarehouseId
                        ? getInventoryQuantity(pickerMovements, item.id, pickerWarehouseId)
                        : null;
                      const reserved = pickerWarehouseId
                        ? getReservedQuantity(pickerReservations, item.id, pickerWarehouseId)
                        : null;
                      const available = onHand === null || reserved === null
                        ? null
                        : Math.max(0, onHand - reserved);
                      return (
                        <tr
                          key={item.id}
                          className={`${isSelected ? 'selected' : ''}${isEditing ? ' editing' : ''}`}
                          onClick={() => {
                            if (!isEditing) handleAddPickerItem(item);
                          }}
                          onDoubleClick={() => {
                            if (!savingInventoryItem) handleStartInventoryItemEdit(item);
                          }}
                          title={isEditing ? 'ویرایش کالا' : 'برای افزودن، تعداد را وارد و دکمهٔ افزودن را بزنید'}
                        >
                          <td>{isSelected ? '✓' : formatDisplay(index + 1)}</td>
                          <td onClick={(event) => event.stopPropagation()}>
                            {isEditing ? (
                              <input
                                aria-label="عنوان کالا"
                                value={inventoryEditForm.title}
                                onChange={(event) => setInventoryEditForm((current) => ({ ...current, title: event.target.value }))}
                              />
                            ) : item.title}
                          </td>
                          <td>
                            {isEditing ? (
                              <select
                                aria-label="نوع کالا"
                                value={inventoryEditForm.item_type}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => setInventoryEditForm((current) => ({ ...current, item_type: event.target.value }))}
                              >
                                <option value="sale">فروشی</option>
                                <option value="rent">اجاره‌ای</option>
                              </select>
                            ) : (
                              <span className={isRent ? 'rent' : 'sale'}>
                                {isRent ? 'اجاره‌ای' : 'فروشی'}
                              </span>
                            )}
                          </td>
                          <td className="quotation-inventory-stock-cell">
                            {pickerStockLoading
                              ? '…'
                              : pickerStockError
                                ? 'نامشخص'
                                : onHand === null
                                  ? '—'
                                  : formatDisplay(onHand)}
                          </td>
                          <td className="quotation-inventory-stock-cell">
                            {pickerStockLoading
                              ? '…'
                              : pickerStockError
                                ? 'نامشخص'
                                : reserved === null
                                  ? '—'
                                  : formatDisplay(reserved)}
                          </td>
                          <td className="quotation-inventory-stock-cell">
                            {pickerStockLoading
                              ? '…'
                              : pickerStockError
                                ? 'نامشخص'
                                : available === null
                                  ? '—'
                                  : formatDisplay(available)}
                          </td>
                          {['price_level1', 'price_level2', 'price_level3'].map((priceField, priceIndex) => (
                            <td key={priceField} onClick={(event) => event.stopPropagation()}>
                              {isEditing ? (
                                <FormattedNumberInput
                                  aria-label={`نرخ سطح ${priceIndex + 1}`}
                                  value={inventoryEditForm[priceField]}
                                  onValueChange={(value) => setInventoryEditForm((current) => ({ ...current, [priceField]: value }))}
                                  onClick={(event) => event.stopPropagation()}
                                />
                              ) : (
                                <>{formatDisplay(item[priceField] || 0)} تومان</>
                              )}
                            </td>
                          ))}
                          <td onClick={(event) => event.stopPropagation()}>
                            <FormattedNumberInput
                              aria-label={`تعداد ${item.title}`}
                              allowDecimal
                              value={pickerQuantities[item.id] ?? (
                                items.find((draft) => String(draft.inventory_id || draft.id) === String(item.id))
                                  ?.requestedQuantity ?? '1'
                              )}
                              onValueChange={(value) => setPickerQuantities((current) => ({ ...current, [item.id]: value }))}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                          <td onClick={(event) => event.stopPropagation()}>
                            {isEditing ? (
                              <div className="quotation-inventory-picker-edit-actions">
                                <button
                                  type="button"
                                  onClick={() => handleSaveInventoryItemEdit(item)}
                                  disabled={savingInventoryItem}
                                >
                                  {savingInventoryItem ? '...' : 'ذخیره'}
                                </button>
                                <button
                                  type="button"
                                  className="cancel"
                                  onClick={() => {
                                    setEditingInventoryItemId(null);
                                    setInventoryEditForm({});
                                  }}
                                  disabled={savingInventoryItem}
                                >
                                  لغو
                                </button>
                              </div>
                            ) : (
                              <div className="quotation-inventory-picker-row-actions">
                                <button
                                  type="button"
                                  className="quotation-inventory-picker-select-button"
                                  onClick={() => handleAddPickerItem(item)}
                                >
                                  {isSelected ? 'ثبت تعداد' : 'افزودن'}
                                </button>
                                <button
                                  type="button"
                                  className="quotation-inventory-picker-edit-button"
                                  onClick={() => handleStartInventoryItemEdit(item)}
                                >
                                  ویرایش
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <footer className="quotation-inventory-picker-footer">
              <span>{formatDisplay(items.length)} قلم در پیش‌فاکتور</span>
              <button type="button" onClick={() => setInventoryPickerOpen(false)}>پایان انتخاب</button>
            </footer>
          </section>
        </div>
      )}

      {/* بخش فاکتورهای اخیر */}
      <div className="recent-invoices" dir="rtl">
        <div className="recent-invoices-header">
          <div className="recent-invoices-title">
            <span>فاکتورها و پیش‌فاکتورهای اخیر</span>
          </div>
          {selectedInvoiceIds.length > 0 && (
            <button 
              onClick={handleDeleteSelectedInvoices} 
              style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
              حذف موارد انتخاب‌شده ({formatDisplay(selectedInvoiceIds.length)})
            </button>
          )}
        </div>
        <div className="recent-invoices-list">
          {savedInvoices.length === 0 ? (
            <div style={{ padding: '15px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
              فاکتور یا پیش‌فاکتور ذخیره‌شده‌ای وجود ندارد.
            </div>
          ) : (
            savedInvoices.map(inv => (
              <div
                key={`${inv.type}-${inv.id}`}
                className="recent-invoice-row">
                <div className="recent-invoice-info">
                  <input 
                    type="checkbox" 
                    className="recent-invoice-checkbox"
                    aria-label={`انتخاب ${inv.type === 'official' ? 'فاکتور رسمی' : 'پیش‌فاکتور'} ${inv.customer_name || ''}`}
                    checked={selectedInvoiceIds.includes(`${inv.type}-${inv.id}`)}
                    onChange={(e) => handleToggleSelectInvoice(e, `${inv.type}-${inv.id}`)}
                  />
                  <span
                    className="recent-invoice-customer"
                    onClick={() => handleLoadInvoice(inv)}>
                    {inv.customer_name} 
                    {inv.type === 'official' ? (
                      <span style={{ color: '#16a34a', marginRight: '6px', fontWeight: 'bold' }}>[رسمی]</span>
                    ) : (
                      <span style={{ color: '#0284c7', marginRight: '6px', fontWeight: 'bold' }}>[پیش‌فاکتور]</span>
                    )}
                    <span className="recent-invoice-date">
                      ({inv.created_at ? new Date(inv.created_at).toLocaleDateString('fa-IR') : '—'})
                    </span>
                  </span>
                  {inv.type !== 'official' && (() => {
                    const linkedInvoice = savedInvoices.find((invoice) =>
                      invoice.type === 'official' && String(invoice.quotation_id) === String(inv.id),
                    );
                    return (
                      <div className="recent-invoice-actions">
                        {!linkedInvoice && (
                          <button
                            type="button"
                            className="recent-invoice-edit-button"
                            onClick={(event) => handleEditQuotation(event, inv)}
                          >
                            ویرایش
                          </button>
                        )}
                        {linkedInvoice ? (
                          <span role="status" style={{ color: '#15803d', fontSize: '11px', fontWeight: 'bold' }}>
                            صادرشده · #{formatPersianDigits(linkedInvoice.id)}
                          </span>
                        ) : (
                          <button
                            style={{ backgroundColor: '#0ea5e9', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: convertingQuotationId === String(inv.id) ? 'wait' : 'pointer', fontSize: '11px' }}
                            onClick={(e) => handleConvertToInvoice(e, inv)}
                            disabled={convertingQuotationId === String(inv.id)}
                          >
                            {convertingQuotationId === String(inv.id) ? 'در حال صدور…' : 'صدور رسمی'}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>

              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
