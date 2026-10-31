import React, { useRef } from 'react';
import { formatGroupedNumber, normalizeNumber } from '../numberUtils';

const countNumericCharacters = (value) => (value.match(/[0-9۰-۹٠-٩.]/g) || []).length;

const findCaretPosition = (value, numericCharacterCount) => {
  if (numericCharacterCount === 0) return 0;
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/[0-9۰-۹٠-٩.]/.test(value[index])) count += 1;
    if (count === numericCharacterCount) return index + 1;
  }
  return value.length;
};

export default function FormattedNumberInput({
  value,
  onValueChange,
  allowDecimal = true,
  allowNegative = false,
  emptyWhenZero = false,
  inputMode = 'decimal',
  ...inputProps
}) {
  const inputRef = useRef(null);
  const normalizedValue = normalizeNumber(value ?? '', allowDecimal, allowNegative);
  const rawValue = emptyWhenZero && Number(normalizedValue) === 0 ? '' : normalizedValue;

  const handleChange = (event) => {
    const input = event.currentTarget;
    const caretPosition = input.selectionStart ?? input.value.length;
    const numericCharactersBeforeCaret = countNumericCharacters(input.value.slice(0, caretPosition));
    const nextValue = normalizeNumber(input.value, allowDecimal, allowNegative);

    onValueChange(nextValue);

    const nextCaretPosition = findCaretPosition(formatGroupedNumber(nextValue), numericCharactersBeforeCaret);
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
      value={formatGroupedNumber(rawValue)}
      onChange={handleChange}
    />
  );
}
