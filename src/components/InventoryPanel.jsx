import React, { useEffect, useRef, useState } from 'react';
import { deleteRows, insertRows, readTable, updateRows } from '../offlineSync';
import { formatDisplay } from '../styles';
import FormattedNumberInput from './FormattedNumberInput';
import InventoryOperationsPanel from './InventoryOperationsPanel';
import EmptyState from './EmptyState';
import ImageUpload from './ImageUpload';
import InventoryThumbnail from './InventoryThumbnail';
import { useToast } from './useToast';
import { getReservedQuantity, isBelowMinimumStock } from '../inventoryUtils';
import './InventoryPanel.css';

export default function InventoryPanel({
  items,
  refresh,
  onItemUpdated,
  onItemsReordered,
  organizationId,
}) {
  const { toast, confirm } = useToast();
  const [title, setTitle] = useState('');
  const [itemType, setItemType] = useState('sale'); // پیش‌فرض: فروشی
  const [baseCost, setBaseCost] = useState('');
  const [initialQuantity, setInitialQuantity] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [initialWarehouseId, setInitialWarehouseId] = useState('');
  const [loadedWarehouseOrganizationId, setLoadedWarehouseOrganizationId] = useState(null);
  const [warehouseError, setWarehouseError] = useState('');
  const [price1, setPrice1] = useState('');
  const [price2, setPrice2] = useState('');
  const [price3, setPrice3] = useState('');
  const [image, setImage] = useState('');
  const [loading, setLoading] = useState(false);
  const [newItemModalOpen, setNewItemModalOpen] = useState(false);
  const [draggingItemId, setDraggingItemId] = useState(null);
  const [dragOverItemId, setDragOverItemId] = useState(null);
  const [savingItemOrder, setSavingItemOrder] = useState(false);
  const dragItemIdRef = useRef(null);
  const dragOverItemIdRef = useRef(null);
  const pendingTouchDragRef = useRef(null);

  useEffect(() => () => {
    if (pendingTouchDragRef.current?.timer) {
      window.clearTimeout(pendingTouchDragRef.current.timer);
    }
  }, []);

  // استیت جستجو در انبار
  const [searchQuery, setSearchQuery] = useState('');
  const [inventoryFilter, setInventoryFilter] = useState('all');
  const [inventoryView, setInventoryView] = useState('grid');
  const [now] = useState(() => Date.now());

  // استیت برای نمایش یا مخفی کردن قیمت خرید
  const [showCostPrice, setShowCostPrice] = useState(false);

  // در حالت دسکتاپ هر سه سطح قیمت با هم نمایش داده می‌شوند
  const [isDesktopView, setIsDesktopView] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 601px)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 601px)');
    const handleChange = (event) => setIsDesktopView(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const displayedLevels = isDesktopView ? ['1', '2', '3'] : ['1'];
  const tableColumnCount = 5 + displayedLevels.length + (showCostPrice ? 1 : 0);
  const [stockSummary, setStockSummary] = useState({
    warehouseName: '',
    warehouseId: '',
    quantities: null,
    reservationRecords: [],
    busy: true,
    save: null,
  });

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const warehousesLoading = loadedWarehouseOrganizationId !== (organizationId || null);

  useEffect(() => {
    let active = true;
    const loadWarehouses = async () => {
      const { data, error } = await readTable('inventory_warehouses', {
        orderBy: 'name',
        ascending: true,
      });
      if (!active) return;
      if (error) {
        setWarehouseError(`دریافت فهرست انبارها ناموفق بود: ${error.message}`);
        setWarehouses([]);
        setInitialWarehouseId('');
        setLoadedWarehouseOrganizationId(organizationId || null);
        return;
      }

      const availableWarehouses = data || [];
      const defaultWarehouse = availableWarehouses.find((warehouse) => warehouse.is_default)
        || availableWarehouses[0];
      setWarehouses(availableWarehouses);
      setInitialWarehouseId((current) => (
        availableWarehouses.some((warehouse) => String(warehouse.id) === String(current))
          ? current
          : String(defaultWarehouse?.id || '')
      ));
      setWarehouseError('');
      setLoadedWarehouseOrganizationId(organizationId || null);
    };

    loadWarehouses();
    window.addEventListener('offline-data-updated', loadWarehouses);
    window.addEventListener('inventory-data-updated', loadWarehouses);
    return () => {
      active = false;
      window.removeEventListener('offline-data-updated', loadWarehouses);
      window.removeEventListener('inventory-data-updated', loadWarehouses);
    };
  }, [organizationId]);

  useEffect(() => {
    const handleAppEscape = (event) => {
      if (newItemModalOpen && !loading) {
        event.preventDefault();
        setNewItemModalOpen(false);
      } else if (editingId !== null) {
        event.preventDefault();
        setEditingId(null);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && newItemModalOpen && !loading) {
        event.preventDefault();
        setNewItemModalOpen(false);
      }
    };
    window.addEventListener('app-escape', handleAppEscape);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('app-escape', handleAppEscape);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [editingId, loading, newItemModalOpen]);

  useEffect(() => {
    if (draggingItemId === null) return undefined;
    const preventTouchScrollDuringDrag = (event) => event.preventDefault();
    const handlePointerMove = (event) => {
      const row = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest('[data-inventory-id]');
      if (!row) return;
      const itemId = row.dataset.inventoryId;
      dragOverItemIdRef.current = itemId;
      setDragOverItemId(itemId);
    };
    const handlePointerUp = async () => {
      const draggedId = dragItemIdRef.current;
      const targetId = dragOverItemIdRef.current;
      dragItemIdRef.current = null;
      dragOverItemIdRef.current = null;
      setDraggingItemId(null);
      setDragOverItemId(null);
      if (draggedId === null || targetId === null || draggedId === targetId
        || searchQuery.trim() || inventoryFilter !== 'all') return;

      const fromIndex = items.findIndex((item) => String(item.id) === draggedId);
      const toIndex = items.findIndex((item) => String(item.id) === targetId);
      if (fromIndex < 0 || toIndex < 0) return;
      const reordered = [...items];
      const [movedItem] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, movedItem);
      onItemsReordered(reordered);
      setSavingItemOrder(true);
      try {
        for (const [index, item] of reordered.entries()) {
          const { error } = await updateRows(
            'inventory',
            { sort_order: index + 1 },
            [{ column: 'id', operator: 'eq', value: item.id }],
          );
          if (error) throw error;
        }
        await refresh();
      } catch (error) {
        console.error('خطا در ذخیرهٔ ترتیب کالاها:', error.message);
        toast('error', `ذخیرهٔ ترتیب کالاها ناموفق بود: ${error.message}`);
        await refresh();
      } finally {
        setSavingItemOrder(false);
      }
    };
    const handlePointerCancel = () => {
      if (pendingTouchDragRef.current?.timer) {
        window.clearTimeout(pendingTouchDragRef.current.timer);
      }
      pendingTouchDragRef.current = null;
      dragItemIdRef.current = null;
      dragOverItemIdRef.current = null;
      setDraggingItemId(null);
      setDragOverItemId(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    document.addEventListener('touchmove', preventTouchScrollDuringDrag, { passive: false });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      document.removeEventListener('touchmove', preventTouchScrollDuringDrag);
    };
  }, [draggingItemId, inventoryFilter, items, onItemsReordered, refresh, searchQuery, toast]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    const stockQuantity = initialQuantity === '' ? 0 : Number(initialQuantity);
    if (!Number.isFinite(stockQuantity) || stockQuantity < 0
      || (initialQuantity.split('.')[1] || '').length > 3) {
      toast('error', 'موجودی اولیه باید عددی نامنفی با حداکثر سه رقم اعشار باشد.');
      return;
    }
    const purchaseCost = baseCost === '' ? 0 : Number(baseCost);
    if (!Number.isSafeInteger(purchaseCost) || purchaseCost < 0) {
      toast('error', 'قیمت خرید باید عدد صحیح و نامنفی باشد.');
      return;
    }
    if (stockQuantity > 0 && warehousesLoading) {
      toast('warning', 'فهرست انبارها هنوز دریافت نشده است؛ کمی صبر کنید و دوباره ثبت کنید.');
      return;
    }
    const initialWarehouse = warehouses.find(
      (warehouse) => String(warehouse.id) === String(initialWarehouseId),
    );
    if (stockQuantity > 0 && !initialWarehouse) {
      toast('error', warehouseError || 'برای ثبت موجودی اولیه، یک انبار معتبر انتخاب کنید.');
      return;
    }

    setLoading(true);
    let itemWasCreated = false;
    try {
      const { data, error } = await insertRows('inventory', [{
        title: title.trim(),
        item_type: itemType,
        sort_order: Math.max(0, ...items.map((item) => Number(item.sort_order) || 0)) + 1,
        base_cost: purchaseCost,
        price_level1: price1 === '' ? 0 : parseFloat(price1),
        price_level2: price2 === '' ? 0 : parseFloat(price2),
        price_level3: price3 === '' ? 0 : parseFloat(price3),
        image: image || null,
      }]);

      if (error) throw error;
      const createdItem = data?.[0];
      if (!createdItem?.id) throw new Error('کالا ذخیره شد اما شناسهٔ آن دریافت نشد.');
      itemWasCreated = true;

      setTitle('');
      setItemType('sale');
      setBaseCost('');
      setInitialQuantity('');
      setPrice1('');
      setPrice2('');
      setPrice3('');
      setImage('');
      if (stockQuantity > 0) {
        const movementResult = await insertRows('inventory_stock_movements', [{
          inventory_id: createdItem.id,
          warehouse_id: initialWarehouse.id,
          movement_type: 'opening',
          quantity_delta: stockQuantity,
          unit_cost: baseCost === '' ? null : purchaseCost,
          note: 'موجودی اولیه هنگام ثبت کالا',
          source_type: 'manual',
          source_id: null,
          offline_sync_id: crypto.randomUUID(),
        }]);
        if (movementResult.error) {
          throw new Error(`ثبت موجودی اولیه ناموفق بود: ${movementResult.error.message}`);
        }
        window.dispatchEvent(new Event('inventory-data-updated'));
      }
      await refresh();
      setNewItemModalOpen(false);
      toast('success', 'کالا با موفقیت به انبار اضافه شد.');
    } catch (err) {
      console.error(itemWasCreated ? 'خطا در ثبت موجودی اولیه:' : 'خطا در ثبت کالا:', err.message);
      if (itemWasCreated) {
        window.dispatchEvent(new Event('inventory-data-updated'));
        await refresh();
      }
      toast('error', `${itemWasCreated ? 'کالا ثبت شد، اما ' : 'خطا در ثبت کالا: '}${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!await confirm('آیا از حذف این کالا اطمینان دارید؟')) return;
    try {
      const { error } = await deleteRows('inventory', [{ column: 'id', operator: 'eq', value: id }]);
      if (error) throw error;
      refresh();
      toast('success', 'کالا حذف شد.');
    } catch (err) {
      console.error('خطا در حذف:', err.message);
      toast('error', 'خطا در حذف: ' + err.message);
    }
  };

  const handleDoubleClick = (item) => {
    setEditingId(item.id);
    setEditForm({
      title: item.title || '',
      item_type: item.item_type || 'sale',
      base_cost: item.base_cost ?? '',
      price_level1: item.price_level1 ?? '',
      price_level2: item.price_level2 ?? '',
      price_level3: item.price_level3 ?? '',
      image: item.image || '',
      stock_quantity: String(stockSummary.quantities?.[item.id] ?? 0),
      original_stock_quantity: String(stockSummary.quantities?.[item.id] ?? 0),
    });
  };

  const handleInlineSave = async (id) => {
    if (!editForm.title.trim()) {
      toast('error', 'نام کالا یا خدمت را وارد کنید.');
      return;
    }

    try {
      const targetStock = Number(editForm.stock_quantity);
      if (!Number.isFinite(targetStock) || targetStock < 0
        || Math.round(targetStock * 1000) / 1000 !== targetStock) {
        toast('error', 'موجودی نهایی باید عددی نامنفی با حداکثر سه رقم اعشار باشد.');
        return;
      }

      const stockChanged = targetStock !== Number(editForm.original_stock_quantity);
      if (stockChanged) {
        if (!stockSummary.save) {
          toast('warning', 'برای تغییر تعداد، اطلاعات تازهٔ انبار در دسترس نیست.');
          return;
        }
        const stockSaved = await stockSummary.save(id, editForm.stock_quantity);
        if (!stockSaved) return;
      }

      const updatedData = {
        title: editForm.title.trim(),
        item_type: editForm.item_type || 'sale',
        base_cost: editForm.base_cost === '' ? 0 : parseFloat(editForm.base_cost),
        price_level1: editForm.price_level1 === '' ? 0 : parseFloat(editForm.price_level1),
        price_level2: editForm.price_level2 === '' ? 0 : parseFloat(editForm.price_level2),
        price_level3: editForm.price_level3 === '' ? 0 : parseFloat(editForm.price_level3),
        image: editForm.image || null,
      };

      const { error } = await updateRows('inventory', updatedData, [{ column: 'id', operator: 'eq', value: id }]);

      if (error) throw error;

      // آپدیت زنده پیش‌فاکتور جاری در App.jsx
      if (typeof onItemUpdated === 'function') {
        onItemUpdated({
          id,
          ...updatedData
        });
      }

      setEditingId(null);
      refresh();
      toast('success', 'تغییرات کالا ذخیره شد.');
    } catch (err) {
      console.error('خطا در به‌روزرسانی:', err.message);
      toast('error', 'خطا در به‌روزرسانی: ' + err.message);
    }
  };

  const reservationRecords = stockSummary.reservationRecords || [];
  const getItemReserved = (item) => getReservedQuantity(
    reservationRecords,
    item.id,
    stockSummary.warehouseId,
  );
  const getItemRented = (item) => reservationRecords
    .filter((reservation) => (
      String(reservation.inventory_id) === String(item.id)
      && String(reservation.warehouse_id) === String(stockSummary.warehouseId)
      && reservation.status === 'issued'
      && reservation.reservation_type === 'rent'
    ))
    .reduce((total, reservation) => total + Number(reservation.quantity || 0), 0);
  const isLowStock = (item) => stockSummary.quantities !== null
    && isBelowMinimumStock(item, stockSummary.quantities?.[item.id] ?? 0);
  const isAvailable = (item) => stockSummary.quantities !== null
    && Number(stockSummary.quantities?.[item.id] || 0) > getItemReserved(item);
  const recentReservationStart = now - 7 * 24 * 60 * 60 * 1000;
  const rentedQuantity = reservationRecords
    .filter((reservation) => (
      String(reservation.warehouse_id) === String(stockSummary.warehouseId)
      && reservation.status === 'issued'
      && reservation.reservation_type === 'rent'
    ))
    .reduce((total, reservation) => total + Number(reservation.quantity || 0), 0);
  const reservedThisWeek = reservationRecords
    .filter((reservation) => (
      reservation.status === 'reserved'
      && Date.parse(reservation.created_at) >= recentReservationStart
    ))
    .reduce((total, reservation) => total + Number(reservation.quantity || 0), 0);
  const lowStockCount = stockSummary.quantities === null
    ? '—'
    : items.filter(isLowStock).length;
  const filterOptions = [
    { id: 'all', label: 'همه', count: items.length },
    { id: 'available', label: 'آزاد', count: items.filter(isAvailable).length },
    { id: 'reserved', label: 'رزرو', count: items.filter((item) => getItemReserved(item) > 0).length },
    { id: 'renting', label: 'در حال اجاره', count: items.filter((item) => getItemRented(item) > 0).length },
    { id: 'low', label: 'موجودی کم', count: lowStockCount },
  ];
  const displayCount = (value) => value === '—' ? value : formatDisplay(value);
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const filteredItems = items.filter((item) => {
    if (!item.title || !item.title.toLocaleLowerCase().includes(normalizedSearch)) return false;
    if (inventoryFilter === 'available') return isAvailable(item);
    if (inventoryFilter === 'reserved') return getItemReserved(item) > 0;
    if (inventoryFilter === 'renting') return getItemRented(item) > 0;
    if (inventoryFilter === 'low') return isLowStock(item);
    return true;
  });

  return (
    <div className="inventory-panel">
      <header className="inventory-page-heading">
        <div>
          <span className="inventory-eyebrow">مدیریت اقلام و گردش موجودی</span>
          <h2>انبار شما</h2>
          <p>کالاها، وضعیت موجودی و قیمت‌ها را یکجا مدیریت کنید.</p>
        </div>
        {stockSummary.warehouseName && (
          <span className="inventory-warehouse-label">انبار فعال: {stockSummary.warehouseName}</span>
        )}
      </header>

      <section className="inventory-summary" aria-label="خلاصه انبار">
        <article className="inventory-summary-card">
          <span>کل کالاها</span>
          <strong>{formatDisplay(items.length)}</strong>
        </article>
        <article className="inventory-summary-card is-renting">
          <span>در حال اجاره</span>
          <strong>{formatDisplay(rentedQuantity)}</strong>
        </article>
        <article className="inventory-summary-card is-reserved">
          <span>رزرو این هفته</span>
          <strong>{formatDisplay(reservedThisWeek)}</strong>
        </article>
        <article className="inventory-summary-card is-low-stock">
          <span>موجودی کم</span>
          <strong>{lowStockCount === '—' ? '—' : formatDisplay(lowStockCount)}</strong>
        </article>
      </section>

      {newItemModalOpen && (
        <div
          className="inventory-create-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !loading) setNewItemModalOpen(false);
          }}
        >
          <section
            className="inventory-create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-create-modal-title"
            dir="rtl"
          >
            <header className="inventory-create-modal-heading">
              <h2 id="inventory-create-modal-title">ثبت کالای جدید</h2>
              <button
                type="button"
                aria-label="بستن فرم ثبت کالا"
                onClick={() => setNewItemModalOpen(false)}
                disabled={loading}
              >
                ×
              </button>
            </header>
            <form className="inventory-create-form" onSubmit={handleSave} style={{ background: '#ffffff', padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', alignItems: 'end', overflowY: 'auto' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '4px', color: '#475569', fontWeight: 'bold' }}>نام کالا / خدمت</label>
          <input 
            type="text" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)} 
            placeholder="مثلا دیزاین ورودی" 
            required
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
          />
        </div>
        <ImageUpload
          value={image}
          onChange={setImage}
          onError={(message) => toast('error', message)}
        />

        <div>
          <label style={{ display: 'block', marginBottom: '4px', color: '#475569', fontWeight: 'bold' }}>نوع کالا</label>
          <select 
            value={itemType} 
            onChange={(e) => setItemType(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', backgroundColor: '#fff' }}
          >
            <option value="sale">فروشی</option>
            <option value="rent">اجاره‌ای</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', color: '#475569', fontWeight: 'bold' }}>انبار موجودی اولیه</label>
          <select
            value={initialWarehouseId}
            onChange={(event) => setInitialWarehouseId(event.target.value)}
            disabled={warehousesLoading || warehouses.length === 0}
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', backgroundColor: '#fff' }}
          >
            <option value="">
              {warehousesLoading ? 'در حال دریافت انبارها...' : 'انتخاب انبار'}
            </option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}{warehouse.is_default ? ' (اصلی)' : ''}
              </option>
            ))}
          </select>
          <small style={{ display: 'block', marginTop: '4px', color: '#64748b', fontSize: '10px' }}>
            موجودی اولیه در همین انبار ثبت می‌شود.
          </small>
          {warehouseError && (
            <small role="alert" style={{ display: 'block', marginTop: '4px', color: '#b42336', fontSize: '10px' }}>
              {warehouseError}
            </small>
          )}
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', color: '#475569', fontWeight: 'bold' }}>موجودی اولیه</label>
          <FormattedNumberInput
            value={initialQuantity}
            onValueChange={setInitialQuantity}
            placeholder="مثلاً ۱۰"
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', color: '#475569' }}>قیمت خرید</label>
          <FormattedNumberInput
            value={baseCost}
            onValueChange={setBaseCost}
            emptyWhenZero
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', color: '#475569' }}>نرخ سطح ۱</label>
          <FormattedNumberInput
            value={price1}
            onValueChange={setPrice1}
            emptyWhenZero
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', color: '#475569' }}>نرخ سطح ۲</label>
          <FormattedNumberInput
            value={price2}
            onValueChange={setPrice2}
            emptyWhenZero
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', color: '#475569' }}>نرخ سطح ۳</label>
          <FormattedNumberInput
            value={price3}
            onValueChange={setPrice3}
            emptyWhenZero
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
          />
        </div>

        <div>
          <button 
            type="submit" 
            disabled={loading}
            style={{ width: '100%', backgroundColor: '#0ea5e9', color: '#ffffff', border: 'none', padding: '7px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
          >
            {loading ? 'در حال ثبت...' : '+ ثبت کالا'}
          </button>
        </div>
            </form>
          </section>
        </div>
      )}

      <section className="inventory-list-surface">
        <div className="inventory-list-toolbar">
          <div className="inventory-toolbar-main">
            <label className="inventory-search-field">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="جستجوی نام کالا"
                aria-label="جستجوی کالا در انبار"
              />
            </label>
            <div className="inventory-toolbar-actions">
              <button
                type="button"
                className="inventory-add-item-button"
                onClick={() => setNewItemModalOpen(true)}
              >
                <span aria-hidden="true">＋</span> کالای جدید
              </button>
              <InventoryOperationsPanel
                items={items}
                organizationId={organizationId}
                refreshInventory={refresh}
                onStockSummaryChange={setStockSummary}
              />
              <button
                type="button"
                className="inventory-cost-toggle"
                aria-pressed={showCostPrice}
                onClick={() => setShowCostPrice((visible) => !visible)}
              >
                {showCostPrice ? 'مخفی‌کردن قیمت خرید' : 'نمایش قیمت خرید'}
              </button>
            </div>
            <div className="inventory-view-switch" role="group" aria-label="نحوه نمایش کالاها">
              <button
                type="button"
                aria-label="نمایش کارت‌ها"
                aria-pressed={inventoryView === 'grid'}
                onClick={() => setInventoryView('grid')}
              >
                ⊞
              </button>
              <button
                type="button"
                aria-label="نمایش فهرستی"
                aria-pressed={inventoryView === 'list'}
                onClick={() => setInventoryView('list')}
              >
                ☷
              </button>
            </div>
          </div>
          <nav className="inventory-filters" aria-label="فیلتر وضعیت کالا">
            {filterOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={inventoryFilter === option.id}
                onClick={() => setInventoryFilter(option.id)}
              >
                {option.label}
                <span>{displayCount(option.count)}</span>
              </button>
            ))}
          </nav>
          <div className="inventory-results-note">
            نمایش {formatDisplay(filteredItems.length)} از {formatDisplay(items.length)} کالا
            {inventoryView === 'list' && ' · برای ویرایش سریع دوبار روی ردیف کلیک کنید'}
          </div>
        </div>

        {inventoryView === 'grid' ? (
          filteredItems.length === 0 ? (
            <div className="inventory-grid-empty">
              <EmptyState
                icon={items.length === 0 ? 'box' : 'search'}
                title={items.length === 0 ? 'هنوز کالایی در انبار ثبت نشده' : 'موردی پیدا نشد'}
                description={items.length === 0 ? 'برای شروع، اولین کالا یا خدمت را ثبت کنید.' : 'فیلتر دیگری انتخاب کنید یا جستجو را پاک کنید.'}
                primaryAction={items.length === 0
                  ? { label: 'ثبت اولین کالا', onClick: () => setNewItemModalOpen(true) }
                  : { label: 'پاک کردن فیلترها', onClick: () => { setSearchQuery(''); setInventoryFilter('all'); } }}
              />
            </div>
          ) : (
            <div className="inventory-card-grid">
              {filteredItems.map((item) => {
                const isEditing = editingId === item.id;
                const quantity = stockSummary.quantities?.[item.id];
                const reserved = getItemReserved(item);
                const rented = getItemRented(item);
                const lowStock = isLowStock(item);
                const status = quantity === undefined
                  ? { label: 'در حال دریافت', className: 'is-loading' }
                  : lowStock
                    ? { label: 'موجودی کم', className: 'is-low' }
                    : rented > 0
                      ? { label: 'در حال اجاره', className: 'is-renting' }
                      : reserved > 0
                        ? { label: 'رزرو', className: 'is-reserved' }
                        : isAvailable(item)
                          ? { label: 'آزاد', className: 'is-available' }
                          : { label: 'ناموجود', className: 'is-out' };
                const currentType = item.item_type || 'sale';

                return (
                  <article
                    key={item.id}
                    className={`inventory-item-card${isEditing ? ' is-editing' : ''}`}
                    onDoubleClick={() => { if (!isEditing) handleDoubleClick(item); }}
                  >
                    <div className="inventory-card-visual">
                      <InventoryThumbnail item={item} className="inventory-card-thumbnail" />
                      <span className={`inventory-status-badge ${status.className}`}>{status.label}</span>
                    </div>
                    {isEditing ? (
                      <div className="inventory-card-edit">
                        <label>
                          نام کالا
                          <input
                            type="text"
                            value={editForm.title}
                            onChange={(event) => setEditForm({ ...editForm, title: event.target.value })}
                          />
                        </label>
                        <ImageUpload
                          value={editForm.image}
                          onChange={(value) => setEditForm((current) => ({ ...current, image: value }))}
                          onError={(message) => toast('error', message)}
                          label="تصویر"
                        />
                        <label>
                          نوع کالا
                          <select
                            value={editForm.item_type}
                            onChange={(event) => setEditForm({ ...editForm, item_type: event.target.value })}
                          >
                            <option value="sale">فروشی</option>
                            <option value="rent">اجاره‌ای</option>
                          </select>
                        </label>
                        <label>
                          موجودی
                          <FormattedNumberInput
                            value={editForm.stock_quantity}
                            onValueChange={(value) => setEditForm({ ...editForm, stock_quantity: value })}
                            aria-label={`تعداد موجودی ${item.title}`}
                          />
                        </label>
                        {showCostPrice && (
                          <label>
                            قیمت خرید
                            <FormattedNumberInput
                              value={editForm.base_cost}
                              onValueChange={(value) => setEditForm({ ...editForm, base_cost: value })}
                              emptyWhenZero
                            />
                          </label>
                        )}
                        {displayedLevels.map((level) => (
                          <label key={level}>
                            نرخ سطح {level}
                            <FormattedNumberInput
                              value={editForm[`price_level${level}`]}
                              onValueChange={(value) => setEditForm({ ...editForm, [`price_level${level}`]: value })}
                              emptyWhenZero
                            />
                          </label>
                        ))}
                        <div className="inventory-card-actions">
                          <button
                            type="button"
                            className="inventory-card-save"
                            disabled={Number(editForm.stock_quantity) !== Number(editForm.original_stock_quantity)
                              && (stockSummary.busy || !stockSummary.save)}
                            onClick={() => handleInlineSave(item.id)}
                          >
                            ذخیره
                          </button>
                          <button type="button" className="inventory-card-cancel" onClick={() => setEditingId(null)}>لغو</button>
                        </div>
                      </div>
                    ) : (
                      <div className="inventory-card-content">
                        <h3>{item.title}</h3>
                        <div className="inventory-card-meta">
                          <span className={`inventory-type-badge ${currentType === 'rent' ? 'is-rent' : 'is-sale'}`}>
                            {currentType === 'rent' ? 'اجاره‌ای' : 'فروشی'}
                          </span>
                          <span className="inventory-card-quantity">
                            موجودی: {quantity === undefined ? '—' : formatDisplay(quantity)}
                          </span>
                        </div>
                        <div className="inventory-card-price">
                          <span>نرخ سطح ۱</span>
                          <strong>{formatDisplay(item.price_level1 || 0)} تومان</strong>
                        </div>
                        {showCostPrice && (
                          <div className="inventory-card-cost">
                            قیمت خرید: {formatDisplay(item.base_cost || 0)} تومان
                          </div>
                        )}
                        <div className="inventory-card-actions">
                          <button type="button" className="inventory-card-edit-button" onClick={() => handleDoubleClick(item)}>
                            ویرایش
                          </button>
                          <button type="button" className="inventory-card-delete-button" onClick={() => handleDelete(item.id)}>
                            حذف
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )
        ) : (
        <div className="inventory-table-wrap" style={{ overflowX: 'auto' }}>
          <table className={`inventory-table${showCostPrice ? ' has-cost-column' : ''}`} style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                <th className="inventory-col-index" style={{ padding: '8px 10px' }}>ردیف</th>
                <th className="inventory-col-title" style={{ padding: '8px 10px' }}>عنوان کالا / خدمت</th>
                <th className="inventory-col-type" style={{ padding: '8px 10px' }}>نوع کالا</th>
                <th className="inventory-col-stock" style={{ padding: '8px 10px' }}>موجودی</th>
                {showCostPrice && <th className="inventory-col-cost" style={{ padding: '8px 10px', color: '#b91c1c' }}>قیمت خرید</th>}
                {displayedLevels.map((level) => (
                  <th key={level} className="inventory-col-price" style={{ padding: '8px 10px' }}>نرخ سطح {level}</th>
                ))}
                <th className="inventory-col-actions" style={{ padding: '8px 10px', textAlign: 'center' }}>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={tableColumnCount}>
                    <EmptyState
                      icon={items.length === 0 ? 'box' : 'search'}
                      title={items.length === 0 ? 'هنوز کالایی در انبار ثبت نشده' : 'موردی پیدا نشد'}
                      description={items.length === 0 ? 'برای شروع، اولین کالا یا خدمت را ثبت کنید.' : 'عبارت جستجو را تغییر دهید یا فیلتر را پاک کنید.'}
                      primaryAction={items.length === 0
                        ? { label: 'ثبت اولین کالا', onClick: () => setNewItemModalOpen(true) }
                        : { label: 'پاک کردن فیلترها', onClick: () => { setSearchQuery(''); setInventoryFilter('all'); } }}
                    />
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, index) => {
                  const isEditing = editingId === item.id;
                  const currentType = item.item_type || 'sale';

                  return (
                    <tr 
                      key={item.id} 
                      data-inventory-id={item.id}
                      className={`${String(draggingItemId) === String(item.id) ? 'is-dragging ' : ''}${String(dragOverItemId) === String(item.id) ? 'is-drop-target' : ''}`}
                      onPointerDown={(event) => {
                        if (isEditing || event.button !== 0 || savingItemOrder || searchQuery.trim()
                          || inventoryFilter !== 'all') return;
                        if (event.target.closest('button, input, select, textarea, a, [contenteditable="true"]')) return;
                        if (event.pointerType === 'touch') {
                          const startX = event.clientX;
                          const startY = event.clientY;
                          const timer = window.setTimeout(() => {
                            pendingTouchDragRef.current = null;
                            dragItemIdRef.current = String(item.id);
                            dragOverItemIdRef.current = String(item.id);
                            setDraggingItemId(item.id);
                            setDragOverItemId(String(item.id));
                          }, 450);
                          pendingTouchDragRef.current = {
                            itemId: String(item.id),
                            startX,
                            startY,
                            timer,
                          };
                          return;
                        }
                        event.preventDefault();
                        dragItemIdRef.current = String(item.id);
                        dragOverItemIdRef.current = String(item.id);
                        setDraggingItemId(item.id);
                        setDragOverItemId(String(item.id));
                      }}
                      onPointerMove={(event) => {
                        const pendingDrag = pendingTouchDragRef.current;
                        if (!pendingDrag || event.pointerType !== 'touch') return;
                        if (Math.hypot(event.clientX - pendingDrag.startX, event.clientY - pendingDrag.startY) > 8) {
                          window.clearTimeout(pendingDrag.timer);
                          pendingTouchDragRef.current = null;
                        }
                      }}
                      onPointerUp={() => {
                        if (pendingTouchDragRef.current?.timer) {
                          window.clearTimeout(pendingTouchDragRef.current.timer);
                        }
                        pendingTouchDragRef.current = null;
                      }}
                      onKeyDown={(event) => {
                        if (isEditing && event.key === 'Enter' && !event.target.closest('button')) {
                          event.preventDefault();
                          handleInlineSave(item.id);
                        }
                      }}
                      style={{ 
                        borderBottom: '1px solid #f1f5f9', 
                        backgroundColor: isEditing ? '#fefce8' : 'transparent',
                      }}
                    >
                      <td className="inventory-col-index" style={{ padding: '8px 10px', color: '#64748b' }}>
                        {formatDisplay(index + 1)}
                      </td>
                      
                      <td className="inventory-col-title" onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClick(item); }} style={{ padding: '8px 10px', fontWeight: '500', color: '#1e293b' }}>
                        {isEditing ? (
                          <div className="inventory-edit-title">
                            <input type="text" value={editForm.title} onChange={(e) => setEditForm({...editForm, title: e.target.value})} style={{ width: '100%', padding: '3px 5px', fontSize: '12px', border: '1px solid #0ea5e9', borderRadius: '3px' }} />
                            <ImageUpload
                              value={editForm.image}
                              onChange={(value) => setEditForm((current) => ({ ...current, image: value }))}
                              onError={(message) => toast('error', message)}
                              label="تصویر"
                            />
                          </div>
                        ) : (
                          <div className="inventory-item-title">
                            <InventoryThumbnail item={item} />
                            <span>{item.title}</span>
                          </div>
                        )}
                      </td>

                      <td className="inventory-col-type" onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClick(item); }} style={{ padding: '8px 10px' }}>
                        {isEditing ? (
                          <select value={editForm.item_type} onChange={(e) => setEditForm({...editForm, item_type: e.target.value})} style={{ padding: '3px 5px', fontSize: '12px', border: '1px solid #0ea5e9', borderRadius: '3px' }}>
                            <option value="sale">فروشی</option>
                            <option value="rent">اجاره‌ای</option>
                          </select>
                        ) : (
                          <span style={{ 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            fontSize: '11px', 
                            backgroundColor: currentType === 'rent' ? '#f0fdf4' : '#eff6ff',
                            color: currentType === 'rent' ? '#15803d' : '#1d4ed8',
                            border: `1px solid ${currentType === 'rent' ? '#bbf7d0' : '#bfdbfe'}`
                          }}>
                            {currentType === 'rent' ? 'اجاره‌ای' : 'فروشی'}
                          </span>
                        )}
                      </td>

                      <td className="inventory-col-stock" style={{ padding: '8px 10px', color: '#334155', fontWeight: 'bold' }}>
                        {isEditing ? (
                          <FormattedNumberInput
                            value={editForm.stock_quantity}
                            onValueChange={(value) => setEditForm({ ...editForm, stock_quantity: value })}
                            aria-label={`تعداد موجودی ${item.title}`}
                            style={{ width: '80px', padding: '3px 5px', fontSize: '12px' }}
                          />
                        ) : (
                          stockSummary.quantities
                            ? formatDisplay(stockSummary.quantities[item.id] ?? 0)
                            : '—'
                        )}
                      </td>

                      {showCostPrice && (
                        <td className="inventory-col-cost" onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClick(item); }} style={{ padding: '8px 10px', color: '#b91c1c', fontWeight: 'bold' }}>
                          {isEditing ? (
                            <FormattedNumberInput value={editForm.base_cost} onValueChange={(value) => setEditForm({...editForm, base_cost: value})} emptyWhenZero style={{ width: '90px', padding: '3px 5px', fontSize: '12px', border: '1px solid #0ea5e9', borderRadius: '3px' }} />
                          ) : (
                            <>{formatDisplay(item.base_cost || 0)}<span className="inventory-currency"> ت</span></>
                          )}
                        </td>
                      )}

                      {displayedLevels.map((level) => (
                        <td
                          key={level}
                          className="inventory-col-price"
                          onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClick(item); }}
                          style={{ padding: '8px 10px', color: '#0369a1' }}
                        >
                          {isEditing ? (
                            <FormattedNumberInput value={editForm[`price_level${level}`]} onValueChange={(value) => setEditForm({ ...editForm, [`price_level${level}`]: value })} emptyWhenZero style={{ width: '90px', padding: '3px 5px', fontSize: '12px', border: '1px solid #0ea5e9', borderRadius: '3px' }} />
                          ) : (
                            <>{formatDisplay(item[`price_level${level}`] || 0)}<span className="inventory-currency"> ت</span></>
                          )}
                        </td>
                      ))}

                      <td className="inventory-col-actions" style={{ padding: '8px 10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        {isEditing ? (
                          <div className="inventory-row-actions">
                            <button
                              type="button"
                              className="inventory-action-button save"
                              disabled={Number(editForm.stock_quantity) !== Number(editForm.original_stock_quantity)
                                && (stockSummary.busy || !stockSummary.save)}
                              onClick={() => handleInlineSave(item.id)}
                            >
                              ذخیره
                            </button>
                            <button type="button" className="inventory-action-button cancel" onClick={() => setEditingId(null)}>لغو</button>
                          </div>
                        ) : (
                          <div className="inventory-row-actions">
                            <button type="button" className="inventory-action-button delete" onClick={() => handleDelete(item.id)}>حذف</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        )}
      </section>
    </div>
  );
}
