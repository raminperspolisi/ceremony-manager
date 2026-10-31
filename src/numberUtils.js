const toAsciiDigits = (value) => value
  .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
  .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632));

const toPersianDigits = (value) => value.replace(/\d/g, (digit) => (
  String.fromCharCode(digit.charCodeAt(0) + 1728)
));

export const normalizeNumber = (value, allowDecimal, allowNegative = false) => {
  const normalized = toAsciiDigits(String(value))
    .replace(/[٬,\s]/g, '')
    .replace(/٫/g, '.');
  const isNegative = allowNegative && normalized.trimStart().startsWith('-');
  const decimalIndex = allowDecimal ? normalized.indexOf('.') : -1;
  const integerPart = (decimalIndex === -1 ? normalized : normalized.slice(0, decimalIndex))
    .replace(/\D/g, '');

  if (decimalIndex === -1) return `${isNegative ? '-' : ''}${integerPart}`;

  const decimalPart = normalized.slice(decimalIndex + 1).replace(/\D/g, '');
  return `${isNegative ? '-' : ''}${integerPart}.${decimalPart}`;
};

export const formatGroupedNumber = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const [integerPart, decimalPart] = String(value).split('.');
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  const formatted = decimalPart === undefined ? groupedInteger : `${groupedInteger}.${decimalPart}`;
  return toPersianDigits(formatted);
};
