import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoicePrintHtml } from '../src/invoicePrintTemplate.js';

const makeDocument = (overrides = {}) => buildInvoicePrintHtml({
  documentType: 'فاکتور رسمی',
  businessName: 'مجموعه',
  logoUrl: '/logo.png',
  number: '۱۲۳',
  createdDate: '۱۴۰۵/۰۱/۰۱',
  customerName: 'مشتری',
  customerPhone: '۰۹۱۲',
  items: [{
    title: 'کالای آزمایشی',
    type: 'فروشی',
    rentalCheckoutDate: '',
    rentalReturnDate: '',
    quantity: 2,
    prices: [
      { label: 'درجه ۱', unit: 100, total: 200 },
      { label: 'درجه ۲', unit: 150, total: 300 },
      { label: 'درجه ۳', unit: 200, total: 400 },
    ],
  }],
  totals: [{ label: 'مبلغ نهایی', value: 200, emphasis: true }],
  note: 'یادداشت',
  ...overrides,
});

test('invoice print template keeps the shared A4 layout and customer-facing columns', () => {
  const html = makeDocument();

  assert.match(html, /@page \{ size: A4 portrait; margin: 10mm;/);
  assert.match(html, /class="watermark"/);
  assert.match(html, /نام کالا \/ خدمت/);
  assert.match(html, /بازهٔ اجاره/);
  assert.match(html, /class="rental-period-empty"/);
  assert.match(html, /direction: ltr; unicode-bidi: isolate; white-space: nowrap/);
  assert.match(html, /font-variant-numeric: tabular-nums/);
  assert.match(html, /قیمت واحد/);
  assert.match(html, /جمع ردیف/);
  assert.match(html, /درجه ۲/);
  assert.match(html, /درجه ۳/);
  assert.match(html, /۳۰۰ تومان/);
  assert.match(html, /۴۰۰ تومان/);
  assert.match(html, /امضا و مهر فروشنده/);
  assert.match(html, /۲۰۰ تومان/);
  assert.match(html, /beforeprint/);
  assert.match(html, /afterprint/);
  assert.match(html, /density-ultra-compact/);
  assert.match(html, /style\.zoom/);
  assert.equal((html.match(/class="empty-row"/g) || []).length, 0);
});

test('invoice print template displays phone numbers with Persian digits', () => {
  const asciiDigitsHtml = makeDocument({ customerPhone: '09196957762' });
  const arabicDigitsHtml = makeDocument({ customerPhone: '٠٩١٩٦٩٥٧٧٦٢' });

  assert.match(asciiDigitsHtml, /<strong>تلفن:<\/strong> ۰۹۱۹۶۹۵۷۷۶۲/);
  assert.match(arabicDigitsHtml, /<strong>تلفن:<\/strong> ۰۹۱۹۶۹۵۷۷۶۲/);
});

test('invoice print template escapes document data and fits a 50-row invoice', () => {
  const html = makeDocument({
    customerName: '<script>alert(1)</script>',
    priceLevelLabel: 'درجه ۱',
    items: Array.from({ length: 50 }, (_, index) => ({
      title: `کالا ${index + 1}`,
      type: index % 2 ? 'فروشی' : 'اجاره‌ای',
      rentalCheckoutDate: index % 2 ? '' : '۱۴۰۵/۰۱/۰۱',
      rentalReturnDate: index % 2 ? '' : '۱۴۰۵/۰۱/۰۲',
      quantity: 1,
      prices: [
        { label: 'درجه ۱', unit: 10, total: 10 },
        { label: 'درجه ۲', unit: 20, total: 20 },
        { label: 'درجه ۳', unit: 30, total: 30 },
      ],
    })),
  });

  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal((html.match(/class="empty-row"/g) || []).length, 0);
  assert.equal((html.match(/class="invoice-item-row"/g) || []).length, 50);
  assert.match(html, /قیمت واحد \(درجه ۱\)/);
  assert.match(html, /تعداد اقلام زیاد است/);
  assert.doesNotMatch(html, /۱۴۰۵\/۰۱\/۰۱ تا ۱۴۰۵\/۰۱\/۰۲/);
  assert.match(html, /class="rental-date-divider"/);
});

test('invoice print template stacks rental dates and keeps non-rental rows compact', () => {
  const html = makeDocument({
    items: [
      {
        title: 'کالای اجاره‌ای',
        type: 'اجاره‌ای',
        rentalCheckoutDate: '۱۴۰۵/۰۱/۰۱',
        rentalReturnDate: '۱۴۰۵/۰۱/۰۲',
        quantity: 1,
        prices: [{ label: 'درجه ۱', unit: 10, total: 10 }],
      },
      {
        title: 'کالای فروشی',
        type: 'فروشی',
        rentalCheckoutDate: '',
        rentalReturnDate: '',
        quantity: 1,
        prices: [{ label: 'درجه ۱', unit: 20, total: 20 }],
      },
    ],
  });

  assert.match(html, /<span class="rental-date">۱۴۰۵\/۰۱\/۰۱<\/span>/);
  assert.match(html, /<span class="rental-date">۱۴۰۵\/۰۱\/۰۲<\/span>/);
  assert.equal((html.match(/class="rental-date-divider"/g) || []).length, 1);
  assert.equal((html.match(/class="rental-period-empty"/g) || []).length, 1);
  assert.doesNotMatch(html, /۱۴۰۵\/۰۱\/۰۱ تا ۱۴۰۵\/۰۱\/۰۲/);
});
