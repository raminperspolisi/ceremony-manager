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
    details: 'فروشی | سطح قیمت: درجه ۱',
    quantity: 2,
    prices: [{ label: '', unit: 100, total: 200 }],
  }],
  totals: [{ label: 'مبلغ نهایی', value: 200, emphasis: true }],
  note: 'یادداشت',
  ...overrides,
});

test('invoice print template keeps the shared A4 layout and financial fields', () => {
  const html = makeDocument();

  assert.match(html, /@page \{ size: A4 portrait;/);
  assert.match(html, /class="watermark"/);
  assert.match(html, /شرح کالا \/ خدمت/);
  assert.match(html, /قیمت واحد/);
  assert.match(html, /امضا و مهر فروشنده/);
  assert.match(html, /۲۰۰ تومان/);
  assert.equal((html.match(/class="empty-row"/g) || []).length, 7);
});

test('invoice print template escapes document data and grows for more than eight items', () => {
  const html = makeDocument({
    customerName: '<script>alert(1)</script>',
    items: Array.from({ length: 9 }, (_, index) => ({
      title: `کالا ${index + 1}`,
      details: '',
      quantity: 1,
      prices: [{ label: '', unit: 10, total: 10 }],
    })),
  });

  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal((html.match(/class="empty-row"/g) || []).length, 0);
});
