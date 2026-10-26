import React, { useCallback, useEffect, useMemo, useState } from 'react';
import moment from 'jalali-moment';
import { readTable } from '../offlineSync';

const PERIODS = [
  { value: 'month', label: 'ماه جاری' },
  { value: 'quarter', label: 'سه ماه اخیر' },
  { value: 'year', label: 'سال جاری' },
  { value: 'all', label: 'تمام دوره' },
  { value: 'custom', label: 'بازه دلخواه' },
];

const toISODate = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value).trim()
    .replace(/[۰-۹]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))
    .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit));
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const jalali = text.replace(/[.-]/g, '/');
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(jalali)) {
    const converted = moment(jalali, 'jYYYY/jM/jD', true);
    return converted.isValid() ? converted.format('YYYY-MM-DD') : '';
  }
  return '';
};

const getInvoiceItems = (invoice) => {
  return [invoice.items_data, invoice.items_json, invoice.items]
    .find((items) => Array.isArray(items) && items.length > 0) || [];
};

const getItemPrice = (item) => {
  const level = String(item.price_level || '1');
  if (level === '2') return Number(item.p2 || 0);
  if (level === '3') return Number(item.p3 || 0);
  return Number(item.p1 ?? item.unit_price ?? item.price ?? 0);
};

const getItemUnitCost = (item, quantity) => {
  const unitCost = [item.base_cost, item.cost, item.unit_cost]
    .map(Number)
    .find((cost) => Number.isFinite(cost) && cost > 0);
  if (unitCost !== undefined) return unitCost;

  const totalCost = Number(item.total_cost);
  return Number.isFinite(totalCost) && totalCost > 0 && quantity > 0
    ? totalCost / quantity
    : null;
};

const isRentItem = (item) => ['rent', 'اجاره', 'اجاره‌ای'].includes(item.item_type || item.type);

const formatMoney = (value) => `${Math.round(value || 0).toLocaleString('fa-IR')} تومان`;
const formatDate = (value) => value ? moment(value).locale('fa').format('jYYYY/jMM/jDD') : '—';
const normalizeSearch = (value) => String(value ?? '')
  .replace(/[۰-۹]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))
  .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
  .trim()
  .toLocaleLowerCase('fa-IR');

function getInvoiceBreakdown(invoice) {
  const summary = {
    total: Number(invoice.total_price || invoice.total_amount || 0),
    salesRevenue: 0,
    costedSalesRevenue: 0,
    costOfGoods: 0,
    profit: 0,
    rentRevenue: 0,
    missingCostCount: 0,
    items: [],
  };

  getInvoiceItems(invoice).forEach((item, index) => {
    const quantity = Math.max(Number(item.qty || item.quantity || item.requestedQuantity || 1), 0);
    const unitPrice = getItemPrice(item);
    const unitCost = getItemUnitCost(item, quantity);
    const rent = isRentItem(item);
    const revenue = unitPrice * quantity;
    const cost = !rent && unitCost !== null ? unitCost * quantity : null;
    const profit = !rent && unitCost !== null ? revenue - cost : null;

    if (rent) summary.rentRevenue += revenue;
    else {
      summary.salesRevenue += revenue;
      if (unitCost !== null) {
        summary.costedSalesRevenue += revenue;
        summary.costOfGoods += cost;
        summary.profit += profit;
      } else {
        summary.missingCostCount += 1;
      }
    }

    summary.items.push({
      key: `${invoice.id}-${index}`,
      title: item.title || item.item_name || item.name || 'خدمت نامشخص',
      type: rent ? 'اجاره‌ای' : 'فروشی',
      rent,
      quantity,
      unitPrice,
      unitCost,
      revenue,
      cost,
      profit,
    });
  });

  return summary;
}

function getPeriodBounds(period, customFrom, customTo) {
  const now = moment();
  if (period === 'custom') {
    return { from: customFrom || '', to: customTo || '' };
  }
  if (period === 'all') return { from: '', to: '' };
  if (period === 'year') {
    return {
      from: now.clone().startOf('jYear').format('YYYY-MM-DD'),
      to: now.clone().endOf('jYear').format('YYYY-MM-DD'),
    };
  }
  if (period === 'quarter') {
    return { from: now.clone().subtract(3, 'months').startOf('day').format('YYYY-MM-DD'), to: now.format('YYYY-MM-DD') };
  }
  return { from: now.clone().startOf('jMonth').format('YYYY-MM-DD'), to: now.format('YYYY-MM-DD') };
}

function isInRange(date, from, to) {
  return Boolean(date) && (!from || date >= from) && (!to || date <= to);
}

export default function AnalyticsPanel() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('month');
  const [dateBasis, setDateBasis] = useState('ceremony');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [expandedInvoiceId, setExpandedInvoiceId] = useState(null);
  const fetchAnalyticsData = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
      setError('');
    }
    try {
      const invoiceResult = await readTable('invoices', { orderBy: 'created_at', ascending: false });
      if (invoiceResult.error) throw invoiceResult.error;
      setLoadFailed(false);
      setInvoices(invoiceResult.data || []);
    } catch (err) {
      setLoadFailed(true);
      setError(`بارگذاری اطلاعات تحلیل ناموفق بود: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalyticsData();
    window.addEventListener('offline-data-updated', fetchAnalyticsData);
    return () => window.removeEventListener('offline-data-updated', fetchAnalyticsData);
  }, [fetchAnalyticsData]);

  useEffect(() => {
    const handleAppEscape = (event) => {
      if (expandedInvoiceId === null) return;
      event.preventDefault();
      setExpandedInvoiceId(null);
    };
    window.addEventListener('app-escape', handleAppEscape);
    return () => window.removeEventListener('app-escape', handleAppEscape);
  }, [expandedInvoiceId]);

  const range = useMemo(
    () => getPeriodBounds(period, customFrom, customTo),
    [period, customFrom, customTo],
  );

  const filteredInvoices = useMemo(() => invoices.filter((invoice) => {
    const primaryDate = dateBasis === 'ceremony'
      ? toISODate(invoice.ceremony_date)
      : toISODate(invoice.created_at);
    const effectiveDate = primaryDate || toISODate(invoice.created_at);
    return isInRange(effectiveDate, range.from, range.to);
  }), [dateBasis, invoices, range]);

  const searchedInvoices = useMemo(() => {
    const query = normalizeSearch(invoiceSearch);
    if (!query) return filteredInvoices;
    return filteredInvoices.filter((invoice) => [
      invoice.customer_name,
      invoice.customer_phone,
      invoice.phone,
      invoice.id,
      invoice.invoice_number,
      invoice.invoiceNumber,
      invoice.ceremony_date,
    ].some((value) => normalizeSearch(value).includes(query)));
  }, [filteredInvoices, invoiceSearch]);

  const report = useMemo(() => {
    const result = {
      revenue: 0,
      salesRevenue: 0,
      costedSalesRevenue: 0,
      collected: 0,
      receivables: 0,
      costOfGoods: 0,
      rentRevenue: 0,
      missingCostCount: 0,
      missingItemInvoiceCount: 0,
      items: {},
      months: {},
    };

    filteredInvoices.forEach((invoice) => {
      const invoiceRevenue = Number(invoice.total_price || invoice.total_amount || 0);
      result.revenue += invoiceRevenue;
      const paid = Math.min(Math.max(Number(invoice.paid_amount || 0), 0), invoiceRevenue);
      result.collected += paid;
      result.receivables += Math.max(invoiceRevenue - paid, 0);

      const invoiceDate = dateBasis === 'ceremony'
        ? (toISODate(invoice.ceremony_date) || toISODate(invoice.created_at))
        : toISODate(invoice.created_at);
      const monthKey = invoiceDate ? moment(invoiceDate).locale('fa').format('jYYYY/jMM') : '';
      if (monthKey) {
        if (!result.months[monthKey]) result.months[monthKey] = { salesRevenue: 0, costedSalesRevenue: 0, costs: 0, net: 0 };
      }

      const invoiceItems = getInvoiceItems(invoice);
      if (invoiceItems.length === 0) result.missingItemInvoiceCount += 1;
      invoiceItems.forEach((item) => {
        const name = String(item.title || item.item_name || item.name || 'خدمت نامشخص').trim();
        const quantity = Math.max(Number(item.qty || item.quantity || item.requestedQuantity || 1), 0);
        const price = getItemPrice(item);
        const isRent = isRentItem(item);
        const unitCost = getItemUnitCost(item, quantity);
        const revenue = price * quantity;

        if (isRent) result.rentRevenue += revenue;
        else {
          result.salesRevenue += revenue;
          if (monthKey) result.months[monthKey].salesRevenue += revenue;
          if (unitCost !== null) {
            result.costedSalesRevenue += revenue;
            if (monthKey) result.months[monthKey].costedSalesRevenue += revenue;
            const cost = unitCost * quantity;
            result.costOfGoods += cost;
            if (monthKey) result.months[monthKey].costs += cost;
          } else {
            result.missingCostCount += 1;
          }
        }

        const itemKey = `${isRent ? 'rent' : 'sale'}:${name}`;
        if (!result.items[itemKey]) result.items[itemKey] = { key: itemKey, name, quantity: 0, revenue: 0, profit: 0, isRent, hasUnknownCost: false };
        result.items[itemKey].quantity += quantity;
        result.items[itemKey].revenue += revenue;
        if (isRent) {
          result.items[itemKey].profit += 0;
        } else if (unitCost !== null) {
          result.items[itemKey].profit += (price - unitCost) * quantity;
        } else {
          result.items[itemKey].hasUnknownCost = true;
        }
      });
    });

    Object.values(result.months).forEach((month) => {
      month.net = month.costedSalesRevenue - month.costs;
    });
    return result;
  }, [dateBasis, filteredInvoices]);

  const netProfit = report.costedSalesRevenue - report.costOfGoods;
  const margin = report.costedSalesRevenue > 0 ? (netProfit / report.costedSalesRevenue) * 100 : 0;
  const topItems = Object.values(report.items).filter((item) => !item.isRent).sort((a, b) => b.profit - a.profit).slice(0, 5);
  const chartMonths = Object.entries(report.months).sort(([a], [b]) => a.localeCompare(b)).slice(-6);
  const chartMax = Math.max(...chartMonths.map(([, values]) => Math.max(values.salesRevenue, values.costs, Math.abs(values.net))), 1);

  return (
    <div className="analytics-panel" dir="rtl">
      <div className="analytics-toolbar">
        <div>
          <p className="page-eyebrow">داشبورد عملکرد مالی</p>
          <h2 className="analytics-title">تحلیل پیشرفته سود و زیان</h2>
        </div>
        <button type="button" className="refresh-button" onClick={() => fetchAnalyticsData(true)} disabled={loading}>
          ↻ تازه‌سازی
        </button>
      </div>

      {error && <div className="analytics-error" role="alert">{error}</div>}

      <section className="analytics-filters" aria-label="فیلتر گزارش">
        <label>
          بازه گزارش
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            {PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          مبنای تاریخ
          <select value={dateBasis} onChange={(event) => setDateBasis(event.target.value)}>
            <option value="ceremony">تاریخ مراسم</option>
            <option value="invoice">تاریخ ثبت فاکتور</option>
          </select>
        </label>
        {period === 'custom' && (
          <>
            <label>از تاریخ<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
            <label>تا تاریخ<input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label>
          </>
        )}
        <p className="analytics-filter-note">
          {range.from || range.to
            ? `از ${formatDate(range.from)} تا ${formatDate(range.to)}`
            : 'گزارش تمام دوره'}
          {' · '}فاکتورهای بدون تاریخ مراسم با تاریخ ثبت محاسبه می‌شوند.
        </p>
      </section>

      {loading ? (
        <div className="analytics-loading">در حال بارگذاری اطلاعات مالی...</div>
      ) : loadFailed && invoices.length === 0 ? (
        <div className="analytics-load-failure">
          <p>اطلاعات فاکتورها بارگذاری نشد؛ محاسبهٔ سود و زیان ممکن نیست.</p>
          <button type="button" className="refresh-button" onClick={() => fetchAnalyticsData(true)}>تلاش دوباره</button>
        </div>
      ) : (
        <>
          <section className="analytics-stats">
            <article className="analytics-stat-card revenue">
              <p>مبلغ کل فاکتورهای بازه</p>
              <h3>{formatMoney(report.revenue)}</h3>
              <span>{filteredInvoices.length.toLocaleString('fa-IR')} فاکتور</span>
            </article>
            <article className="analytics-stat-card revenue">
              <p>فروش اقلام فروخته‌شده</p>
              <h3>{formatMoney(report.salesRevenue)}</h3>
              <span>بدون احتساب درآمد اجاره</span>
            </article>
            <article className={`analytics-stat-card ${netProfit < 0 ? 'loss' : 'net'}`}>
              <p>سود خالص فروش{report.missingCostCount > 0 || report.missingItemInvoiceCount > 0 ? ' (ناقص)' : ''}</p>
              <h3>{formatMoney(netProfit)}</h3>
              <span>حاشیه سود فروش: {margin.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪</span>
            </article>
            <article className="analytics-stat-card">
              <p>درآمد اجاره (جدا از سود فروش)</p>
              <h3>{formatMoney(report.rentRevenue)}</h3>
              <span>در محاسبهٔ سود خالص فروش وارد نمی‌شود</span>
            </article>
            <article className="analytics-stat-card receivables">
              <p>مطالبات باقی‌مانده</p>
              <h3>{formatMoney(report.receivables)}</h3>
              <span>دریافتی ثبت‌شده: {formatMoney(report.collected)}</span>
            </article>
          </section>

          {(report.missingCostCount > 0 || report.missingItemInvoiceCount > 0) && (
            <div className="analytics-warning" role="status">
              {report.missingCostCount > 0 && <>بهای خرید {report.missingCostCount.toLocaleString('fa-IR')} ردیف فروش پیدا نشد؛ این ردیف‌ها در محاسبهٔ عدد سود وارد نشده‌اند، پس مبلغ سود خالص ناقص است. </>}
              {report.missingItemInvoiceCount > 0 && <>جزئیات اقلام {report.missingItemInvoiceCount.toLocaleString('fa-IR')} فاکتور موجود نیست و در سود فروش لحاظ نشده است. </>}
              بهای خرید کالاها را در انبار و اقلام فاکتورها بررسی کنید.
            </div>
          )}

          <section className="analytics-breakdown">
            <article className="analytics-items-card">
              <h3>صورت سود و زیان بازه</h3>
              <div className="analytics-statement-table-wrap">
                <table className="analytics-statement-table">
                  <thead>
                    <tr><th scope="col">ردیف</th><th scope="col">شرح مالی</th><th scope="col">مبلغ (تومان)</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>۱</td><th scope="row">کل فروش اقلام فروخته‌شده</th><td>{formatMoney(report.salesRevenue)}</td></tr>
                    <tr><td>۲</td><th scope="row">فروش دارای بهای خرید ثبت‌شده</th><td>{formatMoney(report.costedSalesRevenue)}</td></tr>
                    <tr><td>۳</td><th scope="row">بهای خرید اقلام فروخته‌شده</th><td>− {formatMoney(report.costOfGoods)}</td></tr>
                    <tr className="statement-total"><td>۴</td><th scope="row">سود خالص فروش</th><td>{formatMoney(netProfit)}</td></tr>
                    <tr className="statement-rent"><td>۵</td><th scope="row">درآمد اجاره (جدا از سود فروش)</th><td>{formatMoney(report.rentRevenue)}</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="analytics-footnote">سود خالص این گزارش فقط از فروش کالاها محاسبه می‌شود: مبلغ فروش منهای بهای خرید ثبت‌شده. اجاره جدا گزارش می‌شود و وارد این سود نمی‌شود.</p>
            </article>

            <article className="analytics-items-card">
              <h3>روند ماهانه فروش، بهای خرید و سود فروش</h3>
              {chartMonths.length === 0 ? (
                <p className="analytics-empty">برای این بازه اطلاعات فروش ثبت نشده است.</p>
              ) : (
                <>
                  <div className="analytics-chart-legend">
                    <span className="revenue">فروش با بهای ثبت‌شده</span><span className="costs">بهای خرید</span><span className="net">سود فروش</span>
                  </div>
                  <div className="analytics-chart" role="img" aria-label="نمودار فروش، بهای خرید و سود ماهانه">
                    {chartMonths.map(([month, values]) => (
                      <div className="analytics-chart-column" key={month}>
                        <div className="analytics-chart-bars" title={`${month} | فروش با بهای ثبت‌شده: ${formatMoney(values.costedSalesRevenue)} | بهای خرید: ${formatMoney(values.costs)} | سود فروش: ${formatMoney(values.net)}`}>
                          <span className="analytics-chart-bar revenue" style={{ height: `${Math.max((values.costedSalesRevenue / chartMax) * 100, values.costedSalesRevenue ? 2 : 0)}%` }} />
                          <span className="analytics-chart-bar costs" style={{ height: `${Math.max((values.costs / chartMax) * 100, values.costs ? 2 : 0)}%` }} />
                          <span className={`analytics-chart-bar net ${values.net < 0 ? 'negative' : ''}`} style={{ height: `${Math.max((Math.abs(values.net) / chartMax) * 100, values.net ? 2 : 0)}%` }} />
                        </div>
                        <span className="analytics-chart-label">{month}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </article>
          </section>

          <section className="analytics-items-card analytics-invoices-section">
            <div className="analytics-section-heading">
              <div>
                <p className="page-eyebrow">گزارش جزئی هر مشتری و مراسم</p>
                <h3>سود و زیان فاکتور به فاکتور</h3>
              </div>
              <span className="analytics-invoice-count">{searchedInvoices.length.toLocaleString('fa-IR')} فاکتور</span>
            </div>
            <label className="analytics-invoice-search">
              جست‌وجوی نام مشتری، شماره فاکتور یا شماره تماس
              <input
                type="search"
                value={invoiceSearch}
                onChange={(event) => setInvoiceSearch(event.target.value)}
                placeholder="مثلاً ملیحه مرادی"
              />
            </label>
            {searchedInvoices.length === 0 ? (
              <p className="analytics-empty">
                {invoiceSearch ? 'فاکتوری با این جست‌وجو در بازهٔ انتخاب‌شده پیدا نشد.' : 'در بازهٔ انتخاب‌شده فاکتوری ثبت نشده است.'}
              </p>
            ) : (
              <div className="overflow-x-auto analytics-invoice-table-wrap">
                <table className="analytics-table analytics-invoice-table">
                  <thead>
                    <tr>
                      <th>نام مشتری</th>
                      <th>شماره فاکتور</th>
                      <th>تاریخ مراسم</th>
                      <th>مبلغ کل فاکتور</th>
                      <th>فروش اقلام فروشی</th>
                      <th>بهای خرید</th>
                      <th>سود خالص فروش</th>
                      <th>درآمد اجاره</th>
                      <th>جزئیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchedInvoices.map((invoice) => {
                      const details = getInvoiceBreakdown(invoice);
                      const isExpanded = expandedInvoiceId === invoice.id;
                      return (
                        <React.Fragment key={invoice.id}>
                          <tr className={isExpanded ? 'analytics-invoice-row expanded' : 'analytics-invoice-row'}>
                            <td>{invoice.customer_name || 'نامشخص'}</td>
                            <td>#{String(invoice.invoice_number || invoice.invoiceNumber || invoice.id).toLocaleString('fa-IR')}</td>
                            <td>{formatDate(toISODate(invoice.ceremony_date))}</td>
                            <td>{formatMoney(details.total)}</td>
                            <td>{formatMoney(details.salesRevenue)}</td>
                            <td>{formatMoney(details.costOfGoods)}</td>
                            <td className={details.missingCostCount ? 'analytics-incomplete-value' : 'analytics-profit-value'}>
                              {details.missingCostCount ? 'ناقص' : formatMoney(details.profit)}
                            </td>
                            <td>{formatMoney(details.rentRevenue)}</td>
                            <td>
                              <button
                                type="button"
                                className="analytics-details-button"
                                aria-expanded={isExpanded}
                                onClick={() => setExpandedInvoiceId(isExpanded ? null : invoice.id)}
                              >
                                {isExpanded ? 'بستن' : 'ریز فاکتور'}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="analytics-invoice-detail-row">
                              <td colSpan="9">
                                <div className="analytics-invoice-detail">
                                  <div className="analytics-invoice-detail-heading">
                                    <strong>ریز سود و زیان فاکتور #{String(invoice.invoice_number || invoice.invoiceNumber || invoice.id).toLocaleString('fa-IR')} — {invoice.customer_name || 'نامشخص'}</strong>
                                    <span>پرداخت‌شده: {formatMoney(invoice.paid_amount)} · مانده: {formatMoney(Math.max(details.total - Number(invoice.paid_amount || 0), 0))}</span>
                                  </div>
                                  {details.items.length === 0 ? (
                                    <p className="analytics-empty">جزئیات اقلام در این فاکتور ثبت نشده است.</p>
                                  ) : (
                                    <>
                                      <div className="overflow-x-auto">
                                        <table className="analytics-table analytics-item-detail-table">
                                          <thead>
                                            <tr><th>ردیف</th><th>نام کالا / خدمت</th><th>نوع</th><th>تعداد</th><th>قیمت واحد</th><th>بهای خرید واحد</th><th>فروش ردیف</th><th>بهای خرید کل</th><th>سود خالص ردیف</th></tr>
                                          </thead>
                                          <tbody>
                                            {details.items.map((item, index) => (
                                              <tr key={item.key}>
                                                <td>{(index + 1).toLocaleString('fa-IR')}</td>
                                                <td>{item.title}</td>
                                                <td>{item.type}</td>
                                                <td>{item.quantity.toLocaleString('fa-IR')}</td>
                                                <td>{formatMoney(item.unitPrice)}</td>
                                                <td>{item.rent ? '—' : item.unitCost === null ? 'ثبت نشده' : formatMoney(item.unitCost)}</td>
                                                <td>{formatMoney(item.revenue)}</td>
                                                <td>{item.rent ? '—' : item.cost === null ? 'نامشخص' : formatMoney(item.cost)}</td>
                                                <td className={item.rent ? '' : item.profit === null ? 'analytics-incomplete-value' : 'analytics-profit-value'}>
                                                  {item.rent ? 'در سود فروش نیست' : item.profit === null ? 'نامشخص' : formatMoney(item.profit)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                      <div className="analytics-invoice-detail-totals">
                                        <span>فروش دارای بهای خرید: <strong>{formatMoney(details.costedSalesRevenue)}</strong></span>
                                        <span>بهای خرید فروش: <strong>{formatMoney(details.costOfGoods)}</strong></span>
                                        <span>سود خالص فروش: <strong>{details.missingCostCount ? 'ناقص؛ بعضی بهاها ثبت نشده' : formatMoney(details.profit)}</strong></span>
                                        <span>درآمد اجاره (جدا): <strong>{formatMoney(details.rentRevenue)}</strong></span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="analytics-footnote">سود هر فاکتور از فروش اقلام فروشی منهای بهای خرید همان اقلام است. اجاره جدا نمایش داده می‌شود و در سود فروش وارد نمی‌شود؛ اگر بهای خریدی در خود فاکتور ثبت نشده باشد، سود آن ردیف نامشخص می‌ماند.</p>
          </section>

          <section className="analytics-items-card">
            <h3>اقلام فروشی با بیشترین سود خالص</h3>
            {topItems.length === 0 ? (
              <p className="analytics-empty">دادهٔ اقلام فاکتور برای این بازه ثبت نشده است.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="analytics-table">
                  <thead><tr><th>کالا / خدمت</th><th>تعداد</th><th>فروش</th><th>سود خالص فروش</th></tr></thead>
                  <tbody>
                    {topItems.map((item) => (
                      <tr key={item.key}>
                        <td>{item.name}</td>
                        <td>{item.quantity.toLocaleString('fa-IR')}</td>
                        <td>{formatMoney(item.revenue)}</td>
                        <td>{item.hasUnknownCost ? 'ناقص؛ بهای خرید ثبت نشده' : formatMoney(item.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </>
      )}
    </div>
  );
}
