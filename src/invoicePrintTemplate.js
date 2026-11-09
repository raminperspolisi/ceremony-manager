const escapeHtml = (value) => String(value ?? '—').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const formatNumber = (value) => Number(value || 0).toLocaleString('fa-IR');

const PRINTABLE_HEIGHT_PX = (297 - 20) * 96 / 25.4;

export function buildInvoicePrintHtml({
  documentType,
  businessName,
  logoUrl,
  number,
  createdDate,
  customerName,
  customerPhone,
  customerAddress,
  orderDate,
  ceremonyDate,
  items,
  totals,
  note,
  contactHtml = '',
  priceLevelLabel = '',
  autoPrint = false,
}) {
  const rows = items.map((item, index) => {
    const priceLines = (key) => item.prices.map((price) => `
      <div class="price-line">
        ${price.label ? `<small>${escapeHtml(price.label)}</small>` : ''}
        <span>${formatNumber(price[key])} تومان</span>
      </div>
    `).join('');
    const rentalPeriod = item.rentalCheckoutDate && item.rentalReturnDate
      ? `<div class="rental-period">
          <span class="rental-date">${escapeHtml(item.rentalCheckoutDate)}</span>
          <span class="rental-date-divider" aria-hidden="true"></span>
          <span class="rental-date">${escapeHtml(item.rentalReturnDate)}</span>
        </div>`
      : '<span class="rental-period-empty">—</span>';
    return `
      <tr class="invoice-item-row">
        <td>${formatNumber(index + 1)}</td>
        <td class="item-description"><strong>${escapeHtml(item.title)}</strong></td>
        <td>${escapeHtml(item.type || '—')}</td>
        <td>${formatNumber(item.quantity)}</td>
        <td class="rental-period-cell">${rentalPeriod}</td>
        <td>${priceLines('unit')}</td>
        <td>${priceLines('total')}</td>
      </tr>
    `;
  });

  const totalRows = totals.map((total) => `
    <div class="total-row${total.emphasis ? ' emphasis' : ''}">
      <span>${escapeHtml(total.label)}</span>
      <strong>${escapeHtml(total.text ?? formatNumber(total.value))}${total.unit === '' ? '' : ` ${escapeHtml(total.unit || 'تومان')}`}</strong>
    </div>
  `).join('');

  return `
    <!doctype html>
    <html dir="rtl" lang="fa">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(documentType)} ${escapeHtml(number)}</title>
        <style>
          @font-face { font-family: 'IRANSans'; src: url('${new URL('./assets/fonts/Vazirmatn-400.ttf', import.meta.url).href}') format('truetype'); font-weight: 400; }
          @font-face { font-family: 'IRANSans'; src: url('${new URL('./assets/fonts/Vazirmatn-700.ttf', import.meta.url).href}') format('truetype'); font-weight: 700; }
          @page { size: A4 portrait; margin: 10mm; }
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; color: #171717; background: #fff; font-family: 'IRANSans', Tahoma, sans-serif; font-size: 11px; }
          .paper { position: relative; width: 190mm; margin: 0 auto; padding: 10px; border: 3px double #28645a; }
          .watermark { position: absolute; z-index: 0; width: 190px; height: 190px; object-fit: contain; opacity: .055; left: 50%; top: 52%; transform: translate(-50%, -50%); pointer-events: none; }
          .paper-content { position: relative; z-index: 1; }
          .top-grid { display: grid; grid-template-columns: 1fr 1fr; min-height: 72px; border: 1px solid #28645a; }
          .business-block { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px; border-left: 1px solid #28645a; }
          .business-name { margin: 0 0 4px; font-size: 15px; font-weight: 800; }
          .business-label { font-size: 11px; font-weight: 700; }
          .company-logo { width: 52px; height: 52px; object-fit: contain; }
          .contact-block { display: flex; align-items: center; padding: 7px; font-size: 9px; line-height: 1.6; }
          .contact-block .business-contact { display: flex; flex-direction: column; gap: 1px; border: 0; margin: 0; padding: 0; font-size: inherit; }
          .contact-block .business-contact strong { display: none; }
          .business-contact a { color: inherit; text-decoration: none; }
          a { color: inherit; text-decoration: none; }
          .document-title { margin: 6px 0 4px; text-align: center; font-size: 15px; font-weight: 800; }
          .document-meta, .customer-meta { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #28645a; border-bottom: 0; }
          .document-meta span, .customer-meta span { min-height: 24px; padding: 4px 7px; border-bottom: 1px solid #cbd9d5; }
          .document-meta span:nth-child(odd), .customer-meta span:nth-child(odd) { border-left: 1px solid #cbd9d5; }
          table { width: 100%; margin-top: 6px; border-collapse: collapse; table-layout: fixed; }
          th, td { border: 1px solid #aebdb8; padding: 3px 4px; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
          th { background: #edf5f1; color: #214a42; font-size: 9px; font-weight: 700; }
          th:nth-child(1) { width: 6%; }
          th:nth-child(2) { width: 24%; }
          th:nth-child(3) { width: 10%; }
          th:nth-child(4) { width: 8%; }
          th:nth-child(5) { width: 16%; }
          th:nth-child(6), th:nth-child(7) { width: 18%; }
          th:nth-child(5), .rental-period-cell { white-space: nowrap; }
          tbody tr:nth-child(even) { background: #f7faf8; }
          td { min-height: 20px; }
          .item-description { text-align: right; }
          .item-description strong { display: block; }
          .rental-period { display: grid; justify-items: center; gap: 2px; }
          .rental-date { display: block; direction: ltr; unicode-bidi: isolate; white-space: nowrap; font-variant-numeric: tabular-nums; }
          .rental-date-divider { display: block; width: 75%; border-top: 1px solid #cfd8d5; }
          .rental-period-empty { display: block; min-height: 2.4em; line-height: 2.4em; text-align: center; }
          .price-line + .price-line { border-top: 1px dotted #999; }
          .price-line { display: flex; justify-content: center; gap: 3px; padding: 1px 0; font-size: 9px; }
          .price-line small { color: #53665f; }
          .bottom-grid { display: grid; grid-template-columns: 1fr; margin-top: 5px; border: 1px solid #28645a; }
          .notes { padding: 5px 7px; border-bottom: 1px solid #cbd9d5; line-height: 1.6; }
          .totals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 12px; padding: 4px 8px; }
          .total-row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; border-bottom: 1px solid #e1e8e4; }
          .total-row:last-child { border-bottom: 0; }
          .total-row.emphasis { color: #17473f; font-size: 11px; font-weight: 800; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; min-height: 42px; border: 1px solid #28645a; border-top: 0; }
          .signature { display: flex; align-items: flex-end; justify-content: center; padding: 6px; }
          .signature + .signature { border-right: 1px solid #cbd9d5; }
          .fit-warning { display: none; padding: 8px; color: #9a3412; font-weight: 700; }
          @media screen { body { max-width: 860px; margin: 0 auto; padding: 12px; } .paper { width: 100%; } }
          @media print {
            html, body { width: 190mm; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .paper { width: 190mm; margin: 0; break-inside: avoid; page-break-inside: avoid; }
            .paper-content, header, .document-meta, .customer-meta, table, .bottom-grid, .signatures { break-inside: avoid; page-break-inside: avoid; page-break-after: avoid; }
            button, input, select, textarea, nav, aside, .no-print, .delete-column { display: none !important; }
            .fit-warning { display: none !important; }
          }
          body.density-compact { font-size: 10px; }
          body.density-compact .paper { padding: 7px; }
          body.density-compact .top-grid { min-height: 60px; }
          body.density-compact .business-block, body.density-compact .contact-block { padding: 5px; }
          body.density-compact .company-logo { width: 42px; height: 42px; }
          body.density-compact .document-title { margin: 4px 0 3px; font-size: 13px; }
          body.density-compact .document-meta span, body.density-compact .customer-meta span { min-height: 20px; padding: 2px 5px; }
          body.density-compact th, body.density-compact td { padding: 2px 3px; font-size: 9px; }
          body.density-compact .rental-period { gap: 1px; }
          body.density-compact .rental-date-divider { width: 70%; }
          body.density-compact .rental-period-empty { min-height: 2.2em; line-height: 2.2em; }
          body.density-compact .notes { padding: 3px 5px; }
          body.density-compact .total-row { padding: 2px 0; }
          body.density-compact .signatures { min-height: 34px; }
          body.density-ultra-compact { font-size: 9px; line-height: 1.35; }
          body.density-ultra-compact .paper { padding: 5px; border-width: 2px; }
          body.density-ultra-compact .top-grid { min-height: 50px; }
          body.density-ultra-compact .business-name { font-size: 12px; }
          body.density-ultra-compact .business-label { font-size: 9px; }
          body.density-ultra-compact .company-logo { width: 34px; height: 34px; }
          body.density-ultra-compact .contact-block { font-size: 8px; }
          body.density-ultra-compact .document-title { margin: 3px 0 2px; font-size: 11px; }
          body.density-ultra-compact .document-meta span, body.density-ultra-compact .customer-meta span { min-height: 17px; padding: 1px 4px; }
          body.density-ultra-compact th, body.density-ultra-compact td { padding: 1px 2px; font-size: 9px; line-height: 1.25; }
          body.density-ultra-compact .price-line { font-size: 9px; }
          body.density-ultra-compact .rental-period { gap: 1px; }
          body.density-ultra-compact .rental-period-empty { min-height: 2em; line-height: 2em; }
          body.density-ultra-compact .notes { padding: 2px 4px; }
          body.density-ultra-compact .totals { padding: 2px 5px; }
          body.density-ultra-compact .total-row { padding: 1px 0; font-size: 9px; }
          body.density-ultra-compact .signatures { min-height: 28px; }
        </style>
      </head>
      <body>
        <main class="paper">
          <img class="watermark" src="${escapeHtml(logoUrl)}" alt="">
          <div class="paper-content">
            <header class="top-grid">
              <section class="business-block">
                <div>
                  <h1 class="business-name">${escapeHtml(businessName)}</h1>
                  <div class="business-label">فروش و خدمات مراسم</div>
                </div>
                <img class="company-logo" src="${escapeHtml(logoUrl)}" alt="لوگوی ${escapeHtml(businessName)}">
              </section>
              <section class="contact-block">${contactHtml || 'اطلاعات تماس مجموعه در پروفایل ثبت نشده است.'}</section>
            </header>
            <h2 class="document-title">${escapeHtml(documentType)}</h2>
            <div class="document-meta">
              <span><strong>تاریخ صدور:</strong> ${escapeHtml(createdDate)}</span>
              <span><strong>شماره:</strong> ${escapeHtml(number)}</span>
            </div>
            <div class="customer-meta">
              <span><strong>نام مشتری:</strong> ${escapeHtml(customerName)}</span>
              <span><strong>تلفن:</strong> ${escapeHtml(customerPhone || 'ثبت نشده')}</span>
              <span><strong>تاریخ سفارش:</strong> ${escapeHtml(orderDate || '—')}</span>
              <span><strong>تاریخ مراسم:</strong> ${escapeHtml(ceremonyDate || '—')}</span>
              <span style="grid-column: 1 / -1"><strong>نشانی:</strong> ${escapeHtml(customerAddress || 'ثبت نشده')}</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>ردیف</th>
                  <th>نام کالا / خدمت</th>
                  <th>نوع</th>
                  <th>تعداد</th>
                  <th>بازهٔ اجاره</th>
                  <th>قیمت واحد${priceLevelLabel ? ` (${escapeHtml(priceLevelLabel)})` : ''}</th>
                  <th>جمع ردیف${priceLevelLabel ? ` (${escapeHtml(priceLevelLabel)})` : ''}</th>
                </tr>
              </thead>
              <tbody>${rows.join('')}</tbody>
            </table>
            <section class="bottom-grid">
              <div class="notes">${escapeHtml(note)}</div>
              <div class="totals">${totalRows}</div>
            </section>
            <section class="signatures">
              <div class="signature">امضا و مهر فروشنده</div>
              <div class="signature">امضای مشتری</div>
            </section>
          </div>
          <div class="fit-warning" role="status">تعداد اقلام زیاد است؛ ممکن است چاپ یک‌صفحه‌ای با کوچک‌ترین اندازهٔ مجاز خوانایی کافی نداشته باشد.</div>
        </main>
        <script>
          (() => {
            const paper = document.querySelector('.paper');
            const warning = document.querySelector('.fit-warning');
            let warningShown = false;
            const resetPrintFit = () => {
              document.body.classList.remove('density-compact', 'density-ultra-compact');
              paper.style.zoom = '1';
              warning.style.display = 'none';
            };
            const fitPrintPage = () => {
              resetPrintFit();
              const measurement = paper.cloneNode(true);
              measurement.style.position = 'absolute';
              measurement.style.visibility = 'hidden';
              measurement.style.left = '-10000px';
              measurement.style.width = '190mm';
              measurement.style.margin = '0';
              document.body.append(measurement);
              const densities = ['', 'density-compact', 'density-ultra-compact'];
              let height = measurement.getBoundingClientRect().height;
              for (const density of densities) {
                document.body.classList.remove('density-compact', 'density-ultra-compact');
                if (density) document.body.classList.add(density);
                height = measurement.getBoundingClientRect().height;
                if (height <= ${PRINTABLE_HEIGHT_PX} - 8) break;
              }
              const scale = Math.min(1, (${PRINTABLE_HEIGHT_PX} - 8) / height);
              measurement.remove();
              paper.style.zoom = String(Math.max(0.55, scale));
              if (scale < 0.55) {
                warning.style.display = 'block';
                if (!warningShown) {
                  warningShown = true;
                  window.alert('تعداد اقلام زیاد است و ممکن است همهٔ محتوا در یک صفحهٔ A4 جا نشود.');
                }
              }
            };
            window.addEventListener('beforeprint', fitPrintPage);
            window.addEventListener('afterprint', () => {
              resetPrintFit();
              ${autoPrint ? 'window.setTimeout(() => window.close(), 0);' : ''}
            });
            window.addEventListener('load', async () => {
              if (document.fonts && document.fonts.ready) await document.fonts.ready;
              ${autoPrint ? 'fitPrintPage(); window.print();' : ''}
            }, { once: true });
          })();
        </script>
      </body>
    </html>
  `;
}
