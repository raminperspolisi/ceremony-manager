const escapeHtml = (value) => String(value ?? '—').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const formatNumber = (value) => Number(value || 0).toLocaleString('fa-IR');

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
  autoPrint = false,
}) {
  const rows = items.map((item, index) => {
    const prices = item.prices.map((price) => (
      `<div class="price-line">${escapeHtml(price.label)}${price.label ? ': ' : ''}${formatNumber(price.unit)} تومان</div>`
    )).join('');
    const lineTotals = item.prices.map((price) => (
      `<div class="price-line">${escapeHtml(price.label)}${price.label ? ': ' : ''}${formatNumber(price.total)} تومان</div>`
    )).join('');
    return `
      <tr>
        <td>${formatNumber(index + 1)}</td>
        <td class="item-description">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.details || '')}</span>
        </td>
        <td>${formatNumber(item.quantity)}</td>
        <td>${prices}</td>
        <td>${lineTotals}</td>
      </tr>
    `;
  });

  while (rows.length < 8) {
    rows.push('<tr class="empty-row"><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>');
  }

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
          @font-face { font-family: 'IRANSans'; src: url('https://cdn.fontcdn.ir/Font/Persian/IRANSans/IRANSans.woff2') format('woff2'); }
          @page { size: A4 portrait; margin: 8mm; }
          * { box-sizing: border-box; }
          body { margin: 0; padding: 8px; color: #171717; background: #fff; font-family: 'IRANSans', Tahoma, sans-serif; font-size: 11px; }
          .paper { position: relative; min-height: 270mm; padding: 12px; border: 4px double #222; overflow: hidden; }
          .watermark { position: absolute; z-index: 0; width: 190px; height: 190px; object-fit: contain; opacity: .055; left: 50%; top: 52%; transform: translate(-50%, -50%); pointer-events: none; }
          .paper-content { position: relative; z-index: 1; }
          .top-grid { display: grid; grid-template-columns: 1fr 1fr; min-height: 82px; border: 1px solid #222; }
          .business-block { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px; border-left: 1px solid #222; }
          .business-name { margin: 0 0 5px; font-size: 16px; font-weight: 800; }
          .business-label { font-size: 13px; font-weight: 700; }
          .company-logo { width: 60px; height: 60px; object-fit: contain; }
          .contact-block { display: flex; align-items: center; padding: 8px; font-size: 9px; line-height: 1.8; }
          .contact-block .business-contact { display: flex; flex-direction: column; gap: 1px; border: 0; margin: 0; padding: 0; font-size: inherit; }
          .contact-block .business-contact strong { display: none; }
          .business-contact a { color: inherit; text-decoration: none; }
          a { color: inherit; text-decoration: none; }
          .document-title { margin: 8px 0 5px; text-align: center; font-size: 17px; font-weight: 800; }
          .document-meta { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #222; border-bottom: 0; }
          .document-meta span { padding: 5px 8px; border-bottom: 1px solid #222; }
          .document-meta span:nth-child(odd) { border-left: 1px solid #222; }
          .customer-meta { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #222; border-bottom: 0; }
          .customer-meta span { min-height: 27px; padding: 5px 8px; border-bottom: 1px solid #222; }
          .customer-meta span:nth-child(odd) { border-left: 1px solid #222; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th, td { border: 1px solid #222; padding: 5px 4px; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
          th { font-size: 10px; font-weight: 700; }
          th:first-child { width: 8%; }
          th:nth-child(2) { width: 36%; }
          th:nth-child(3) { width: 11%; }
          th:nth-child(4), th:nth-child(5) { width: 22.5%; }
          td { min-height: 27px; }
          .item-description { text-align: right; }
          .item-description strong, .item-description span { display: block; }
          .item-description span { margin-top: 2px; color: #333; font-size: 9px; }
          .price-line + .price-line { border-top: 1px dotted #999; }
          .price-line { padding: 1px 0; font-size: 9px; }
          .empty-row td { height: 28px; }
          .bottom-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #222; border-top: 0; }
          .notes { display: flex; align-items: center; padding: 10px; border-left: 1px solid #222; line-height: 2; }
          .totals { padding: 7px 9px; }
          .total-row { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; border-bottom: 1px solid #ddd; }
          .total-row:last-child { border-bottom: 0; }
          .total-row.emphasis { font-size: 12px; font-weight: 800; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; min-height: 58px; border: 1px solid #222; border-top: 0; }
          .signature { display: flex; align-items: flex-end; justify-content: center; padding: 8px; }
          .signature + .signature { border-right: 1px solid #222; }
          .footer-contact { margin-top: 7px; font-size: 9px; text-align: center; }
          @media screen { body { max-width: 860px; margin: 0 auto; } }
          @media print {
            body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .paper { min-height: 270mm; }
            .paper-content, .paper { break-inside: avoid; }
          }
          @media (max-width: 540px) {
            body { padding: 4px; font-size: 9px; }
            .paper { padding: 7px; border-width: 3px; }
            .top-grid, .bottom-grid { grid-template-columns: 1fr 1fr; }
            .company-logo { width: 44px; height: 44px; }
            .business-name { font-size: 13px; }
            th, td { padding: 4px 2px; font-size: 8px; }
          }
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
                  <th>شرح کالا / خدمت</th>
                  <th>تعداد</th>
                  <th>قیمت واحد</th>
                  <th>قیمت کل</th>
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
        </main>
        ${autoPrint ? '<script>window.onload = function() { window.print(); window.close(); };</script>' : ''}
      </body>
    </html>
  `;
}
