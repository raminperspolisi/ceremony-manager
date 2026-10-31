import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';
import { normalizePayamResanDestination, sendPayamResanOtp } from './smsSender.js';

const response = (status: number, message = '') => new Response(message, {
  status,
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});

const webhookSecretPrefix = 'v1,whsec_';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return response(405, 'Method not allowed.');

  const hookSecret = Deno.env.get('AUTH_SMS_HOOK_SECRET');
  const apiKey = Deno.env.get('PAYAM_RESAN_API_KEY');
  if (!hookSecret || !apiKey) {
    console.error('Payam Resan SMS hook is missing server configuration.');
    return response(500, 'SMS service is not configured.');
  }
  if (!hookSecret.startsWith(webhookSecretPrefix)) {
    console.error('Payam Resan SMS hook secret has an invalid format.');
    return response(500, 'SMS service is not configured.');
  }

  let payload: {
    user?: { phone?: unknown };
    sms?: { otp?: unknown };
  };
  try {
    const body = await request.text();
    const webhook = new Webhook(hookSecret.slice(webhookSecretPrefix.length));
    payload = webhook.verify(body, {
      'webhook-id': request.headers.get('webhook-id') || '',
      'webhook-timestamp': request.headers.get('webhook-timestamp') || '',
      'webhook-signature': request.headers.get('webhook-signature') || '',
    }) as typeof payload;
  } catch {
    return response(401, 'Invalid hook signature.');
  }

  const phone = typeof payload.user?.phone === 'string' ? payload.user.phone : '';
  const code = typeof payload.sms?.otp === 'string' ? payload.sms.otp : '';
  const destination = normalizePayamResanDestination(phone);
  if (!destination || !/^\d{4,8}$/.test(code)) {
    return response(400, 'Invalid phone number or verification code.');
  }

  try {
    await sendPayamResanOtp({ apiKey, destination, code });
    return response(200);
  } catch (error) {
    console.error(
      'Payam Resan SMS request failed.',
      error instanceof Error && error.name === 'AbortError'
        ? 'Request timed out.'
        : error instanceof Error && error.message === 'HTTP response was not successful.'
          ? 'Unexpected provider HTTP response.'
          : error instanceof Error && error.message.startsWith('SMS provider rejected the request [')
            ? error.message
            : 'Network error.',
    );
    return response(502, 'SMS provider request failed.');
  }
});
