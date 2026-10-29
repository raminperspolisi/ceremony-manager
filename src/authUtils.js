const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const arabicDigits = '٠١٢٣٤٥٦٧٨٩';

export function normalizeIranianMobile(value) {
  const digits = String(value ?? '')
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/\D/g, '');

  if (/^09\d{9}$/.test(digits)) return `+98${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+98${digits}`;
  if (/^989\d{9}$/.test(digits)) return `+${digits}`;
  if (/^00989\d{9}$/.test(digits)) return `+${digits.slice(2)}`;

  throw new Error('شمارهٔ موبایل معتبر ایران را وارد کنید؛ مانند ۰۹۱۲۱۲۳۴۵۶۷.');
}

export function normalizeOtp(value) {
  return String(value ?? '')
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/\s/g, '');
}
