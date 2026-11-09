import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readTable } from '../offlineSync';
import { supabase } from '../supabaseClient';
import { formatMoney as formatCurrency } from '../styles';
import {
  getInventoryAdjustment,
  getInventoryQuantity,
  getReservedQuantity,
  isBelowMinimumStock,
} from '../inventoryUtils';
import { formatPersianDate } from '../dateUtils';
import FormattedNumberInput from './FormattedNumberInput';
import PersianDateInput from './PersianDateInput';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const quantityText = (value) => Number(value || 0).toLocaleString('fa-IR', { maximumFractionDigits: 3 });
const quantityValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const createEmptyMovement = () => ({
  inventory_id: '',
  warehouse_id: '',
  movement_type: 'opening',
  quantity: '',
  unit_cost: '',
  reservation_id: '',
  note: '',
});

const reservationStatusLabel = (status) => ({
  reserved: 'رزروشده',
  issued: 'تحویل‌شده',
  fulfilled: 'فروخته‌شده',
  returned: 'عودت‌شده',
  cancelled: 'لغوشده',
}[status] || status);
const movementTypeLabel = (type) => ({
  opening: 'شمارش اولیه / ورود',
  purchase: 'خرید',
  sale_issue: 'خروج فروش',
  rental_issue: 'تحویل اجاره',
  rental_return: 'عودت اجاره',
  adjustment: 'اصلاح موجودی',
  damage: 'خرابی / کسری',
  transfer_in: 'ورود انتقال',
  transfer_out: 'خروج انتقال',
}[type] || type);

export default function InventoryOperationsPanel({
  items,
  organizationId,
  refreshInventory,
  onStockSummaryChange,
}) {
  const [warehouses, setWarehouses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [movementForm, setMovementForm] = useState(createEmptyMovement);
  const [purchaseForm, setPurchaseForm] = useState({
    inventory_id: '',
    warehouse_id: '',
    supplier_id: '',
    quantity: '',
    unit_cost: '',
    purchase_date: today(),
    reference_number: '',
    note: '',
  });
  const [reservationForm, setReservationForm] = useState({
    inventory_id: '',
    warehouse_id: '',
    reservation_type: 'sale',
    quantity: '',
    starts_on: '',
    ends_on: '',
    note: '',
  });
  const [transferForm, setTransferForm] = useState({
    inventory_id: '',
    from_warehouse_id: '',
    to_warehouse_id: '',
    quantity: '',
    note: '',
  });
  const [warehouseName, setWarehouseName] = useState('');
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', notes: '' });
  const [minimumStockForm, setMinimumStockForm] = useState({ inventory_id: '', minimum_stock: '' });
  const [stockTargets, setStockTargets] = useState({});
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [feedback, setFeedback] = useState('');
  const [offlineData, setOfflineData] = useState(false);
  const saveStockTargetRef = useRef(null);
  const [operationsModalOpen, setOperationsModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    const results = await Promise.all([
      readTable('inventory_warehouses', { orderBy: 'name', ascending: true }),
      readTable('inventory_suppliers', { orderBy: 'name', ascending: true }),
      readTable('inventory_stock_movements', { orderBy: 'created_at', ascending: false }),
      readTable('inventory_purchase_receipts', { orderBy: 'purchase_date', ascending: false }),
      readTable('inventory_transfers', { orderBy: 'transfer_date', ascending: false }),
      readTable('inventory_reservations', { orderBy: 'created_at', ascending: false }),
    ]);
    const failed = results.find((result) => result.error);
    if (failed) {
      setErrorMessage(`دریافت اطلاعات انبار ناموفق بود: ${failed.error.message}`);
      return;
    }

    setErrorMessage('');
    const fetchedWarehouses = results[0].data || [];
    setWarehouses(fetchedWarehouses);
    setSuppliers(results[1].data || []);
    setMovements(results[2].data || []);
    setReceipts(results[3].data || []);
    setTransfers(results[4].data || []);
    setReservations(results[5].data || []);
    setOfflineData(results.some((result) => result.offline));
    const defaultWarehouse = fetchedWarehouses.find((warehouse) => warehouse.is_default) || fetchedWarehouses[0];
    if (defaultWarehouse) {
      const warehouseExists = (id) => fetchedWarehouses.some((warehouse) => String(warehouse.id) === String(id));
      setSelectedWarehouseId((current) => (
        warehouseExists(current) ? current : String(defaultWarehouse.id)
      ));
      setMovementForm((current) => ({
        ...current,
        warehouse_id: warehouseExists(current.warehouse_id) ? current.warehouse_id : String(defaultWarehouse.id),
      }));
      setPurchaseForm((current) => ({
        ...current,
        warehouse_id: warehouseExists(current.warehouse_id) ? current.warehouse_id : String(defaultWarehouse.id),
      }));
      setReservationForm((current) => ({
        ...current,
        warehouse_id: warehouseExists(current.warehouse_id) ? current.warehouse_id : String(defaultWarehouse.id),
      }));
      setTransferForm((current) => ({
        ...current,
        from_warehouse_id: warehouseExists(current.from_warehouse_id)
          ? current.from_warehouse_id
          : String(defaultWarehouse.id),
        to_warehouse_id: warehouseExists(current.to_warehouse_id)
          ? current.to_warehouse_id
          : String(fetchedWarehouses.find(
            (warehouse) => String(warehouse.id) !== String(defaultWarehouse.id),
          )?.id || ''),
      }));
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(refresh, 0);
    const handleOfflineUpdate = () => refresh();
    window.addEventListener('offline-data-updated', handleOfflineUpdate);
    window.addEventListener('inventory-data-updated', handleOfflineUpdate);
    return () => {
      window.clearTimeout(loadTimer);
      window.removeEventListener('offline-data-updated', handleOfflineUpdate);
      window.removeEventListener('inventory-data-updated', handleOfflineUpdate);
    };
  }, [refresh, organizationId]);

  const activeItems = useMemo(
    () => items.filter((item) => Number.isSafeInteger(Number(item?.id)) && Number(item.id) > 0),
    [items],
  );
  const stockFor = useCallback(
    (inventoryId, warehouseId) => getInventoryQuantity(movements, inventoryId, warehouseId),
    [movements],
  );
  useEffect(() => {
    if (typeof onStockSummaryChange !== 'function' || !selectedWarehouseId) return;
    const activeWarehouse = warehouses.find(
      (warehouse) => String(warehouse.id) === String(selectedWarehouseId),
    );
    if (!activeWarehouse) return;
    const quantities = Object.fromEntries(items.map((item) => [
      item.id,
      getInventoryQuantity(movements, item.id, selectedWarehouseId),
    ]));
    onStockSummaryChange({
      warehouseName: activeWarehouse.name,
      quantities,
      busy: busy || offlineData,
      save: (inventoryId, targetQuantity) => {
        const item = items.find((candidate) => String(candidate.id) === String(inventoryId));
        if (!item) return Promise.resolve(false);
        const stockKey = `${selectedWarehouseId}:${item.id}`;
        return saveStockTargetRef.current?.(
          item,
          selectedWarehouseId,
          getInventoryQuantity(movements, item.id, selectedWarehouseId),
          stockKey,
          targetQuantity,
        ) ?? Promise.resolve(false);
      },
    });
  }, [items, movements, onStockSummaryChange, selectedWarehouseId, warehouses, busy, offlineData]);
  const reservationOptions = useMemo(() => reservations.filter((reservation) => (
    String(reservation.inventory_id) === String(movementForm.inventory_id)
    && String(reservation.warehouse_id) === String(movementForm.warehouse_id)
    && (movementForm.movement_type === 'rental_return'
      ? reservation.status === 'issued' && reservation.reservation_type === 'rent'
      : reservation.status === 'reserved'
        && ((movementForm.movement_type === 'rental_issue' && reservation.reservation_type === 'rent')
          || (movementForm.movement_type === 'sale_issue' && reservation.reservation_type === 'sale')))
  )), [reservations, movementForm]);

  const runOnlineAction = async (action, successMessage) => {
    if (!organizationId) {
      setErrorMessage('فضای کاری فعال مشخص نیست.');
      return false;
    }
    if (!navigator.onLine || offlineData) {
      setErrorMessage('برای ثبت عملیات موجودی به اتصال آنلاین و دادهٔ تازهٔ انبار نیاز است.');
      return false;
    }
    setBusy(true);
    setErrorMessage('');
    setFeedback('');
    try {
      await action();
      await refresh();
      setFeedback(successMessage);
      return true;
    } catch (error) {
      setErrorMessage(`عملیات انبار ناموفق بود: ${error.message}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const insertOnline = async (table, row) => {
    const { error } = await supabase.from(table).insert({
      ...row,
      organization_id: organizationId,
      offline_sync_id: crypto.randomUUID(),
    });
    if (error) throw error;
  };

  const saveWarehouse = async (event) => {
    event.preventDefault();
    const name = warehouseName.trim();
    if (!name) return;
    await runOnlineAction(async () => {
      await insertOnline('inventory_warehouses', { name });
      setWarehouseName('');
      window.dispatchEvent(new Event('inventory-data-updated'));
    }, 'انبار جدید ثبت شد.');
  };

  const saveSupplier = async (event) => {
    event.preventDefault();
    const name = supplierForm.name.trim();
    if (!name) return;
    await runOnlineAction(async () => {
      await insertOnline('inventory_suppliers', {
        name,
        phone: supplierForm.phone.trim(),
        notes: supplierForm.notes.trim(),
      });
      setSupplierForm({ name: '', phone: '', notes: '' });
    }, 'تأمین‌کننده ثبت شد.');
  };

  const saveMovement = async (event) => {
    event.preventDefault();
    const rawQuantity = Number(movementForm.quantity);
    const quantity = movementForm.movement_type === 'adjustment'
      ? rawQuantity
      : quantityValue(movementForm.quantity);
    if (!movementForm.inventory_id || !movementForm.warehouse_id
      || !Number.isFinite(quantity) || quantity === 0
      || (movementForm.movement_type !== 'adjustment' && quantity < 0)) {
      setErrorMessage('کالا، انبار و مقدار معتبر را انتخاب کنید.');
      return;
    }
    const openingCost = movementForm.unit_cost === '' ? null : Number(movementForm.unit_cost);
    if (movementForm.movement_type === 'opening' && openingCost !== null
      && (!Number.isSafeInteger(openingCost) || openingCost < 0)) {
      setErrorMessage('بهای واحد اولیه باید عدد صحیح و نامنفی باشد.');
      return;
    }
    const negative = ['sale_issue', 'rental_issue', 'damage'].includes(movementForm.movement_type);
    const quantityDelta = negative ? -quantity : quantity;
    if (movementForm.movement_type === 'rental_return' && !movementForm.reservation_id) {
      setErrorMessage('برای ثبت عودت، رزرو اجارهٔ مربوط را انتخاب کنید.');
      return;
    }
    if (movementForm.movement_type === 'rental_issue' && !movementForm.reservation_id) {
      setErrorMessage('خروج اجاره باید به رزرو تأییدشده متصل باشد.');
      return;
    }
    await runOnlineAction(async () => {
      await insertOnline('inventory_stock_movements', {
        inventory_id: Number(movementForm.inventory_id),
        warehouse_id: Number(movementForm.warehouse_id),
        reservation_id: movementForm.reservation_id ? Number(movementForm.reservation_id) : null,
        movement_type: movementForm.movement_type,
        quantity_delta: quantityDelta,
        unit_cost: movementForm.movement_type === 'opening' ? openingCost : null,
        note: movementForm.note.trim(),
        source_type: 'manual',
      });
      setMovementForm((current) => ({ ...createEmptyMovement(), warehouse_id: current.warehouse_id }));
    }, 'گردش موجودی ثبت شد.');
  };

  const savePurchase = async (event) => {
    event.preventDefault();
    const quantity = quantityValue(purchaseForm.quantity);
    const unitCost = Number(purchaseForm.unit_cost);
    if (!purchaseForm.inventory_id || !purchaseForm.warehouse_id || !quantity
      || !Number.isSafeInteger(unitCost) || unitCost < 0 || !purchaseForm.purchase_date) {
      setErrorMessage('کالا، انبار، تاریخ و مقادیر معتبر خرید را وارد کنید.');
      return;
    }
    await runOnlineAction(async () => {
      await insertOnline('inventory_purchase_receipts', {
        inventory_id: Number(purchaseForm.inventory_id),
        warehouse_id: Number(purchaseForm.warehouse_id),
        supplier_id: purchaseForm.supplier_id ? Number(purchaseForm.supplier_id) : null,
        quantity,
        unit_cost: unitCost,
        purchase_date: purchaseForm.purchase_date,
        reference_number: purchaseForm.reference_number.trim(),
        note: purchaseForm.note.trim(),
      });
      setPurchaseForm((current) => ({
        ...current,
        inventory_id: '',
        supplier_id: '',
        quantity: '',
        unit_cost: '',
        reference_number: '',
        note: '',
      }));
    }, 'رسید خرید ثبت و موجودی انبار افزایش یافت.');
  };

  const saveReservation = async (event) => {
    event.preventDefault();
    const quantity = quantityValue(reservationForm.quantity);
    if (!reservationForm.inventory_id || !reservationForm.warehouse_id || !quantity) {
      setErrorMessage('کالا، انبار و مقدار معتبر رزرو را وارد کنید.');
      return;
    }
    if (reservationForm.reservation_type === 'rent'
      && (!reservationForm.starts_on || !reservationForm.ends_on
        || reservationForm.ends_on < reservationForm.starts_on)) {
      setErrorMessage('برای اجاره، تاریخ تحویل و عودت معتبر را وارد کنید.');
      return;
    }
    await runOnlineAction(async () => {
      await insertOnline('inventory_reservations', {
        inventory_id: Number(reservationForm.inventory_id),
        warehouse_id: Number(reservationForm.warehouse_id),
        source_type: 'manual',
        source_id: crypto.randomUUID(),
        reservation_type: reservationForm.reservation_type,
        quantity,
        starts_on: reservationForm.reservation_type === 'rent' ? reservationForm.starts_on : null,
        ends_on: reservationForm.reservation_type === 'rent' ? reservationForm.ends_on : null,
        note: reservationForm.note.trim(),
      });
      setReservationForm((current) => ({ ...current, inventory_id: '', quantity: '', starts_on: '', ends_on: '', note: '' }));
    }, 'رزرو موجودی ثبت شد.');
  };

  const saveTransfer = async (event) => {
    event.preventDefault();
    const quantity = quantityValue(transferForm.quantity);
    if (!transferForm.inventory_id || !transferForm.from_warehouse_id || !transferForm.to_warehouse_id
      || !quantity || transferForm.from_warehouse_id === transferForm.to_warehouse_id) {
      setErrorMessage('کالا، دو انبار متفاوت و مقدار معتبر انتقال را انتخاب کنید.');
      return;
    }
    await runOnlineAction(async () => {
      await insertOnline('inventory_transfers', {
        inventory_id: Number(transferForm.inventory_id),
        from_warehouse_id: Number(transferForm.from_warehouse_id),
        to_warehouse_id: Number(transferForm.to_warehouse_id),
        quantity,
        note: transferForm.note.trim(),
      });
      setTransferForm((current) => ({ ...current, inventory_id: '', quantity: '', note: '' }));
    }, 'انتقال ثبت شد و هر دو گردش موجودی باهم اعمال شدند.');
  };

  const updateMinimumStock = async (event) => {
    event.preventDefault();
    const minimumStock = Number(minimumStockForm.minimum_stock);
    if (!minimumStockForm.inventory_id || !Number.isFinite(minimumStock) || minimumStock < 0) {
      setErrorMessage('کالا و حداقل موجودی معتبر را وارد کنید.');
      return;
    }
    await runOnlineAction(async () => {
      const { error } = await supabase.from('inventory')
        .update({ minimum_stock: minimumStock })
        .eq('id', Number(minimumStockForm.inventory_id))
        .eq('organization_id', organizationId)
        .select('id')
        .single();
      if (error) throw error;
      setMinimumStockForm({ inventory_id: '', minimum_stock: '' });
      await refreshInventory?.();
    }, 'حداقل موجودی ثبت شد.');
  };

  const saveStockTarget = async (item, warehouseId, currentQuantity, stockKey, targetValue) => {
    const targetQuantity = Number(targetValue ?? stockTargets[stockKey] ?? currentQuantity);
    if (!Number.isFinite(targetQuantity) || targetQuantity < 0
      || Math.round(targetQuantity * 1000) / 1000 !== targetQuantity) {
      setErrorMessage('موجودی نهایی باید عددی نامنفی با حداکثر سه رقم اعشار باشد.');
      return;
    }

    const quantityDelta = getInventoryAdjustment(currentQuantity, targetQuantity);
    if (quantityDelta === 0) {
      setFeedback('موجودی با مقدار فعلی یکسان است.');
      setErrorMessage('');
      return true;
    }

    return runOnlineAction(async () => {
      await insertOnline('inventory_stock_movements', {
        inventory_id: Number(item.id),
        warehouse_id: Number(warehouseId),
        movement_type: 'adjustment',
        quantity_delta: quantityDelta,
        note: 'اصلاح موجودی از شمارش انبار',
        source_type: 'manual',
      });
    }, 'موجودی انبار اصلاح شد.');
  };
  useEffect(() => {
    saveStockTargetRef.current = saveStockTarget;
  });

  useEffect(() => {
    if (!operationsModalOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !busy) setOperationsModalOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [operationsModalOpen, busy]);

  const setDefaultWarehouse = async () => runOnlineAction(async () => {
    const { error } = await supabase.rpc('set_default_inventory_warehouse', {
      p_organization_id: organizationId,
      p_warehouse_id: Number(activeWarehouseId),
    });
    if (error) throw error;
  }, 'انبار اصلی تغییر کرد؛ سفارش‌های بات در این انبار رزرو می‌شوند.');

  const cancelReservation = async (reservation) => {
    if (!window.confirm(`رزرو «${nameForItem(reservation.inventory_id)}» به تعداد ${quantityText(reservation.quantity)} لغو و موجودی آن آزاد شود؟`)) {
      return;
    }
    if (!organizationId) {
      setErrorMessage('فضای کاری فعال مشخص نیست.');
      return;
    }
    if (!navigator.onLine) {
      setErrorMessage('برای لغو رزرو باید به اینترنت متصل شوید.');
      return;
    }

    setBusy(true);
    setErrorMessage('');
    setFeedback('');
    try {
      const { data: currentReservation, error: readError } = await supabase
        .from('inventory_reservations')
        .select('id,status')
        .eq('id', reservation.id)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (readError) throw readError;
      if (!currentReservation || currentReservation.status !== 'reserved') {
        throw new Error('این رزرو دیگر فعال نیست؛ فهرست رزروها را تازه کنید.');
      }

      const { data, error } = await supabase.from('inventory_reservations')
        .update({ status: 'cancelled' })
        .eq('id', reservation.id)
        .eq('organization_id', organizationId)
        .eq('status', 'reserved')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('رزرو لغو نشد؛ ممکن است وضعیت آن هم‌زمان تغییر کرده باشد.');

      await refresh();
      setFeedback('رزرو لغو شد و موجودی آزاد شد.');
    } catch (error) {
      setErrorMessage(`لغو رزرو ناموفق بود: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const issueReservation = async (reservation) => runOnlineAction(async () => {
    await insertOnline('inventory_stock_movements', {
      inventory_id: reservation.inventory_id,
      warehouse_id: reservation.warehouse_id,
      reservation_id: reservation.id,
      movement_type: reservation.reservation_type === 'rent' ? 'rental_issue' : 'sale_issue',
      quantity_delta: -Number(reservation.quantity),
      note: reservation.note || '',
      source_type: reservation.source_type,
      source_id: reservation.source_id,
    });
  }, 'تحویل موجودی ثبت شد.');

  const returnReservation = async (reservation) => runOnlineAction(async () => {
    await insertOnline('inventory_stock_movements', {
      inventory_id: reservation.inventory_id,
      warehouse_id: reservation.warehouse_id,
      reservation_id: reservation.id,
      movement_type: 'rental_return',
      quantity_delta: Number(reservation.quantity),
      note: reservation.note || '',
      source_type: reservation.source_type,
      source_id: reservation.source_id,
    });
  }, 'عودت اجاره ثبت و موجودی انبار افزایش یافت.');

  const activeWarehouseId = selectedWarehouseId || String(warehouses.find((warehouse) => warehouse.is_default)?.id || '');
  const lowStockItems = activeItems.filter((item) => (
    isBelowMinimumStock(item, stockFor(item.id, activeWarehouseId))
  ));
  const nameForItem = (id) => activeItems.find((item) => String(item.id) === String(id))?.title || `کالای ${id}`;
  const nameForWarehouse = (id) => warehouses.find((warehouse) => String(warehouse.id) === String(id))?.name || 'انبار نامشخص';
  const nameForSupplier = (id) => suppliers.find((supplier) => String(supplier.id) === String(id))?.name || '—';
  const inputOptions = (value, onChange, options, placeholder, required = true) => (
    <select value={value} onChange={(event) => onChange(event.target.value)} required={required}>
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>{option.title || option.name}</option>
      ))}
    </select>
  );

  return (
    <section className="inventory-operations" dir="rtl" aria-label="عملیات موجودی">
      {offlineData && (
        <p className="inventory-ops-message warning" role="status">
          داده‌های نمایش‌داده‌شده از حافظهٔ آفلاین هستند؛ عملیات موجودی تا دریافت دادهٔ تازه غیرفعال است.
        </p>
      )}
      {errorMessage && <p className="inventory-ops-message error" role="alert">{errorMessage}</p>}
      {feedback && <p className="inventory-ops-message success" role="status">{feedback}</p>}
      <button
        type="button"
        className="inventory-ops-open-button"
        onClick={() => setOperationsModalOpen(true)}
      >
        عملیات انبار
        <span className={lowStockItems.length ? 'inventory-ops-drawer-alert' : 'inventory-ops-drawer-count'}>
          {formatNumber(lowStockItems.length)} هشدار کمبود
        </span>
      </button>
      {operationsModalOpen && (
        <div
          className="inventory-ops-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setOperationsModalOpen(false);
          }}
        >
          <section
            className="inventory-ops-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-ops-modal-title"
            dir="rtl"
          >
            <header className="inventory-ops-modal-heading">
              <h2 id="inventory-ops-modal-title">عملیات و گزارش‌های انبار</h2>
              <button
                type="button"
                aria-label="بستن عملیات انبار"
                onClick={() => setOperationsModalOpen(false)}
                disabled={busy}
              >
                ×
              </button>
            </header>
            <div className="inventory-ops-modal-content">
      <header className="inventory-operations-heading">
        <div>
          <h3>موجودی و گردش انبار</h3>
          <p>موجودی از دفتر ورود و خروج محاسبه می‌شود؛ خرید، انتقال و رزروها سابقهٔ جداگانه دارند.</p>
        </div>
        <button type="button" className="inventory-ops-secondary" onClick={refresh} disabled={busy}>
          ↻ تازه‌سازی
        </button>
      </header>

      <div className="inventory-ops-summary">
        <label>
          نمایش موجودی انبار
          <select value={activeWarehouseId} onChange={(event) => setSelectedWarehouseId(event.target.value)}>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}{warehouse.is_default ? ' (اصلی)' : ''}
              </option>
            ))}
          </select>
        </label>
        {!warehouses.find((warehouse) => String(warehouse.id) === String(activeWarehouseId))?.is_default && (
          <button
            type="button"
            className="inventory-ops-secondary"
            onClick={setDefaultWarehouse}
            disabled={busy || offlineData}
          >
            تنظیم به‌عنوان انبار اصلی بات
          </button>
        )}
        <strong>{formatNumber(lowStockItems.length)} هشدار کمبود موجودی</strong>
        {lowStockItems.length > 0 && (
          <span>{lowStockItems.slice(0, 4).map((item) => item.title).join('، ')}</span>
        )}
      </div>

      <div className="inventory-ops-grid">
        <form className="inventory-ops-card" onSubmit={saveWarehouse}>
          <h4>انبار جدید</h4>
          <input value={warehouseName} onChange={(event) => setWarehouseName(event.target.value)} placeholder="نام انبار" required />
          <button type="submit" disabled={busy || offlineData}>ثبت انبار</button>
        </form>

        <form className="inventory-ops-card" onSubmit={saveSupplier}>
          <h4>تأمین‌کننده</h4>
          <input value={supplierForm.name} onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })} placeholder="نام تأمین‌کننده" required />
          <input value={supplierForm.phone} onChange={(event) => setSupplierForm({ ...supplierForm, phone: event.target.value })} placeholder="شماره تماس" />
          <input value={supplierForm.notes} onChange={(event) => setSupplierForm({ ...supplierForm, notes: event.target.value })} placeholder="یادداشت" />
          <button type="submit" disabled={busy || offlineData}>ثبت تأمین‌کننده</button>
        </form>

        <form className="inventory-ops-card" onSubmit={saveMovement}>
          <h4>ورود / خروج / شمارش</h4>
          {inputOptions(movementForm.inventory_id, (value) => setMovementForm({ ...movementForm, inventory_id: value, reservation_id: '' }), activeItems, 'انتخاب کالا')}
          {inputOptions(movementForm.warehouse_id, (value) => setMovementForm({ ...movementForm, warehouse_id: value, reservation_id: '' }), warehouses, 'انتخاب انبار')}
          <select value={movementForm.movement_type} onChange={(event) => setMovementForm({ ...movementForm, movement_type: event.target.value, reservation_id: '' })}>
            <option value="opening">شمارش اولیه / ورود</option>
            <option value="adjustment">اصلاح موجودی (+/-)</option>
            <option value="sale_issue">خروج فروش</option>
            <option value="rental_issue">تحویل اجاره</option>
            <option value="rental_return">عودت اجاره</option>
            <option value="damage">کسری / خرابی</option>
          </select>
          <FormattedNumberInput
            value={movementForm.quantity}
            allowNegative={movementForm.movement_type === 'adjustment'}
            onValueChange={(value) => setMovementForm({ ...movementForm, quantity: value })}
            placeholder={movementForm.movement_type === 'adjustment' ? 'مقدار اصلاح (+/-)' : 'تعداد'}
            required
          />
          {movementForm.movement_type === 'opening' && (
            <FormattedNumberInput
              allowDecimal={false}
              value={movementForm.unit_cost}
              onValueChange={(value) => setMovementForm({ ...movementForm, unit_cost: value })}
              placeholder="بهای واحد اولیه (اختیاری)"
            />
          )}
          {['sale_issue', 'rental_issue', 'rental_return'].includes(movementForm.movement_type) && inputOptions(
            movementForm.reservation_id,
            (value) => setMovementForm({ ...movementForm, reservation_id: value }),
            reservationOptions.map((reservation) => ({
              id: reservation.id,
              title: `رزرو ${reservation.source_id} — ${quantityText(reservation.quantity)} عدد`,
            })),
            'انتخاب رزرو (برای خروج آزاد، خالی بماند)',
            movementForm.movement_type !== 'sale_issue',
          )}
          <input value={movementForm.note} onChange={(event) => setMovementForm({ ...movementForm, note: event.target.value })} placeholder="توضیحات" />
          <button type="submit" disabled={busy || offlineData}>ثبت گردش</button>
        </form>

        <form className="inventory-ops-card" onSubmit={savePurchase}>
          <h4>ثبت رسید خرید</h4>
          {inputOptions(purchaseForm.inventory_id, (value) => setPurchaseForm({ ...purchaseForm, inventory_id: value }), activeItems, 'انتخاب کالا')}
          {inputOptions(purchaseForm.warehouse_id, (value) => setPurchaseForm({ ...purchaseForm, warehouse_id: value }), warehouses, 'انتخاب انبار')}
          <select value={purchaseForm.supplier_id} onChange={(event) => setPurchaseForm({ ...purchaseForm, supplier_id: event.target.value })}>
            <option value="">بدون تأمین‌کننده</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
          <FormattedNumberInput value={purchaseForm.quantity} onValueChange={(value) => setPurchaseForm({ ...purchaseForm, quantity: value })} placeholder="تعداد خرید" required />
          <FormattedNumberInput allowDecimal={false} value={purchaseForm.unit_cost} onValueChange={(value) => setPurchaseForm({ ...purchaseForm, unit_cost: value })} placeholder="بهای خرید هر واحد (تومان)" required />
          <PersianDateInput value={purchaseForm.purchase_date} onChange={(value) => setPurchaseForm({ ...purchaseForm, purchase_date: value })} required />
          <input value={purchaseForm.reference_number} onChange={(event) => setPurchaseForm({ ...purchaseForm, reference_number: event.target.value })} placeholder="شماره فاکتور خرید" />
          <input value={purchaseForm.note} onChange={(event) => setPurchaseForm({ ...purchaseForm, note: event.target.value })} placeholder="یادداشت رسید" />
          <button type="submit" disabled={busy || offlineData}>ثبت رسید و افزایش موجودی</button>
        </form>

        <form className="inventory-ops-card" onSubmit={saveReservation}>
          <h4>رزرو دستی فروش / اجاره</h4>
          {inputOptions(reservationForm.inventory_id, (value) => setReservationForm({ ...reservationForm, inventory_id: value }), activeItems, 'انتخاب کالا')}
          {inputOptions(reservationForm.warehouse_id, (value) => setReservationForm({ ...reservationForm, warehouse_id: value }), warehouses, 'انتخاب انبار')}
          <select value={reservationForm.reservation_type} onChange={(event) => setReservationForm({ ...reservationForm, reservation_type: event.target.value })}>
            <option value="sale">رزرو فروش</option>
            <option value="rent">رزرو اجاره</option>
          </select>
          <FormattedNumberInput value={reservationForm.quantity} onValueChange={(value) => setReservationForm({ ...reservationForm, quantity: value })} placeholder="تعداد" required />
          {reservationForm.reservation_type === 'rent' && (
            <>
              <label>تاریخ تحویل<PersianDateInput value={reservationForm.starts_on} onChange={(value) => setReservationForm({ ...reservationForm, starts_on: value })} required /></label>
              <label>تاریخ عودت<PersianDateInput value={reservationForm.ends_on} onChange={(value) => setReservationForm({ ...reservationForm, ends_on: value })} required /></label>
            </>
          )}
          <input value={reservationForm.note} onChange={(event) => setReservationForm({ ...reservationForm, note: event.target.value })} placeholder="شماره سفارش / توضیحات" />
          <button type="submit" disabled={busy || offlineData}>ثبت رزرو</button>
        </form>

        <form className="inventory-ops-card" onSubmit={saveTransfer}>
          <h4>انتقال بین انبارها</h4>
          {inputOptions(transferForm.inventory_id, (value) => setTransferForm({ ...transferForm, inventory_id: value }), activeItems, 'انتخاب کالا')}
          {inputOptions(transferForm.from_warehouse_id, (value) => setTransferForm({ ...transferForm, from_warehouse_id: value }), warehouses, 'از انبار')}
          {inputOptions(transferForm.to_warehouse_id, (value) => setTransferForm({ ...transferForm, to_warehouse_id: value }), warehouses, 'به انبار')}
          <FormattedNumberInput value={transferForm.quantity} onValueChange={(value) => setTransferForm({ ...transferForm, quantity: value })} placeholder="تعداد" required />
          <input value={transferForm.note} onChange={(event) => setTransferForm({ ...transferForm, note: event.target.value })} placeholder="توضیحات" />
          <button type="submit" disabled={busy || offlineData}>ثبت انتقال</button>
        </form>

        <form className="inventory-ops-card" onSubmit={updateMinimumStock}>
          <h4>هشدار حداقل موجودی</h4>
          {inputOptions(minimumStockForm.inventory_id, (value) => setMinimumStockForm({ ...minimumStockForm, inventory_id: value }), activeItems, 'انتخاب کالا')}
          <FormattedNumberInput value={minimumStockForm.minimum_stock} onValueChange={(value) => setMinimumStockForm({ ...minimumStockForm, minimum_stock: value })} placeholder="حداقل موجودی هشدار" required />
          <button type="submit" disabled={busy || offlineData}>ذخیره حداقل</button>
        </form>
      </div>

      <div className="inventory-ops-card inventory-ops-table-card">
        <h4>مانده و کمبود موجودی — {nameForWarehouse(activeWarehouseId)}</h4>
        <div className="inventory-ops-table-wrap">
          <table>
            <thead><tr><th>کالا</th><th>موجودی نهایی</th><th>قیمت خرید</th><th>رزرو فعال</th><th>حداقل</th><th>وضعیت</th></tr></thead>
            <tbody>
              {activeItems.map((item) => {
                const onHand = stockFor(item.id, activeWarehouseId);
                const stockKey = `${activeWarehouseId}:${item.id}`;
                const reserved = getReservedQuantity(reservations, item.id, activeWarehouseId);
                const threshold = Number(item.minimum_stock || 0);
                const low = isBelowMinimumStock(item, onHand);
                return (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>
                      <div className="inventory-stock-editor">
                        <FormattedNumberInput
                          value={stockTargets[stockKey] ?? String(onHand)}
                          onValueChange={(value) => setStockTargets((current) => ({
                            ...current,
                            [stockKey]: value,
                          }))}
                          aria-label={`موجودی نهایی ${item.title}`}
                        />
                        <button
                          type="button"
                          disabled={busy || offlineData}
                          onClick={() => saveStockTarget(item, activeWarehouseId, onHand, stockKey)}
                        >
                          اصلاح
                        </button>
                      </div>
                    </td>
                    <td>{Number(item.base_cost) > 0 ? formatMoney(item.base_cost) : '—'}</td>
                    <td>{quantityText(reserved)}</td>
                    <td>{quantityText(threshold)}</td>
                    <td className={low ? 'is-low' : ''}>{low ? 'کمتر از حداقل' : 'عادی'}</td>
                  </tr>
                );
              })}
              {activeItems.length === 0 && <tr><td colSpan="6">هنوز کالایی ثبت نشده است.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="inventory-ops-card inventory-ops-table-card">
        <h4>رزروهای موجودی</h4>
        <div className="inventory-ops-table-wrap">
          <table>
            <thead><tr><th>کالا</th><th>نوع</th><th>تعداد</th><th>بازه / منبع</th><th>انبار</th><th>وضعیت</th><th>عملیات</th></tr></thead>
            <tbody>
              {reservations.map((reservation) => (
                <tr key={reservation.id}>
                  <td>{nameForItem(reservation.inventory_id)}</td>
                  <td>{reservation.reservation_type === 'rent' ? 'اجاره' : 'فروش'}</td>
                  <td>{quantityText(reservation.quantity)}</td>
                  <td>
                    {reservation.starts_on
                      ? `${formatPersianDate(reservation.starts_on)} تا ${formatPersianDate(reservation.ends_on)} · ${
                        reservation.source_type === 'invoice'
                          ? 'فاکتور'
                          : reservation.source_type === 'bot' ? 'سفارش ربات' : 'رزرو'
                      } #${reservation.source_id.split(':')[0]}`
                      : `${reservation.source_type === 'bot' ? 'ربات' : 'دستی'} #${reservation.source_id}`}
                  </td>
                  <td>{nameForWarehouse(reservation.warehouse_id)}</td>
                  <td>{reservationStatusLabel(reservation.status)}</td>
                  <td>
                    {reservation.status === 'reserved' && (
                      <>
                        <button type="button" disabled={busy || offlineData} onClick={() => issueReservation(reservation)}>ثبت تحویل</button>
                        <button
                          type="button"
                          className="inventory-reservation-cancel"
                          disabled={busy}
                          onClick={() => cancelReservation(reservation)}
                          title="لغو رزرو و آزاد کردن موجودی"
                        >
                          لغو رزرو
                        </button>
                      </>
                    )}
                    {reservation.status === 'issued' && reservation.reservation_type === 'rent' && (
                      <button type="button" disabled={busy || offlineData} onClick={() => returnReservation(reservation)}>ثبت عودت</button>
                    )}
                  </td>
                </tr>
              ))}
              {reservations.length === 0 && <tr><td colSpan="7">رزروی ثبت نشده است.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <details className="inventory-ops-ledger">
        <summary>گردش‌های اخیر ({formatNumber(movements.length)})</summary>
        <div className="inventory-ops-table-wrap">
          <table>
            <thead><tr><th>زمان</th><th>کالا</th><th>انبار</th><th>نوع</th><th>تغییر</th><th>بهای واحد</th><th>توضیحات</th></tr></thead>
            <tbody>
              {movements.slice(0, 100).map((movement) => (
                <tr key={movement.id}>
                  <td>{new Date(movement.created_at).toLocaleDateString('fa-IR')}</td>
                  <td>{nameForItem(movement.inventory_id)}</td>
                  <td>{nameForWarehouse(movement.warehouse_id)}</td>
                  <td>{movementTypeLabel(movement.movement_type)}</td>
                  <td>{quantityText(movement.quantity_delta)}</td>
                  <td>{movement.unit_cost == null ? '—' : formatMoney(movement.unit_cost)}</td>
                  <td>{movement.note || movement.source_type}</td>
                </tr>
              ))}
              {movements.length === 0 && <tr><td colSpan="7">گردشی ثبت نشده است.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="inventory-ops-muted">
          رسیدهای خرید: {formatNumber(receipts.length)}، انتقال‌ها: {formatNumber(transfers.length)}
        </p>
      </details>

      <details className="inventory-ops-ledger">
        <summary>رسیدهای خرید و بهای خرید ({formatNumber(receipts.length)})</summary>
        <div className="inventory-ops-table-wrap">
          <table>
            <thead><tr><th>تاریخ</th><th>کالا</th><th>انبار</th><th>تأمین‌کننده</th><th>تعداد</th><th>بهای واحد</th><th>جمع</th><th>شماره مرجع</th></tr></thead>
            <tbody>
              {receipts.slice(0, 100).map((receipt) => (
                <tr key={receipt.id}>
                  <td>{receipt.purchase_date}</td>
                  <td>{nameForItem(receipt.inventory_id)}</td>
                  <td>{nameForWarehouse(receipt.warehouse_id)}</td>
                  <td>{nameForSupplier(receipt.supplier_id)}</td>
                  <td>{quantityText(receipt.quantity)}</td>
                  <td>{formatMoney(receipt.unit_cost)}</td>
                  <td>{formatMoney(Number(receipt.quantity) * Number(receipt.unit_cost))}</td>
                  <td>{receipt.reference_number || '—'}</td>
                </tr>
              ))}
              {receipts.length === 0 && <tr><td colSpan="8">رسید خریدی ثبت نشده است.</td></tr>}
            </tbody>
          </table>
        </div>
      </details>

      <details className="inventory-ops-ledger">
        <summary>انتقال‌های بین انبارها ({formatNumber(transfers.length)})</summary>
        <div className="inventory-ops-table-wrap">
          <table>
            <thead><tr><th>تاریخ</th><th>کالا</th><th>از انبار</th><th>به انبار</th><th>تعداد</th><th>توضیحات</th></tr></thead>
            <tbody>
              {transfers.slice(0, 100).map((transfer) => (
                <tr key={transfer.id}>
                  <td>{transfer.transfer_date}</td>
                  <td>{nameForItem(transfer.inventory_id)}</td>
                  <td>{nameForWarehouse(transfer.from_warehouse_id)}</td>
                  <td>{nameForWarehouse(transfer.to_warehouse_id)}</td>
                  <td>{quantityText(transfer.quantity)}</td>
                  <td>{transfer.note || '—'}</td>
                </tr>
              ))}
              {transfers.length === 0 && <tr><td colSpan="6">انتقالی ثبت نشده است.</td></tr>}
            </tbody>
          </table>
        </div>
      </details>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('fa-IR');
}

function formatMoney(value) {
  return formatCurrency(value, { maximumFractionDigits: 3 });
}
