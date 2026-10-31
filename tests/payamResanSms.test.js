import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePayamResanDestination,
  sendPayamResanOtp,
} from '../supabase/functions/payam-resan-send-sms/smsSender.js';

test('normalizes Iranian mobiles to Payam Resan Destination format', () => {
  assert.equal(normalizePayamResanDestination('09121234567'), 9121234567);
  assert.equal(normalizePayamResanDestination('9121234567'), 9121234567);
  assert.equal(normalizePayamResanDestination('+989121234567'), 9121234567);
  assert.equal(normalizePayamResanDestination('00989121234567'), 9121234567);
  assert.equal(normalizePayamResanDestination('02112345678'), null);
});

test('sends an OTP through Payam Resan SendOtp', async () => {
  let requestUrl = '';
  let requestOptions;
  await sendPayamResanOtp({
    apiKey: 'server-secret',
    destination: 9121234567,
    code: '48213',
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return { ok: true, json: async () => ({ success: true }) };
    },
  });

  assert.equal(requestUrl, 'https://www.payam-resan.com/uapi/v4/SendOtp');
  assert.equal(requestOptions.method, 'POST');
  assert.deepEqual(requestOptions.headers, { 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(requestOptions.body), {
    ApiKey: 'server-secret',
    Destination: 9121234567,
    Code: '48213',
  });
});

test('rejects unsuccessful HTTP responses and provider-level failures', async () => {
  await assert.rejects(
    sendPayamResanOtp({
      apiKey: 'server-secret',
      destination: 9121234567,
      code: '48213',
      fetchImpl: async () => ({ ok: false }),
    }),
    /HTTP response was not successful/,
  );
  await assert.rejects(
    sendPayamResanOtp({
      apiKey: 'server-secret',
      destination: 9121234567,
      code: '48213',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ success: false, code: 'API_KEY_INVALID', message: 'invalid api key' }),
      }),
    }),
    /category=credentials,code=API_KEY_INVALID/,
  );
});
