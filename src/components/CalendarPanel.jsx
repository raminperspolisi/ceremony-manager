import React, { useMemo, useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import moment from "jalali-moment";

// تابع نرمال‌سازی تاریخ شمسی
export function normalizeJalaliDate(input) {
  if (input === null || input === undefined || input === "") return "";
  if (input instanceof Date && !isNaN(input)) {
    return moment(input).locale("fa").format("YYYY/MM/DD");
  }
  let s = String(input).trim();
  s = s.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  s = s.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  s = s.replace(/[\/\-\.،,\s]+/g, "/").replace(/^\/+|\/+$/g, "");

  if (/^\d{8}$/.test(s)) s = `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6, 8)}`;
  if (/^\d{6}$/.test(s)) s = `${s.slice(0, 2)}/${s.slice(2, 4)}/${s.slice(4, 6)}`;

  const parts = s.split("/").filter(Boolean);
  if (parts.length === 3) {
    let [y, m, d] = parts.map((p) => p.replace(/\D/g, ""));
    if (y.length === 2) y = `13${y}`;
    if (y.length === 3) y = `1${y}`;
    y = String(Math.min(Math.max(parseInt(y || "0", 10), 1300), 1500));
    m = String(Math.min(Math.max(parseInt(m || "1", 10), 1), 12)).padStart(2, "0");
    d = String(Math.min(Math.max(parseInt(d || "1", 10), 1), 31)).padStart(2, "0");
    return `${y}/${m}/${d}`;
  }
  return "";
}

export function jalaliToGregorianISO(jy, jm, jd) {
  jy = parseInt(jy, 10);
  jm = parseInt(jm, 10);
  jd = parseInt(jd, 10);
  if (!jy || !jm || !jd) return null;
  try {
    return moment(`${jy}/${jm}/${jd}`, "jYYYY/jM/jD").format("YYYY-MM-DD");
  } catch (e) {
    return null;
  }
}

export function gregorianISOToJalali(iso) {
  if (!iso) return "";
  try {
    return moment(iso).locale("fa").format("YYYY/MM/DD");
  } catch (e) {
    return "";
  }
}

const JMONTHS = [
  "فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور",
  "مهر","آبان","آذر","دی","بهمن","اسفند",
];
const JWEEKDAYS = ["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنج‌شنبه","جمعه"];

export default function CalendarPanel() {
  const todayJ = moment().locale("fa");
  const [jYear, setJYear] = useState(todayJ.jYear());
  const [jMonth, setJMonth] = useState(todayJ.jMonth() + 1);
  const [selectedDay, setSelectedDay] = useState(gregorianISOToJalali(moment().format("YYYY-MM-DD")));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerListOpen, setIsCustomerListOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const emptyForm = {
    customer_id: "",
    customer_name: "",
    customer_phone: "",
    event_type: "مهمانی",
    event_date: "",
    guest_count: "",
    total_cost: "",
    advance_payment: "",
    paid_amount: "",
    status: "برنامه‌ریزی شده",
    location: "",
    notes: "", // نام درست ستون در دیتابیس
  };
  const [form, setForm] = useState(emptyForm);

  const filteredCustomers = useMemo(() => {
    const normalize = (value) => String(value ?? "")
      .replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
      .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
      .toLowerCase()
      .trim();
    const query = normalize(customerSearch);
    if (!query) return [];

    return customers.filter((customer) =>
      normalize(customer["Full name"]).includes(query) ||
      normalize(customer.phone).includes(query)
    );
  }, [customers, customerSearch]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: err } = await supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: true });
      if (err) throw err;
      setEvents(data || []);
    } catch (e) {
      setError("خطا در بارگذاری اطلاعات: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const fetchCustomers = useCallback(async () => {
    try {
      const { data, error: err } = await supabase.from("customers").select("id, \"Full name\", phone");
      if (err) throw err;
      setCustomers(data || []);
    } catch (e) {
      // خاموش
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // کلیک روی تقویم گرافیکی برای انتخاب تاریخ فرم
  const handleDayClick = useCallback((dayStr) => {
    if (!dayStr) return;
    const normalized = normalizeJalaliDate(dayStr);
    if (!normalized) return;
    setSelectedDay(normalized);
    setEditingId(null);
    setShowForm(true);
    setForm((f) => ({
      ...f,
      event_date: normalized,
    }));
    setError("");
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.customer_id && !form.customer_name) {
      setError("لطفاً مشتری را انتخاب یا وارد کنید.");
      return;
    }
    if (!form.event_date) {
      setError("لطفاً تاریخ مراسم را تعیین کنید.");
      return;
    }
    setSaving(true);
    try {
      const normalizedJalali = normalizeJalaliDate(form.event_date);
      const [jy, jm, jd] = normalizedJalali.split("/").map((x) => parseInt(x, 10));
      const iso = jalaliToGregorianISO(jy, jm, jd);

      const payload = {
        customer_id: form.customer_id || null,
        customer_name: form.customer_name || null,
        customer_phone: form.customer_phone || null,
        event_type: form.event_type || null,
        event_date: iso,
        guest_count: form.guest_count === "" ? null : Number(form.guest_count),
        total_cost: form.total_cost === "" ? null : Number(form.total_cost),
        advance_payment: form.advance_payment === "" ? null : Number(form.advance_payment),
        paid_amount: form.paid_amount === "" ? null : Number(form.paid_amount),
        status: form.status || null,
        location: form.location || null,
        notes: form.notes || null, // استفاده از ستون صحیح notes (جمع)
      };

      let res;
      if (editingId) {
        res = await supabase.from("events").update(payload).eq("id", editingId).select();
      } else {
        res = await supabase.from("events").insert([payload]).select();
      }
      if (res.error) throw res.error;

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      setCustomerSearch("");
      setIsCustomerListOpen(false);
      await fetchEvents();
    } catch (err) {
      setError("خطا در ذخیره: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // محاسبات روزهای ماه برای تقویم گرافیکی
  const daysInMonth = useMemo(() => {
    const startMom = moment(`${jYear}/${jMonth}/1`, "jYYYY/jM/jD");
    const startWeekDay = startMom.day(); // 0 شنبه تا 6 جمعه در jalali-moment یا برعکس
    // محاسبه دقیق روزهای هفته شمسی
    let jsDay = (startMom.day() + 1) % 7; // شنبه = 0
    const totalDays = jMonth <= 6 ? 31 : jMonth <= 11 ? 30 : (moment.jIsLeapYear && moment.jIsLeapYear(jYear) ? 30 : 29);
    
    const list = [];
    for (let i = 0; i < jsDay; i++) list.push(null);
    for (let d = 1; d <= totalDays; d++) {
      list.push(`${jYear}/${String(jMonth).padStart(2, "0")}/${String(d).padStart(2, "0")}`);
    }
    return list;
  }, [jYear, jMonth]);

  const eventsByJalaliDate = useMemo(() => {
    return events.reduce((grouped, event) => {
      if (!event.event_date) return grouped;

      const rawDate = String(event.event_date).trim()
        .replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
        .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit));
      const eventDate = /^(13|14)\d{2}[/-]/.test(rawDate)
        ? normalizeJalaliDate(rawDate)
        : gregorianISOToJalali(rawDate);
      if (!eventDate) return grouped;

      (grouped[eventDate] ||= []).push(event);
      return grouped;
    }, {});
  }, [events]);

  return (
    <div style={{ padding: 20, direction: "rtl", fontFamily: "Tahoma, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>تقویم رویدادها</h2>

      {error && (
        <div style={{ background: "#fee2e2", color: "#b91c1c", padding: 10, borderRadius: 6, marginBottom: 15 }}>
          {error}
        </div>
      )}

      {/* فرم ثبت رویداد */}
      <form onSubmit={handleSave} style={{ background: "#f9fafb", padding: 20, borderRadius: 8, marginBottom: 20, border: "1px solid #e5e7eb" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15, marginBottom: 15 }}>
          <div>
            <label style={{ display: "block", marginBottom: 5, fontSize: 13 }}>نام مشتری</label>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={customerSearch}
                onFocus={() => setIsCustomerListOpen(true)}
                onChange={(e) => {
                  const value = e.target.value;
                  setCustomerSearch(value);
                  setForm({ ...form, customer_id: "", customer_name: value, customer_phone: "" });
                  setIsCustomerListOpen(true);
                }}
                placeholder="نام یا شماره تماس مشتری..."
                autoComplete="off"
                role="combobox"
                aria-expanded={isCustomerListOpen && filteredCustomers.length > 0}
                aria-controls="calendar-customer-options"
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db", boxSizing: "border-box" }}
              />
              {isCustomerListOpen && customerSearch.trim() && (
                <div
                  id="calendar-customer-options"
                  role="listbox"
                  style={{ position: "absolute", zIndex: 10, top: "100%", right: 0, left: 0, maxHeight: 220, overflowY: "auto", background: "#fff", border: "1px solid #d1d5db", borderRadius: 4, boxShadow: "0 4px 10px rgba(0,0,0,0.1)" }}
                >
                  {filteredCustomers.length ? filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      role="option"
                      aria-selected={String(form.customer_id) === String(customer.id)}
                      onClick={() => {
                        setForm({
                          ...form,
                          customer_id: customer.id,
                          customer_name: customer["Full name"] || "",
                          customer_phone: customer.phone || "",
                        });
                        setCustomerSearch(customer["Full name"] || customer.phone || "");
                        setIsCustomerListOpen(false);
                      }}
                      style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "9px 10px", border: 0, borderBottom: "1px solid #f1f5f9", background: "#fff", textAlign: "right", cursor: "pointer" }}
                    >
                      <span>{customer["Full name"] || "بدون نام"}</span>
                      <span style={{ color: "#64748b" }}>{customer.phone || "بدون شماره"}</span>
                    </button>
                  )) : (
                    <div style={{ padding: 10, color: "#64748b", fontSize: 12 }}>
                      مشتری‌ای با این نام یا شماره پیدا نشد؛ می‌توانید نام را به‌صورت دستی وارد کنید.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 5, fontSize: 13 }}>نوع مراسم</label>
            <select
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value })}
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
            >
              <option value="مهمانی">مهمانی</option>
              <option value="جشن تولد">جشن تولد</option>
              <option value="عروسی">عروسی</option>
              <option value="عقد">عقد</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15, marginBottom: 15 }}>
          <div>
            <label style={{ display: "block", marginBottom: 5, fontSize: 13 }}>تاریخ مراسم</label>
            <input
              type="text"
              value={form.event_date}
              onChange={(e) => setForm({ ...form, event_date: e.target.value })}
              placeholder="1404/05/10"
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 5, fontSize: 13 }}>توضیح (اختیاری)</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="توضیحات..."
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{ background: "#065f46", color: "#fff", padding: "10.px 20px", border: "none", borderRadius: 6, cursor: "pointer", width: "100%", fontWeight: "bold" }}
        >
          {saving ? "در حال ثبت..." : "ثبت رویداد"}
        </button>
      </form>

      {/* ناوبری ماه تقویم */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 15, marginBottom: 15 }}>
        <button
          onClick={() => {
            if (jMonth === 1) { setJYear(jYear - 1); setJMonth(12); }
            else { setJMonth(jMonth - 1); }
          }}
          style={{ padding: "5px 12px", cursor: "pointer" }}
        >
          قبلی ←
        </button>
        <span style={{ fontWeight: "bold", fontSize: 16 }}>{JMONTHS[jMonth - 1]} {jYear}</span>
        <button
          onClick={() => {
            if (jMonth === 12) { setJYear(jYear + 1); setJMonth(1); }
            else { setJMonth(jMonth + 1); }
          }}
          style={{ padding: "5px 12px", cursor: "pointer" }}
        >
          → بعدی
        </button>
      </div>

      {/* جدول تقویم ماهانه */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
        {JWEEKDAYS.map((w) => (
          <div key={w} style={{ textAlign: "center", fontWeight: "bold", padding: 8, background: "#e5e7eb", borderRadius: 4, fontSize: 13 }}>
            {w}
          </div>
        ))}
        {daysInMonth.map((d, idx) => {
          if (!d) return <div key={`empty-${idx}`} />;
          const dayNum = d.split("/")[2];
          const isSelected = selectedDay === d;
          const dayEvents = eventsByJalaliDate[d] || [];
          return (
            <div
              key={d}
              onClick={() => handleDayClick(d)}
              style={{
                border: isSelected ? "2px solid #065f46" : "1px solid #d1d5db",
                borderRadius: 6,
                minHeight: 70,
                padding: 6,
                cursor: "pointer",
                background: isSelected ? "#ecfdf5" : dayEvents.length ? "#f0fdf4" : "#fff",
                transition: "all 0.2s",
              }}
            >
              <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 4 }}>{parseInt(dayNum, 10)}</div>
              {dayEvents.slice(0, 2).map((event) => {
                const customer = customers.find((item) => String(item.id) === String(event.customer_id));
                const customerName = event.customer_name || customer?.["Full name"] || "مشتری";
                return (
                  <div
                    key={event.id}
                    title={`${event.event_type || "مراسم"} - ${customerName}`}
                    style={{ marginTop: 3, padding: "2px 4px", overflow: "hidden", borderRadius: 4, background: "#dcfce7", color: "#166534", fontSize: 10, lineHeight: 1.5, textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {event.event_type || "مراسم"}: {customerName}
                  </div>
                );
              })}
              {dayEvents.length > 2 && (
                <div style={{ marginTop: 2, color: "#15803d", fontSize: 10 }}>+{dayEvents.length - 2} مراسم دیگر</div>
              )}
            </div>
          );
        })}
      </div>
      {loading && <p style={{ marginTop: 12, textAlign: "center", color: "#64748b", fontSize: 12 }}>در حال بارگذاری مراسم‌ها...</p>}
    </div>
  );
}
