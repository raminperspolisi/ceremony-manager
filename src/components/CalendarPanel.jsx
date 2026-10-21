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

const getInvoiceItemPrice = (item) => {
  const level = String(item.price_level || "1");
  if (level === "2") return Number(item.p2 || 0);
  if (level === "3") return Number(item.p3 || 0);
  return Number(item.p1 ?? item.unit_price ?? item.price ?? 0);
};

export default function CalendarPanel() {
  const todayJ = moment().locale("fa");
  const [jYear, setJYear] = useState(todayJ.jYear());
  const [jMonth, setJMonth] = useState(todayJ.jMonth() + 1);
  const [selectedDay, setSelectedDay] = useState(gregorianISOToJalali(moment().format("YYYY-MM-DD")));
  const [events, setEvents] = useState([]);
  const [invoices, setInvoices] = useState([]);
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

  const fetchInvoices = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from("invoices")
        .select("*")
        .not("ceremony_date", "is", null);
      if (err) throw err;
      setInvoices(data || []);
    } catch (err) {
      setError((currentError) => currentError || "خطا در بارگذاری تاریخ مراسم فاکتورهای رسمی: " + err.message);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
    const invoiceSubscription = supabase
      .channel("calendar-invoice-dates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        fetchInvoices,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(invoiceSubscription);
    };
  }, [fetchInvoices]);

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
    const datedEvents = events.map((event) => ({ ...event, calendarKind: "event" }));
    const datedInvoices = invoices.map((invoice) => ({
      ...invoice,
      id: `invoice-${invoice.id}`,
      event_date: invoice.ceremony_date,
      event_type: "فاکتور رسمی",
      calendarKind: "invoice",
      total_cost: invoice.total_price,
    }));

    return [...datedEvents, ...datedInvoices].reduce((grouped, event) => {
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
  }, [events, invoices]);

  const selectedDayEvents = eventsByJalaliDate[selectedDay] || [];

  return (
    <div className="calendar-panel">
      <div className="calendar-page-heading">
        <div>
          <span className="calendar-eyebrow">برنامه‌ریزی و پیگیری</span>
          <h2>تقویم مراسم‌ها</h2>
          <p>مراسم‌های ثبت‌شده و تاریخ مراسم فاکتورهای رسمی را یکجا ببینید.</p>
        </div>
        <div className="calendar-month-badge">{JMONTHS[jMonth - 1]} {jYear.toLocaleString("fa-IR")}</div>
      </div>

      {error && (
        <div className="calendar-error" role="alert">
          {error}
        </div>
      )}

      {/* فرم ثبت رویداد */}
      <form onSubmit={handleSave} className="calendar-form">
        <div className="calendar-form-grid">
          <div className="calendar-field">
            <label>نام مشتری</label>
            <div style={{ position: "relative" }}>
              <input
                className="calendar-input"
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
              />
              {isCustomerListOpen && customerSearch.trim() && (
                <div
                  id="calendar-customer-options"
                  role="listbox"
                  className="calendar-customer-options"
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
                      className="calendar-customer-option"
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
          <div className="calendar-field">
            <label>نوع مراسم</label>
            <select
              className="calendar-input"
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value })}
            >
              <option value="مهمانی">مهمانی</option>
              <option value="جشن تولد">جشن تولد</option>
              <option value="عروسی">عروسی</option>
              <option value="عقد">عقد</option>
            </select>
          </div>
        </div>

        <div className="calendar-form-grid">
          <div className="calendar-field">
            <label>تاریخ مراسم</label>
            <input
              className="calendar-input calendar-date-input"
              type="text"
              value={form.event_date}
              onChange={(e) => setForm({ ...form, event_date: e.target.value })}
              placeholder="مثلاً ۱۴۰۵/۰۲/۱۰"
              inputMode="numeric"
              aria-label="تاریخ مراسم به شمسی"
            />
            <small>تاریخ شمسی را وارد کنید یا یک روز را از تقویم انتخاب کنید.</small>
          </div>
          <div className="calendar-field">
            <label>توضیح (اختیاری)</label>
            <input
              className="calendar-input"
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="توضیحات..."
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="calendar-save-button"
        >
          {saving ? "در حال ثبت..." : "ثبت رویداد"}
        </button>
      </form>

      {/* ناوبری ماه تقویم */}
      <div className="calendar-month-nav">
        <button
          type="button"
          onClick={() => {
            if (jMonth === 1) { setJYear(jYear - 1); setJMonth(12); }
            else { setJMonth(jMonth - 1); }
          }}
        >
          قبلی ←
        </button>
        <span>{JMONTHS[jMonth - 1]} {jYear.toLocaleString("fa-IR")}</span>
        <button
          type="button"
          onClick={() => {
            if (jMonth === 12) { setJYear(jYear + 1); setJMonth(1); }
            else { setJMonth(jMonth + 1); }
          }}
        >
          → بعدی
        </button>
      </div>

      {/* جدول تقویم ماهانه */}
      <div className="calendar-grid">
        {JWEEKDAYS.map((w) => (
          <div className="calendar-weekday" key={w}>
            {w}
          </div>
        ))}
        {daysInMonth.map((d, idx) => {
          if (!d) return <div key={`empty-${idx}`} />;
          const dayNum = d.split("/")[2];
          const isSelected = selectedDay === d;
          const dayEvents = eventsByJalaliDate[d] || [];
          return (
            <button
              type="button"
              key={d}
              onClick={() => handleDayClick(d)}
              className={`calendar-day${isSelected ? " selected" : ""}${dayEvents.length ? " has-events" : ""}`}
              aria-label={`${parseInt(dayNum, 10)} ${JMONTHS[jMonth - 1]}، ${dayEvents.length} مراسم`}
            >
              <div className="calendar-day-number">{parseInt(dayNum, 10).toLocaleString("fa-IR")}</div>
              {dayEvents.slice(0, 2).map((event) => {
                const customer = customers.find((item) => String(item.id) === String(event.customer_id));
                const customerName = event.customer_name || customer?.["Full name"] || "مشتری";
                return (
                  <span
                    key={event.id}
                    title={`${event.event_type || "مراسم"} - ${customerName}`}
                    className={`calendar-event-chip${event.calendarKind === "invoice" ? " invoice" : ""}`}
                  >
                    {event.calendarKind === "invoice" ? "فاکتور" : event.event_type || "مراسم"}: {customerName}
                  </span>
                );
              })}
              {dayEvents.length > 2 && (
                <span className="calendar-more-events">+{(dayEvents.length - 2).toLocaleString("fa-IR")} مورد دیگر</span>
              )}
            </button>
          );
        })}
      </div>
      {selectedDayEvents.length > 0 && (
        <section className="calendar-day-details">
          <div className="calendar-day-details-heading">
            <div>
              <span className="calendar-eyebrow">برنامهٔ روز انتخاب‌شده</span>
              <h3>{selectedDay.replace(/\d+/g, (digit) => Number(digit).toLocaleString("fa-IR"))} {JMONTHS[jMonth - 1]} {jYear.toLocaleString("fa-IR")}</h3>
            </div>
            <span className="calendar-day-count">{selectedDayEvents.length.toLocaleString("fa-IR")} مورد</span>
          </div>
          <div className="calendar-day-event-list">
            {selectedDayEvents.map((event) => {
              const isInvoice = event.calendarKind === "invoice";
              const eventItems = [event.items_data, event.items_json, event.items]
                .find((items) => Array.isArray(items) && items.length > 0) || [];
              return (
                <article className={`calendar-day-event-card${isInvoice ? " invoice" : ""}`} key={`${event.calendarKind}-${event.id}`}>
                  <div className="calendar-day-event-title">
                    <strong>{event.customer_name || "مشتری ثبت‌نشده"}</strong>
                    <span>{isInvoice ? "فاکتور رسمی" : event.event_type || "مراسم"}</span>
                  </div>
                  <div className="calendar-day-event-meta">
                    {event.customer_phone && <span>تماس: {event.customer_phone}</span>}
                    {isInvoice && <span>مبلغ فاکتور: {Number(event.total_price || 0).toLocaleString("fa-IR")} تومان</span>}
                    {isInvoice && <span>پرداخت‌شده: {Number(event.paid_amount || 0).toLocaleString("fa-IR")} تومان</span>}
                    {!isInvoice && event.location && <span>محل: {event.location}</span>}
                    {!isInvoice && event.guest_count && <span>تعداد مهمان: {Number(event.guest_count).toLocaleString("fa-IR")}</span>}
                    {!isInvoice && event.notes && <span>توضیح: {event.notes}</span>}
                  </div>
                  {isInvoice && eventItems.length > 0 && (
                    <div className="calendar-invoice-items">
                      {eventItems.map((item, index) => {
                        const quantity = Number(item.qty || item.quantity || item.requestedQuantity || 1);
                        const unitPrice = getInvoiceItemPrice(item);
                        return (
                          <span key={`${event.id}-item-${index}`}>
                            {item.title || item.item_name || item.name || "قلم"} × {quantity.toLocaleString("fa-IR")}
                            {" · "}{(quantity * unitPrice).toLocaleString("fa-IR")} تومان
                          </span>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
      {loading && <p style={{ marginTop: 12, textAlign: "center", color: "#64748b", fontSize: 12 }}>در حال بارگذاری مراسم‌ها...</p>}
    </div>
  );
}
