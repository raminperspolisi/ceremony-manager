import React, { useRef } from 'react';

const toAsciiDigits = (value) => value
  .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
  .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632));

const normalizeNumber = (value, allowDecimal) => {
  const normalized = toAsciiDigits(String(value))
    .replace(/[٬,\s]/g, '')
    .replace(/٫/g, '.');
  const decimalIndex = allowDecimal ? normalized.indexOf('.') : -1;
  const integerPart = (decimalIndex === -1 ? normalized : normalized.slice(0, decimalIndex))
    .replace(/\D/g, '');

  if (decimalIndex === -1) return integerPart;

  const decimalPart = normalized.slice(decimalIndex + 1).replace(/\D/g, '');
  return `${integerPart}.${decimalPart}`;
};

const toPersianDigits = (value) => value.replace(/\d/g, (digit) =>
  String.fromCharCode(digit.charCodeAt(0) + 1728)
);

const formatNumber = (value) => {
  if (!value) return '';
  const [integerPart, decimalPart] = value.split('.');
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  const formatted = decimalPart === undefined ? groupedInteger : `${groupedInteger}.${decimalPart}`;
  return toPersianDigits(formatted);
};

const countNumericCharacters = (value) => (value.match(/[0-9.]/g) || []).length;

const findCaretPosition = (value, numericCharacterCount) => {
  if (numericCharacterCount === 0) return 0;
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/[۰-۹.]/.test(value[index])) count += 1;
    if (count === numericCharacterCount) return index + 1;
  }
  return value.length;
};

export default function FormattedNumberInput({
  value,
  onValueChange,
  allowDecimal = true,
  inputMode = 'decimal',
  ...inputProps
}) {
  const inputRef = useRef(null);
  const rawValue = normalizeNumber(value ?? '', allowDecimal);

  const handleChange = (event) => {
    const input = event.currentTarget;
    const caretPosition = input.selectionStart ?? input.value.length;
    const numericCharactersBeforeCaret = countNumericCharacters(input.value.slice(0, caretPosition));
    const nextValue = normalizeNumber(input.value, allowDecimal);

    onValueChange(nextValue);

    const nextCaretPosition = findCaretPosition(formatNumber(nextValue), numericCharactersBeforeCaret);
    requestAnimationFrame(() => {
      if (inputRef.current === document.activeElement) {
        inputRef.current.setSelectionRange(nextCaretPosition, nextCaretPosition);
      }
    });
  };

  return (
    <input
      {...inputProps}
      ref={inputRef}
      type="text"
      dir="ltr"
      inputMode={inputMode}
      value={formatNumber(rawValue)}
      onChange={handleChange}
    />
  );
}
