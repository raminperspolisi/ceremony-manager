import React, { useMemo, useState, useEffect, useCallback } from "react";
import { deleteRows, insertRows, readTable, updateRows } from "../offlineSync";
import { formatPersianDigits } from "../styles";
import { gregorianISOToJalali, jalaliToGregorianISO, normalizeJalaliDate } from "../calendarDateUtils";
import moment from "jalali-moment";

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
  const todayLabel = formatPersianDigits(todayJ.format("dddd jD jMMMM jYYYY"));
  const [jYear, setJYear] = useState(todayJ.jYear());
  const displayYear = formatPersianDigits(jYear);
  const [jMonth, setJMonth] = useState(todayJ.jMonth() + 1);
  const [selectedDay, setSelectedDay] = useState(gregorianISOToJalali(moment().format("YYYY-MM-DD")));
  const [events, setEvents] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerListOpen, setIsCustomerListOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [selectedEventForTasks, setSelectedEventForTasks] = useState(null);
  const [eventTasks, setEventTasks] = useState([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState("");

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
      const { data, error: err } = await readTable("events", { orderBy: "event_date", ascending: true });
      if (err) throw err;
      setEvents(data || []);
    } catch (e) {
      setError("خطا در بارگذاری اطلاعات: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    try {
      const { data, error: err } = await readTable("invoices", {
        filters: [{ column: "ceremony_date", operator: "notNull" }],
      });
      if (err) throw err;
      setInvoices(data || []);
    } catch (err) {
      setError((currentError) => currentError || "خطا در بارگذاری تاریخ مراسم فاکتورهای رسمی: " + err.message);
    }
  }, []);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (navigator.onLine) fetchInvoices();
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [fetchInvoices]);

  const fetchCustomers = useCallback(async () => {
    try {
      const { data, error: err } = await readTable("customers", { columns: 'id, "Full name", phone' });
      if (err) throw err;
      setCustomers(data || []);
    } catch (err) {
      setError((currentError) => currentError || "خطا در بارگذاری مشتریان تقویم: " + err.message);
    }
  }, []);

  const refreshCalendarData = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchEvents(), fetchInvoices(), fetchCustomers()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchEvents, fetchInvoices, fetchCustomers]);

  useEffect(() => {
    refreshCalendarData();
  }, [refreshCalendarData]);

  useEffect(() => {
    const refreshWhenOnline = () => {
      if (navigator.onLine) refreshCalendarData();
    };
    window.addEventListener("online", refreshWhenOnline);
    window.addEventListener("offline-data-updated", refreshCalendarData);
    return () => {
      window.removeEventListener("online", refreshWhenOnline);
      window.removeEventListener("offline-data-updated", refreshCalendarData);
    };
  }, [refreshCalendarData]);

  // کلیک روی تقویم گرافیکی برای انتخاب تاریخ فرم
  const handleDayClick = useCallback((dayStr, hasEvents = false) => {
    if (!dayStr) return;
    const normalized = normalizeJalaliDate(dayStr);
    if (!normalized) return;
    setSelectedDay(normalized);
    setEditingId(null);
    setShowForm(!hasEvents);
    setForm((f) => ({
      ...f,
      event_date: formatPersianDigits(normalized),
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
    const normalizedJalali = normalizeJalaliDate(form.event_date);
    if (!normalizedJalali) {
      setError("تاریخ شمسی معتبر نیست؛ تاریخ را به‌شکل سال/ماه/روز وارد کنید.");
      return;
    }
    setSaving(true);
    try {
      const [jy, jm, jd] = normalizedJalali.split("/").map((x) => parseInt(x, 10));
      const iso = jalaliToGregorianISO(jy, jm, jd);
      if (!iso) throw new Error("تبدیل تاریخ شمسی به میلادی انجام نشد.");

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
        res = await updateRows("events", payload, [{ column: "id", operator: "eq", value: editingId }]);
      } else {
        res = await insertRows("events", [payload]);
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

  const openEventTasks = async (event) => {
    setSelectedEventForTasks(event);
    setEventTasks([]);
    setTaskTitle("");
    setTaskAssignee("");
    setTaskError("");
    setTaskLoading(true);
    try {
      const { data, error: taskFetchError } = await readTable("event_tasks", {
        filters: [{ column: "event_id", operator: "eq", value: event.id }],
        orderBy: "created_at",
        ascending: true,
      });
      if (taskFetchError) throw taskFetchError;
      setEventTasks(data || []);
    } catch (taskFetchError) {
      setTaskError(
        `بارگذاری پرونده ناموفق بود: ${taskFetchError.message}`
        + " برای فعال‌سازی این بخش، migration "
        + "supabase/migrations/20261102090000_event_tasks.sql را در Supabase اجرا کنید.",
      );
    } finally {
      setTaskLoading(false);
    }
  };

  const handleAddTask = async (event) => {
    event.preventDefault();
    const title = taskTitle.trim();
    if (!title || !selectedEventForTasks) return;
    setTaskSaving(true);
    setTaskError("");
    try {
      const { data, error: taskInsertError } = await insertRows("event_tasks", [{
        event_id: selectedEventForTasks.id,
        title,
        assignee: taskAssignee.trim() || null,
        completed: false,
      }]);
      if (taskInsertError) throw taskInsertError;
      setEventTasks((currentTasks) => [...currentTasks, ...(data || [])]);
      setTaskTitle("");
      setTaskAssignee("");
    } catch (taskInsertError) {
      setTaskError(`ثبت کار ناموفق بود: ${taskInsertError.message}`);
    } finally {
      setTaskSaving(false);
    }
  };

  const handleToggleTask = async (task) => {
    try {
      const { error: taskUpdateError } = await updateRows(
        "event_tasks",
        { completed: !task.completed },
        [{ column: "id", operator: "eq", value: task.id }],
      );
      if (taskUpdateError) throw taskUpdateError;
      setEventTasks((currentTasks) => currentTasks.map((currentTask) => (
        String(currentTask.id) === String(task.id)
          ? { ...currentTask, completed: !task.completed }
          : currentTask
      )));
    } catch (taskUpdateError) {
      setTaskError(`به‌روزرسانی وضعیت کار ناموفق بود: ${taskUpdateError.message}`);
    }
  };

  const handleDeleteTask = async (task) => {
    try {
      const { error: taskDeleteError } = await deleteRows(
        "event_tasks",
        [{ column: "id", operator: "eq", value: task.id }],
      );
      if (taskDeleteError) throw taskDeleteError;
      setEventTasks((currentTasks) => currentTasks.filter(
        (currentTask) => String(currentTask.id) !== String(task.id),
      ));
    } catch (taskDeleteError) {
      setTaskError(`حذف کار ناموفق بود: ${taskDeleteError.message}`);
    }
  };

  return (
    <div className="calendar-panel">
      <div className="calendar-page-heading">
        <div>
          <span className="calendar-eyebrow">برنامه‌ریزی و پیگیری</span>
          <h2>تقویم مراسم‌ها</h2>
          <p>مراسم‌های ثبت‌شده و تاریخ مراسم فاکتورهای رسمی را یکجا ببینید.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="calendar-month-badge">امروز: {todayLabel}</div>
          <button type="button" className="refresh-button" onClick={refreshCalendarData} disabled={refreshing}>
            {refreshing ? "در حال بارگذاری..." : "↻ تازه‌سازی"}
          </button>
        </div>
      </div>

      {error && (
        <div className="calendar-error" role="alert">
          {error}
        </div>
      )}

      {/* فرم ثبت رویداد */}
      <form onSubmit={handleSave} className="calendar-form">
        <div className="calendar-form-grid">
          <div className="calendar-field calendar-field-type">
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
          <div className="calendar-field calendar-field-type">
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
          <div className="calendar-field calendar-field-date">
            <label>تاریخ مراسم</label>
            <input
              className="calendar-input calendar-date-input"
              type="text"
              value={form.event_date}
              onChange={(e) => setForm({ ...form, event_date: e.target.value })}
              onBlur={() => {
                const normalized = normalizeJalaliDate(form.event_date);
                if (normalized) setForm((current) => ({ ...current, event_date: formatPersianDigits(normalized) }));
              }}
              placeholder="مثلاً ۱۴۰۵/۰۲/۱۰"
              inputMode="numeric"
              aria-label="تاریخ مراسم به شمسی"
            />
            <small>تاریخ شمسی را وارد کنید یا یک روز را از تقویم انتخاب کنید.</small>
            <button
              type="submit"
              disabled={saving}
              className="calendar-save-button"
            >
              {saving ? "در حال ثبت..." : "ثبت رویداد"}
            </button>
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
        <span>{JMONTHS[jMonth - 1]} {displayYear}</span>
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
          const isToday = jYear === todayJ.jYear() && jMonth === todayJ.jMonth() + 1 && Number(dayNum) === todayJ.jDate();
          const dayEvents = eventsByJalaliDate[d] || [];
          return (
            <button
              type="button"
              key={d}
              onClick={() => {
                handleDayClick(d, dayEvents.length > 0);
                setIsDayModalOpen(dayEvents.length > 0);
              }}
              className={`calendar-day${isSelected ? " selected" : ""}${isToday ? " today" : ""}${dayEvents.length ? " has-events" : ""}`}
              aria-label={`${Number(dayNum).toLocaleString("fa-IR")} ${JMONTHS[jMonth - 1]}، ${dayEvents.length.toLocaleString("fa-IR")} مراسم`}
              aria-current={isToday ? "date" : undefined}
            >
              <div className="calendar-day-number">{parseInt(dayNum, 10).toLocaleString("fa-IR")}</div>
              {dayEvents.length > 0 && (
                <span className="calendar-event-count">
                  {dayEvents.length.toLocaleString("fa-IR")} رویداد
                </span>
              )}
            </button>
          );
        })}
      </div>
      {selectedDayEvents.length > 0 && isDayModalOpen && (
        <div className="calendar-events-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsDayModalOpen(false);
        }}>
        <section className="calendar-day-details calendar-events-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-selected-day-title">
          <div className="calendar-day-details-heading">
            <div>
              <span className="calendar-eyebrow">برنامهٔ روز انتخاب‌شده</span>
              <h3 id="calendar-selected-day-title">{selectedDay.replace(/\d+/g, (digit) => Number(digit).toLocaleString("fa-IR"))} {JMONTHS[jMonth - 1]} {displayYear}</h3>
            </div>
            <div className="calendar-events-heading-actions">
              <span className="calendar-day-count">{selectedDayEvents.length.toLocaleString("fa-IR")} مورد</span>
              <button type="button" className="invoice-details-close" onClick={() => setIsDayModalOpen(false)} aria-label="بستن رویدادها">×</button>
            </div>
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
                    {event.customer_phone && <span>تماس: {formatPersianDigits(event.customer_phone)}</span>}
                    {isInvoice && <span>مبلغ فاکتور: {Number(event.total_price || 0).toLocaleString("fa-IR")} تومان</span>}
                    {isInvoice && <span>پرداخت‌شده: {Number(event.paid_amount || 0).toLocaleString("fa-IR")} تومان</span>}
                    {!isInvoice && event.location && <span>محل: {event.location}</span>}
                    {!isInvoice && event.guest_count && <span>تعداد مهمان: {Number(event.guest_count).toLocaleString("fa-IR")}</span>}
                    {!isInvoice && event.notes && <span>توضیح: {event.notes}</span>}
                  </div>
                  {!isInvoice && (
                    <button
                      type="button"
                      className="calendar-event-tasks-button"
                      onClick={() => openEventTasks(event)}
                    >
                      پروندهٔ اجرایی و چک‌لیست
                    </button>
                  )}
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
        </div>
      )}
      {selectedEventForTasks && (
        <div className="calendar-event-tasks-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedEventForTasks(null);
        }}>
          <section
            className="calendar-event-tasks-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-event-tasks-title"
          >
            <div className="calendar-event-tasks-heading">
              <div>
                <span className="calendar-eyebrow">پروندهٔ اجرایی مراسم</span>
                <h3 id="calendar-event-tasks-title">
                  {selectedEventForTasks.customer_name || "مشتری ثبت‌نشده"} · {selectedEventForTasks.event_type || "مراسم"}
                </h3>
              </div>
              <button
                type="button"
                className="invoice-details-close"
                onClick={() => setSelectedEventForTasks(null)}
                aria-label="بستن پرونده"
              >
                ×
              </button>
            </div>
            <p className="calendar-event-tasks-description">
              کارهای لازم برای این مراسم را ثبت کنید، مسئول هر کار را مشخص کنید و انجام‌شدن آن را پیگیری کنید.
            </p>
            {taskError && <div className="calendar-error" role="alert">{taskError}</div>}
            <form className="calendar-event-task-form" onSubmit={handleAddTask}>
              <label>
                عنوان کار
                <input
                  className="calendar-input"
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  placeholder="مثلاً هماهنگی گل‌آرایی"
                  required
                  maxLength={180}
                />
              </label>
              <label>
                مسئول (اختیاری)
                <input
                  className="calendar-input"
                  value={taskAssignee}
                  onChange={(event) => setTaskAssignee(event.target.value)}
                  placeholder="نام مسئول"
                  maxLength={120}
                />
              </label>
              <button type="submit" className="calendar-save-button" disabled={taskSaving || !taskTitle.trim()}>
                {taskSaving ? "در حال ثبت..." : "افزودن به چک‌لیست"}
              </button>
            </form>
            {taskLoading ? (
              <p className="calendar-event-tasks-empty">در حال بارگذاری کارهای مراسم...</p>
            ) : eventTasks.length ? (
              <ul className="calendar-event-task-list">
                {eventTasks.map((task) => (
                  <li key={task.id} className={task.completed ? "completed" : ""}>
                    <label className="calendar-event-task-check">
                      <input
                        type="checkbox"
                        checked={Boolean(task.completed)}
                        onChange={() => handleToggleTask(task)}
                        aria-label={`وضعیت انجام ${task.title}`}
                      />
                      <span>
                        <strong>{task.title}</strong>
                        {task.assignee && <small>مسئول: {task.assignee}</small>}
                      </span>
                    </label>
                    <button type="button" onClick={() => handleDeleteTask(task)} aria-label={`حذف ${task.title}`}>
                      حذف
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              !taskLoading && <p className="calendar-event-tasks-empty">هنوز کاری برای این مراسم ثبت نشده است.</p>
            )}
          </section>
        </div>
      )}
      {loading && <p style={{ marginTop: 12, textAlign: "center", color: "#64748b", fontSize: 12 }}>در حال بارگذاری مراسم‌ها...</p>}
    </div>
  );
}
