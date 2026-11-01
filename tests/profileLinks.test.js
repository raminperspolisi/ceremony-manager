import test from 'node:test';
import assert from 'node:assert/strict';
import { getProfileSocialLinks, normalizeProfileLinks } from '../src/profileLinks.js';

test('normalizes a website address and accepts social handles with or without @', () => {
  assert.deepEqual(normalizeProfileLinks({
    website: 'example.com',
    instagram: '@azho.events',
    telegram: 'azho_events',
    rubika: '@azho.events',
  }), {
    website: 'https://example.com/',
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
    instagram: 'azho.events',
    telegram: 'azho_events',
    rubika: 'azho_events',
  });
});

test('rejects unsafe website protocols and links to the wrong social platform', () => {
  assert.throws(() => normalizeProfileLinks({ website: 'javascript:alert(1)' }), /آدرس سایت/);
  assert.throws(() => normalizeProfileLinks({ telegram: 'https://example.com/account' }), /دامنهٔ رسمی/);
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
