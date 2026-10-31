import moment from 'jalali-moment';

export const toAsciiDigits = (value) => String(value).replace(/[۰-۹]/g, (digit) => (
  String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))
));

export const formatPersianDate = (value) => {
  if (!value) return '—';
  const parsed = moment(String(value).slice(0, 10), 'YYYY-MM-DD', true);
  return parsed.isValid()
    ? parsed.locale('fa').format('jYYYY/jMM/jDD').replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)])
    : '—';
};
