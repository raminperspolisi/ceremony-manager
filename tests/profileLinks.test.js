import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBusinessContact,
  getProfileSocialLinks,
  normalizeProfileLinks,
  renderBusinessContactHtml,
} from '../src/profileLinks.js';

test('normalizes a website address and accepts social handles with or without @', () => {
  assert.deepEqual(normalizeProfileLinks({
    website: 'example.com',
    email: ' info@example.com ',
    instagram: '@azho.events',
    telegram: 'azho_events',
    rubika: '@azho.events',
  }), {
    website: 'https://example.com/',
    email: 'info@example.com',
    instagram: 'azho.events',
    telegram: 'azho_events',
    rubika: 'azho.events',
  });
});

test('accepts profile links only from the matching social platform', () => {
  assert.deepEqual(normalizeProfileLinks({
    instagram: 'https://www.instagram.com/azho.events/',
    telegram: 'https://t.me/azho_events',
    rubika: 'https://rubika.ir/azho_events',
  }), {
    website: '',
    email: '',
    instagram: 'azho.events',
    telegram: 'azho_events',
    rubika: 'azho_events',
  });
});

test('rejects unsafe website protocols and links to the wrong social platform', () => {
  assert.throws(() => normalizeProfileLinks({ website: 'javascript:alert(1)' }), /آدرس سایت/);
  assert.throws(() => normalizeProfileLinks({ telegram: 'https://example.com/account' }), /دامنهٔ رسمی/);
  assert.throws(() => normalizeProfileLinks({ email: 'not-an-email' }), /ایمیل مجموعه/);
});

test('builds social links from validated profile metadata', () => {
  assert.deepEqual(getProfileSocialLinks({
    instagram_id: 'azho.events',
    telegram_id: 'azho_events',
    rubika_id: '',
  }), [
    { key: 'instagram', label: 'اینستاگرام', href: 'https://www.instagram.com/azho.events/' },
    { key: 'telegram', label: 'تلگرام', href: 'https://t.me/azho_events' },
  ]);
});

test('builds a resilient business contact card from profile metadata', () => {
  assert.deepEqual(getBusinessContact({
    business_website: 'https://example.com',
    business_email: 'info@example.com',
    instagram_id: 'azho.events',
    telegram_id: 'https://example.com/not-telegram',
  }), {
    website: 'https://example.com/',
    email: 'info@example.com',
    socialLinks: [
      { key: 'instagram', label: 'اینستاگرام', href: 'https://www.instagram.com/azho.events/' },
    ],
  });
});

test('renders escaped contact details for invoice HTML', () => {
  assert.equal(renderBusinessContactHtml({
    email: 'info@example.com',
    socialLinks: [{ key: 'telegram', label: '<b>Social</b>', href: 'https://t.me/social?x=1&y=2' }],
  }), '<div class="business-contact"><strong>راه‌های ارتباطی مجموعه:</strong><a href="mailto:info%40example.com">ایمیل: info@example.com</a><a href="https://t.me/social">&lt;b&gt;Social&lt;/b&gt;: @social</a></div>');
});
