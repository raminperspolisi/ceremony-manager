import React, { useState, useEffect } from 'react';
import { formatDisplay, formatPersianDigits } from '../styles';
import { deleteRows, insertRows, readTable, updateRows } from '../offlineSync';
import { formatPersianDate } from '../dateUtils';
import FormattedNumberInput from './FormattedNumberInput';
import PersianDateInput from './PersianDateInput';
import { convertQuotationToInvoice, deleteSelectedDocuments } from '../quotationInvoice';
import { renderBusinessContactHtml } from '../profileLinks';

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

export default function QuotationPanel({ inventoryItems = [], onItemSelected, selectedItems = [], setSelectedItems, businessName = 'تشریفات آژو', logoUrl = '/azho-logo.png', businessContact }) {
  const items = selectedItems || [];
  const [customers, setCustomers] = useState([]);
  const [inventoryPickerOpen, setInventoryPickerOpen] = useState(false);
  const [inventorySearchTerm, setInventorySearchTerm] = useState('');
  const [editingInventoryItemId, setEditingInventoryItemId] = useState(null);
  const [inventoryEditForm, setInventoryEditForm] = useState({});
  const [savingInventoryItem, setSavingInventoryItem] = useState(false);
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
        if (editingInventoryItemId !== null) {
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
  }, [editingInventoryItemId, inventoryPickerOpen, isSearching, showAddCustomerForm]);

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
    } catch (error) {
      alert(`خطا در ویرایش کالا: ${error.message}`);
    } finally {
      setSavingInventoryItem(false);
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

      const { error } = await insertRows("quotations", [
        { 
          customer_name: selectedCustomer["Full name"], 
          customer_phone: selectedCustomer.phone || '',
          items_json: itemsPayload, 
          total_price: finalTotal,
          discount_amount: numericDiscount,
        }
      ]);

      if (error) throw error;
      alert("پیش‌فاکتور با موفقیت ذخیره شد.");
      fetchInvoices();

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        const escapeHtml = (value) => String(value ?? '—').replace(/[&<>"']/g, (character) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[character]));
        const safeBusinessName = String(businessName).replace(/[&<>"']/g, (character) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[character]));
        const safeLogoUrl = String(logoUrl).replace(/[&<>"']/g, (character) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[character]));
        printWindow.document.write(`
          <html dir="rtl" lang="fa">
            <head>
              <meta charset="UTF-8">
              <title>پیش‌فاکتور ${safeBusinessName} - ${selectedCustomer["Full name"]}</title>
              <style>
                @font-face { font-family: 'IRANSans'; src: url('https://cdn.fontcdn.ir/Font/Persian/IRANSans/IRANSans.woff2') format('woff2'); }
                * { box-sizing: border-box; }
                body { font-family: 'IRANSans', Tahoma, sans-serif; max-width: 900px; margin: auto; padding: 28px; direction: rtl; color: #243b35; background: #fff; }
                .header-title { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; padding: 16px 18px; border-radius: 14px; background: linear-gradient(135deg, #153e37, #28645a); color: #fff; font-weight: bold; font-size: 19px; }
                .company-logo { width: 60px; height: 72px; object-fit: contain; background: #fff; border-radius: 8px; }
                .header-info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; font-size: 12px; background: #f4f8f6; padding: 14px; border-radius: 10px; border: 1px solid #dce8e2; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
                th, td { border: 1px solid #dce5e0; padding: 9px 7px; text-align: center; }
                th { background-color: #eaf2ee; color: #244b40; font-weight: bold; }
                tbody tr:nth-child(even) { background: #f8faf9; }
                .totals { width: min(100%, 410px); margin: 20px 0 0 auto; padding: 14px 16px; border: 1px solid #dce8e2; border-radius: 12px; background: #f7faf8; font-size: 12px; }
                .totals p { display: flex; justify-content: space-between; gap: 15px; margin: 7px 0; }
                .totals .final { margin-top: 10px; padding-top: 10px; border-top: 1px solid #cbd9d1; color: #1d5b4b; font-size: 15px; font-weight: 800; }
                .footer-text { margin-top: 28px; font-size: 11px; text-align: center; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 12px; }
                .business-contact { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 16px; margin-top: 12px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #475569; }
                .business-contact a { color: #28645a; text-decoration: none; }
                @media print { body { padding: 0; } .header-title, th { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
              </style>
            </head>
            <body>
              <div class="header-title">
                <img class="company-logo" src="${safeLogoUrl}" alt="لوگوی ${safeBusinessName}">
                <span>پیش‌فاکتور ${safeBusinessName}</span>
              </div>
              <div class="header-info">
                  <div><strong>نام مشتری:</strong> ${escapeHtml(selectedCustomer["Full name"])}</div>
                  <div><strong>تلفن:</strong> ${escapeHtml(selectedCustomer.phone || 'ثبت نشده')}</div>
                  <div><strong>تاریخ صدور:</strong> ${escapeHtml(quotationDate)}</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th style="width: 45px;">ردیف</th>
                    <th>نام کالا / خدمت</th>
                    <th style="width: 80px;">نوع کالا</th>
                    <th style="width: 65px;">تعداد</th>
                    <th>تحویل / مهلت عودت</th>
                    <th>درجه یک (تومان)</th>
                    <th>درجه دو (تومان)</th>
                    <th>درجه سه (تومان)</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map((item, idx) => `
                    <tr>
                      <td>${formatDisplay(idx + 1)}</td>
                      <td style="text-align: right; font-weight: 500;">${escapeHtml(item.title)}</td>
                      <td>${(item.item_type === 'rent' || item.item_type === 'اجاره' || item.item_type === 'اجاره‌ای') ? 'اجاره‌ای' : 'فروشی'}</td>
                      <td>${getQuantity(item.requestedQuantity)}</td>
                      <td>${['rent', 'اجاره', 'اجاره‌ای'].includes(item.item_type)
                        ? `${formatPersianDate(item.rental_checkout_date)} تا ${formatPersianDate(item.rental_return_date)}`
                        : '—'}</td>
                      <td>${Number(item.price_level1 || 0).toLocaleString('fa-IR')}</td>
                      <td>${Number(item.price_level2 || 0).toLocaleString('fa-IR')}</td>
                      <td>${Number(item.price_level3 || 0).toLocaleString('fa-IR')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div class="totals">
                <p><span>جمع کل · درجه ۱</span><strong>${formatDisplay(total1)} تومان</strong></p>
                <p><span>جمع کل · درجه ۲</span><strong>${formatDisplay(total2)} تومان</strong></p>
                <p><span>جمع کل · درجه ۳</span><strong>${formatDisplay(total3)} تومان</strong></p>
                <p><span>تخفیف</span><strong>${formatDisplay(numericDiscount)} تومان</strong></p>
                <p class="final"><span>مبلغ نهایی · درجه ۱</span><strong>${formatDisplay(finalTotal)} تومان</strong></p>
                <p><span>مبلغ پرداختی</span><strong>${formatDisplay(paidAmount)} تومان</strong></p>
                <p><span>مانده حساب</span><strong>${formatDisplay(remainingAmount)} تومان</strong></p>
              </div>
              <p class="footer-text">این پیش‌فاکتور صرفاً جهت برآورد هزینه و اطلاع مشتری صادر شده و فاقد جنبه پرداخت قطعی می‌باشد.</p>
              ${renderBusinessContactHtml(businessContact)}
              <script>
                window.onload = function() { 
                  window.print(); 
                  window.close(); 
                };
              </script>
            </body>
          </html>
        `);
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

  const handleLoadInvoice = (inv) => {
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
    setDiscountAmount(String(inv.discount_amount || 0));
    setSearchTerm(inv.customer_name || '');
    setSelectedCustomer({ "Full name": inv.customer_name });
    alert(`پیش‌فاکتور مشتری «${inv.customer_name}» بارگذاری شد.`);
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
            setInventoryPickerOpen(true);
          }}
        >
          صدور پیش‌فاکتور جدید
        </button>
      </header>

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
                    <td data-label="نام کالا / خدمت" style={{ ...win95Style.tableCell, fontWeight: '500', color: '#1e293b' }}>{item.title}</td>
                    <td data-label="نوع کالا" style={{ ...win95Style.tableCell, textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        backgroundColor: (item.item_type === 'rent' || item.item_type === 'اجاره' || item.item_type === 'اجاره‌ای') ? '#e2e3ff' : '#e6f4ea',
                        color: (item.item_type === 'rent' || item.item_type === 'اجاره' || item.item_type === 'اجاره‌ای') ? '#383a8b' : '#137333',
                        display: 'inline-block'
                      }}>
                        {(item.item_type === 'rent' || item.item_type === 'اجاره' || item.item_type === 'اجاره‌ای') ? 'اجاره‌ای' : 'فروشی'}
                      </span>
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
                      {formatDisplay(item.price_level1)}
                    </td>
                    <td data-label="درجه ۲ (تومان)" style={{ ...win95Style.tableCell, color: '#0369a1', fontWeight: '500' }}>
                      {formatDisplay(item.price_level2)}
                    </td>
                    <td data-label="درجه ۳ (تومان)" style={{ ...win95Style.tableCell, color: '#0369a1', fontWeight: '500' }}>
                      {formatDisplay(item.price_level3)}
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
            {isSaving ? 'در حال ذخیره‌سازی...' : 'چاپ و ذخیره پیش‌فاکتور'}
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
              <button
                type="button"
                aria-label="بستن فهرست اقلام"
                onClick={() => setInventoryPickerOpen(false)}
              >
                ×
              </button>
            </header>
            <label className="quotation-inventory-picker-search">
              <span>جستجوی کالا</span>
              <input
                type="search"
                value={inventorySearchTerm}
                onChange={(event) => setInventorySearchTerm(event.target.value)}
                placeholder="نام کالا را وارد کنید..."
                autoFocus
              />
            </label>
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
                      <th>نرخ سطح ۱</th>
                      <th>نرخ سطح ۲</th>
                      <th>نرخ سطح ۳</th>
                      <th>عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventoryItems.map((item, index) => {
                      const isSelected = items.some((draft) => String(draft.id) === String(item.id));
                      const isEditing = String(editingInventoryItemId) === String(item.id);
                      const isRent = ['rent', 'اجاره', 'اجاره‌ای'].includes(item.item_type);
                      return (
                        <tr
                          key={item.id}
                          className={`${isSelected ? 'selected' : ''}${isEditing ? ' editing' : ''}`}
                          onClick={() => {
                            if (!isEditing && !isSelected) onItemSelected?.(item);
                          }}
                          onDoubleClick={() => {
                            if (!savingInventoryItem) handleStartInventoryItemEdit(item);
                          }}
                          title={isEditing ? 'ویرایش کالا' : 'برای افزودن کلیک کنید؛ دابل‌کلیک برای ویرایش'}
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
                              <button
                                type="button"
                                className="quotation-inventory-picker-edit-button"
                                onClick={() => handleStartInventoryItemEdit(item)}
                              >
                                ویرایش
                              </button>
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
