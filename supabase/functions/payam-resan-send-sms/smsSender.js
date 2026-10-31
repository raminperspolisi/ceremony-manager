export function normalizePayamResanDestination(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (/^09\d{9}$/.test(digits)) return Number(digits.slice(1));
  if (/^9\d{9}$/.test(digits)) return Number(digits);
  if (/^989\d{9}$/.test(digits)) return Number(digits.slice(2));
  if (/^00989\d{9}$/.test(digits)) return Number(digits.slice(4));
  return null;
}

export async function sendPayamResanOtp({
  apiKey,
  destination,
  code,
  fetchImpl = fetch,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchImpl('https://www.payam-resan.com/uapi/v4/SendOtp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ApiKey: apiKey,
        Destination: destination,
        Code: code,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('HTTP response was not successful.');

    const result = await response.json();
    if (result?.success !== true) {
      const codeValue = result?.errorCode ?? result?.ErrorCode ?? result?.code ?? result?.Code;
      const code = (typeof codeValue === 'string' || typeof codeValue === 'number')
        ? String(codeValue)
        : '';
      const safeCode = /^[A-Za-z0-9_-]{1,32}$/.test(code) ? `code=${code}` : '';
      const messages = [result?.message, result?.Message, result?.error, result?.Error]
        .filter((value) => typeof value === 'string')
        .join(' ');
      const category = /api.?key|auth|credential|token/i.test(messages)
        ? 'credentials'
        : /balance|credit|fund/i.test(messages)
          ? 'account-balance'
          : /destination|phone|mobile|number/i.test(messages)
            ? 'destination'
            : /code|otp|sender|service|permission|template/i.test(messages)
              ? 'request-configuration'
              : 'unspecified';
      const diagnostic = [`category=${category}`, safeCode].filter(Boolean).join(',');
      throw new Error(`SMS provider rejected the request [${diagnostic}].`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
