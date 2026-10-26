import React, { useEffect, useState } from 'react';
import { deleteRows, insertRows, updateRows } from '../offlineSync';
import { formatDisplay } from '../styles';
import FormattedNumberInput from './FormattedNumberInput';

export default function InventoryPanel({ items, refresh, onItemSelected, onItemUpdated }) {
  const [title, setTitle] = useState('');
  const [itemType, setItemType] = useState('sale'); // پیش‌فرض: فروشی
  const [baseCost, setBaseCost] = useState('');
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

    setLoading(true);
    try {
      const { error } = await insertRows('inventory', [{
        title: title.trim(),
        item_type: itemType,
        base_cost: baseCost === '' ? 0 : parseFloat(baseCost),
        price_level1: price1 === '' ? 0 : parseFloat(price1),
        price_level2: price2 === '' ? 0 : parseFloat(price2),
        price_level3: price3 === '' ? 0 : parseFloat(price3)
      }]);

      if (error) throw error;

      setTitle('');
      setItemType('sale');
      setBaseCost('');
      setPrice1('');
      setPrice2('');
      setPrice3('');
      refresh();
    } catch (err) {
      console.error('خطا در ثبت کالا:', err.message);
      alert('خطا در ثبت کالا: ' + err.message);
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
    </div>
  );
}
