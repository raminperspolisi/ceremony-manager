import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIranianMobile, normalizeOtp } from '../src/authUtils.js';

test('normalizes Iranian mobile numbers to E.164', () => {
  assert.equal(normalizeIranianMobile('09121234567'), '+989121234567');
  assert.equal(normalizeIranianMobile('9121234567'), '+989121234567');
  assert.equal(normalizeIranianMobile('+989121234567'), '+989121234567');
  assert.equal(normalizeIranianMobile('00989121234567'), '+989121234567');
});

test('normalizes Persian and Arabic numerals', () => {
  assert.equal(normalizeIranianMobile('۰۹۱۲۱۲۳۴۵۶۷'), '+989121234567');
  assert.equal(normalizeIranianMobile('٠٩١٢١٢٣٤٥٦٧'), '+989121234567');
});

test('rejects invalid and non-Iranian numbers', () => {
  assert.throws(() => normalizeIranianMobile('02112345678'), /شمارهٔ موبایل معتبر/);
  assert.throws(() => normalizeIranianMobile(''), /شمارهٔ موبایل معتبر/);
});

test('normalizes Persian and Arabic OTP digits', () => {
  assert.equal(normalizeOtp('۱۲۳۴۵۶'), '123456');
  assert.equal(normalizeOtp('١٢٣٤٥٦'), '123456');
});
