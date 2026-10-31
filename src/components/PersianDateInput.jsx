import React from 'react';
import datePickerModule from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import gregorian from 'react-date-object/calendars/gregorian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { toAsciiDigits } from '../dateUtils';

const DatePicker = datePickerModule.default ?? datePickerModule;
const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const toLocalDate = (value) => {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12);
};

export default function PersianDateInput({
  value,
  onChange,
  className = '',
  ...inputProps
}) {
  return (
    <DatePicker
      value={toLocalDate(value)}
      calendar={persian}
      locale={persian_fa}
      digits={persianDigits}
      format="YYYY/MM/DD"
      calendarPosition="bottom-right"
      className="persian-date-calendar"
      inputClass={`persian-date-input ${className}`.trim()}
      inputMode="numeric"
      placeholder="مثلاً ۱۴۰۵/۰۸/۰۹"
      onChange={(date) => {
        onChange(date ? toAsciiDigits(date.convert(gregorian).format('YYYY-MM-DD')) : '');
      }}
      {...inputProps}
    />
  );
}
