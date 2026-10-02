// src/components/InventoryPanel.jsx
import React, { useState, useEffect } from 'react';
import { styles } from "../styles";
import { supabase } from '../supabaseClient';

export default function InventoryPanel({ onItemSelected }) {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showBaseCost, setShowBaseCost] = useState(true);

  const [colWidths, setColWidths] = useState({
    op: 80, select: 50, title: 200, base: 120, l1: 120, l2: 120, l3: 120
  });

  const [formData, setFormData] = useState({
    title: '', base_cost: '', price_level1: '', price_level2: '', price_level3: ''
  });

  const sanitizeInput = (val) => {
    return (val === '' || val === undefined || val === null) ? null : Number(val);
  };

  useEffect(() => { fetchItems(); }, []);

  async function fetchItems() {
    const { data } = await supabase.from('inventory').select('*').order('created_at', { ascending: false });
    if (data) setItems(data);
  }

  const startResizing = (colName, e) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = colWidths[colName];
    const onMouseMove = (moveEvent) => {
      const diff = moveEvent.pageX - startX;
      setColWidths(prev => ({ ...prev, [colName]: Math.max(50, startWidth + diff) }));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // اصلاح شده: حذف 1fr برای جلوگیری از کشیدگی بی‌مورد ستون
  const gridTemplate = `${colWidths.op}px ${colWidths.select}px ${colWidths.title}px ${colWidths.base}px ${colWidths.l1}px ${colWidths.l2}px ${colWidths.l3}px`;

  const handleAdd = async () => {
    if (!formData.title) return;
    
    const dataToInsert = {
      title: formData.title,
      base_cost: sanitizeInput(formData.base_cost),
      price_level1: sanitizeInput(formData.price_level1),
      price_level2: sanitizeInput(formData.price_level2),
      price_level3: sanitizeInput(formData.price_level3),
    };

    const { error } = await supabase.from('inventory').insert([dataToInsert]);
    if (error) alert(error.message);
    else {
      setFormData({ title: '', base_cost: '', price_level1: '', price_level2: '', price_level3: '' });
      fetchItems();
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("آیا مطمئن هستید؟")) return;
    const { error } = await supabase.from('inventory').delete().eq('id', id);
    if (error) alert(error.message);
    else fetchItems();
  };

  const handleInlineChange = (id, field, value) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const updateSingleItem = async (item) => {
    setIsSaving(true);
    
    const updatePayload = {
      base_cost: sanitizeInput(item.base_cost),
      price_level1: sanitizeInput(item.price_level1),
      price_level2: sanitizeInput(item.price_level2),
      price_level3: sanitizeInput(item.price_level3),
    };

    await supabase.from('inventory').update(updatePayload).eq('id', item.id);
    setIsSaving(false);
  };

  const headerLabels = ['عملیات', 'انتخاب', 'نام کالا', 'قیمت خرید', 'درجه ۱', 'درجه ۲', 'درجه ۳'];
  const colKeys = ['op', 'select', 'title', 'base', 'l1', 'l2', 'l3'];

  return (
    <div style={{ ...styles.card, width: "100%", direction: "rtl", fontFamily: 'IRANSans, Tahoma, sans-serif' }}>
      <h3 style={{ textAlign: 'center', marginBottom: '15px' }}>مدیریت موجودی انبار</h3>

      <div style={{ overflowX: 'auto', border: '1px solid #ddd' }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, minWidth: 'max-content', alignItems: 'center' }}>
          
          <div style={{ gridColumn: "1 / -1", padding: "10px", backgroundColor: "#f9f9f9", borderBottom: "1px solid #ccc", display: "flex", gap: "10px", alignItems: "center" }}>
            <input placeholder="جستجوی سریع..." style={{...styles.input, flex: 1, padding: "5px"}} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <label style={{ fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={showBaseCost} onChange={() => setShowBaseCost(!showBaseCost)} />
              نمایش خرید
            </label>
          </div>

          {headerLabels.map((label, i) => (
            <div key={label} style={{ position: 'relative', backgroundColor: "#f2f2f2", borderBottom: "2px solid #ccc", padding: "8px", fontWeight: 'bold', fontSize: '13px', textAlign: 'center' }}>
              {label}
              <div onMouseDown={(e) => startResizing(colKeys[i], e)} style={{ position: 'absolute', right: 0, top: 0, width: '10px', height: '100%', cursor: 'col-resize', zIndex: 1 }} />
            </div>
          ))}

          <div style={{ padding: "5px" }}></div>
          <div style={{ padding: "5px" }}></div>
          <div style={{ padding: "5px" }}><input style={{...styles.input, width: '90%'}} placeholder="نام..." value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} /></div>
          <div style={{ padding: "5px" }}><input style={{...styles.input, width: '90%'}} type="number" placeholder="خرید" value={formData.base_cost} onChange={(e) => setFormData({...formData, base_cost: e.target.value})} /></div>
          <div style={{ padding: "5px" }}><input style={{...styles.input, width: '90%'}} type="number" placeholder="درجه ۱" value={formData.price_level1} onChange={(e) => setFormData({...formData, price_level1: e.target.value})} /></div>
          <div style={{ padding: "5px" }}><input style={{...styles.input, width: '90%'}} type="number" placeholder="درجه ۲" value={formData.price_level2} onChange={(e) => setFormData({...formData, price_level2: e.target.value})} /></div>
          <div style={{ padding: "5px" }}><button onClick={handleAdd} style={{ ...styles.button, backgroundColor: '#28a745', padding: '5px 10px', width: '100%' }}>➕</button></div>

          {items.filter(item => item.title.toLowerCase().includes(searchTerm.toLowerCase())).map((item) => (
            <React.Fragment key={item.id}>
              <div style={{ borderBottom: "1px solid #eee", padding: "5px", textAlign: 'center' }}><button onClick={() => handleDelete(item.id)}>حذف</button></div>
              <div style={{ borderBottom: "1px solid #eee", padding: "5px", textAlign: 'center' }}><button onClick={() => onItemSelected(item)}>✅</button></div>
              <div style={{ borderBottom: "1px solid #eee", padding: "5px", textAlign: 'right' }}>{item.title}</div>
              
              <div style={{ borderBottom: "1px solid #eee", padding: "5px", textAlign: 'center' }}>
                {showBaseCost ? (
                  <input style={{...styles.input, width: '90%'}} value={item.base_cost === null ? '' : item.base_cost} onChange={(e) => handleInlineChange(item.id, 'base_cost', e.target.value)} onBlur={() => updateSingleItem(item)} />
                ) : (
                  <span style={{ color: '#ccc' }}>***</span>
                )}
              </div>
              
              <div style={{ borderBottom: "1px solid #eee", padding: "5px" }}><input style={{...styles.input, width: '90%'}} value={item.price_level1 === null ? '' : item.price_level1} onChange={(e) => handleInlineChange(item.id, 'price_level1', e.target.value)} onBlur={() => updateSingleItem(item)} /></div>
              <div style={{ borderBottom: "1px solid #eee", padding: "5px" }}><input style={{...styles.input, width: '90%'}} value={item.price_level2 === null ? '' : item.price_level2} onChange={(e) => handleInlineChange(item.id, 'price_level2', e.target.value)} onBlur={() => updateSingleItem(item)} /></div>
              <div style={{ borderBottom: "1px solid #eee", padding: "5px" }}><input style={{...styles.input, width: '90%'}} value={item.price_level3 === null ? '' : item.price_level3} onChange={(e) => handleInlineChange(item.id, 'price_level3', e.target.value)} onBlur={() => updateSingleItem(item)} /></div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
