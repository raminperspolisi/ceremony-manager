import test from 'node:test';
import assert from 'node:assert/strict';
import { getSocialProfileUrl, normalizeSocialHandle } from '../src/businessContactUtils.js';

test('normalizes social handles from plain IDs and official profile URLs', () => {
  assert.equal(normalizeSocialHandle('@vendor_123', 'telegram'), 'vendor_123');
  assert.equal(normalizeSocialHandle('https://www.instagram.com/vendor.shop/', 'instagram'), 'vendor.shop');
});

test('creates a direct Telegram chat link from a Telegram username', () => {
  assert.equal(getSocialProfileUrl('@vendor_123', 'telegram'), 'https://t.me/vendor_123');
});

test('rejects links from unrelated hosts and invalid Telegram usernames', () => {
  assert.throws(() => normalizeSocialHandle('https://example.com/account', 'telegram'), /دامنهٔ رسمی/);
  assert.throws(() => normalizeSocialHandle('abc', 'telegram'), /شناسهٔ تلگرام معتبر نیست/);
});
