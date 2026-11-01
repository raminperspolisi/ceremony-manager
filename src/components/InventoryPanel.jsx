import React, { useEffect, useState } from 'react';
import { deleteRows, insertRows, readTable, updateRows } from '../offlineSync';
import { formatDisplay } from '../styles';
import FormattedNumberInput from './FormattedNumberInput';
import InventoryOperationsPanel from './InventoryOperationsPanel';

export default function InventoryPanel({ items, refresh, onItemSelected, onItemUpdated, organizationId }) {
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
  const [loading, setLoading] = useState(false);

  // استیت جستجو در انبار
  const [searchQuery, setSearchQuery] = useState('');

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
  const tableColumnCount = 4 + displayedLevels.length + (showCostPrice ? 1 : 0);

  // استیت برای نگهداری شناسه آیتم‌های انتخاب‌شده
  const [selectedIds, setSelectedIds] = useState(new Set());

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
      if (editingId !== null) {
        event.preventDefault();
        setEditingId(null);
      }
    };
    window.addEventListener('app-escape', handleAppEscape);
    return () => window.removeEventListener('app-escape', handleAppEscape);
  }, [editingId]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    const stockQuantity = initialQuantity === '' ? 0 : Number(initialQuantity);
    if (!Number.isFinite(stockQuantity) || stockQuantity < 0
      || (initialQuantity.split('.')[1] || '').length > 3) {
      alert('موجودی اولیه باید عددی نامنفی با حداکثر سه رقم اعشار باشد.');
      return;
    }
    const purchaseCost = baseCost === '' ? 0 : Number(baseCost);
    if (!Number.isSafeInteger(purchaseCost) || purchaseCost < 0) {
      alert('قیمت خرید باید عدد صحیح و نامنفی باشد.');
      return;
    }
    if (stockQuantity > 0 && warehousesLoading) {
      alert('فهرست انبارها هنوز دریافت نشده است؛ کمی صبر کنید و دوباره ثبت کنید.');
      return;
    }
    const initialWarehouse = warehouses.find(
      (warehouse) => String(warehouse.id) === String(initialWarehouseId),
    );
    if (stockQuantity > 0 && !initialWarehouse) {
      alert(warehouseError || 'برای ثبت موجودی اولیه، یک انبار معتبر انتخاب کنید.');
      return;
    }

    setLoading(true);
    let itemWasCreated = false;
    try {
      const { data, error } = await insertRows('inventory', [{
        title: title.trim(),
        item_type: itemType,
        base_cost: purchaseCost,
        price_level1: price1 === '' ? 0 : parseFloat(price1),
        price_level2: price2 === '' ? 0 : parseFloat(price2),
        price_level3: price3 === '' ? 0 : parseFloat(price3)
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
    } catch (err) {
      console.error(itemWasCreated ? 'خطا در ثبت موجودی اولیه:' : 'خطا در ثبت کالا:', err.message);
      if (itemWasCreated) {
        window.dispatchEvent(new Event('inventory-data-updated'));
        await refresh();
      }
      alert(`${itemWasCreated ? 'کالا ثبت شد، اما ' : 'خطا در ثبت کالا: '}${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('آیا از حذف این آیتم اطمینان دارید؟')) return;
    try {
      const { error } = await deleteRows('inventory', [{ column: 'id', operator: 'eq', value: id }]);
      if (error) throw error;
      refresh();
    } catch (err) {
      console.error('خطا در حذف:', err.message);
      alert('خطا در حذف: ' + err.message);
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
      price_level3: item.price_level3 ?? ''
    });
  };

  const handleInlineSave = async (id) => {
    if (!editForm.title.trim()) {
      alert('نام کالا یا خدمت را وارد کنید.');
      return;
    }

    try {
      const updatedData = {
        title: editForm.title.trim(),
        item_type: editForm.item_type || 'sale',
        base_cost: editForm.base_cost === '' ? 0 : parseFloat(editForm.base_cost),
        price_level1: editForm.price_level1 === '' ? 0 : parseFloat(editForm.price_level1),
        price_level2: editForm.price_level2 === '' ? 0 : parseFloat(editForm.price_level2),
        price_level3: editForm.price_level3 === '' ? 0 : parseFloat(editForm.price_level3)
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
    } catch (err) {
      console.error('خطا در به‌روزرسانی:', err.message);
      alert('خطا در به‌روزرسانی: ' + err.message);
    }
  };

  const handleSelectClick = (item) => {
    if (selectedIds.has(item.id)) return;

    setSelectedIds(prev => {
      const newSet = new Set(prev);
      newSet.add(item.id);
      return newSet;
    });

    if (onItemSelected) {
      onItemSelected(item);
    }
  };

  // فیلتر کردن اقلام انبار بر اساس عبارت جستجو شده
  const filteredItems = items.filter(item => 
    item.title && item.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ padding: '15px', backgroundColor: '#f8fafc', fontSize: '13px', direction: 'rtl' }}>
      <form onSubmit={handleSave} style={{ background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '15px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', alignItems: 'end' }}>
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

      <div style={{ background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 'bold', color: '#334155' }}>لیست اقلام انبار ({formatDisplay(filteredItems.length)} از {formatDisplay(items.length)})</span>
            
            {/* کادر جستجوی محصول */}
            <input 
              type="text" 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              placeholder="🔍 جستجوی نام کالا..." 
              style={{ padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', width: '180px', backgroundColor: '#fff' }}
            />

            {/* دکمه نمایش قیمت خرید، چسبیده به کادر جستجو */}
            <button 
              type="button" 
              onClick={() => setShowCostPrice(!showCostPrice)} 
              style={{ backgroundColor: showCostPrice ? '#0284c7' : '#64748b', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
            >
              {showCostPrice ? "👁️ مخفی کردن قیمت خرید" : "👁️‍🗨️ نمایش قیمت خرید"}
            </button>
          </div>

          <div className="inventory-table-controls" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>💡 دابل‌کلیک برای ویرایش</span>
          </div>
        </div>
        
        <div className="inventory-table-wrap" style={{ overflowX: 'auto' }}>
          <table className={`inventory-table${showCostPrice ? ' has-cost-column' : ''}`} style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                <th className="inventory-col-index" style={{ padding: '8px 10px' }}>ردیف</th>
                <th className="inventory-col-title" style={{ padding: '8px 10px' }}>عنوان کالا / خدمت</th>
                <th className="inventory-col-type" style={{ padding: '8px 10px' }}>نوع کالا</th>
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
                  <td colSpan={tableColumnCount} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                    {items.length === 0 ? 'هیچ کالایی در انبار ثبت نشده است.' : 'نتیجه‌ای برای جستجوی شما یافت نشد.'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, index) => {
                  const isEditing = editingId === item.id;
                  const isSelected = selectedIds.has(item.id);
                  const currentType = item.item_type || 'sale';

                  return (
                    <tr 
                      key={item.id} 
                      onClick={() => !isEditing && handleSelectClick(item)}
                      style={{ 
                        borderBottom: '1px solid #f1f5f9', 
                        backgroundColor: isEditing ? '#fefce8' : isSelected ? '#f0fdf4' : 'transparent', 
                        cursor: 'pointer' 
                      }}
                      title="کلیک برای افزودن به فاکتور"
                    >
                      <td className="inventory-col-index" style={{ padding: '8px 10px', color: isSelected ? '#15803d' : '#64748b', fontWeight: isSelected ? 'bold' : 'normal' }}>
                        {isSelected ? '✓' : formatDisplay(index + 1)}
                      </td>
                      
                      <td className="inventory-col-title" onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClick(item); }} style={{ padding: '8px 10px', fontWeight: '500', color: '#1e293b' }}>
                        {isEditing ? (
                          <input type="text" value={editForm.title} onChange={(e) => setEditForm({...editForm, title: e.target.value})} style={{ width: '100%', padding: '3px 5px', fontSize: '12px', border: '1px solid #0ea5e9', borderRadius: '3px' }} />
                        ) : (
                          item.title
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
                            <button type="button" className="inventory-action-button save" onClick={() => handleInlineSave(item.id)}>ذخیره</button>
                            <button type="button" className="inventory-action-button cancel" onClick={() => setEditingId(null)}>لغو</button>
                          </div>
                        ) : (
                          <div className="inventory-row-actions">
                            <button type="button" className="inventory-action-button save" onClick={() => handleDoubleClick(item)}>ویرایش</button>
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
      </div>
      <InventoryOperationsPanel
        items={items}
        organizationId={organizationId}
        refreshInventory={refresh}
      />
    </div>
  );
}
