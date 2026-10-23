import moment from 'jalali-moment';

const formatPersianDigits = (value) => String(value ?? '')
  .replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);

const normalizeDigits = (value) => String(value || '')
  .replace(/[۰-۹]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))
  .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit));

const parseDashboardDate = (value) => {
  if (!value) return null;
  const normalized = normalizeDigits(value).trim();
  if (/^1[34]\d{2}[/-]/.test(normalized)) {
    const parsed = moment(normalized.replace(/-/g, '/'), 'jYYYY/jM/jD', true);
    return parsed.isValid() ? parsed : null;
  }
  const isoDate = moment(normalized, 'YYYY-MM-DD', true);
  if (isoDate.isValid()) return isoDate;
  const slashDate = moment(normalized, 'YYYY/M/D', true);
  if (slashDate.isValid()) return slashDate;
  if (moment.ISO_8601) {
    const isoTimestamp = moment(normalized, moment.ISO_8601, true);
    if (isoTimestamp.isValid()) return isoTimestamp;
  }
  return null;
};

export const toDashboardIsoDate = (value) => parseDashboardDate(value)?.format('YYYY-MM-DD') || '';

export const formatDashboardDate = (value) => {
  const parsed = parseDashboardDate(value);
  return parsed ? formatPersianDigits(parsed.locale('fa').format('jYYYY/jMM/jDD')) : 'تاریخ ثبت نشده';
};
