import test from "node:test";
import assert from "node:assert/strict";
import { gregorianISOToJalali } from "../src/calendarDateUtils.js";
import {
  createReminderTimestamp,
  formatReminderTimestamp,
} from "../src/telegramReminderUtils.js";

const gregorianDateAfter = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

test("custom reminder input stores the selected Jalali date and Tehran time", () => {
  const reminderGregorianDate = gregorianDateAfter(3);
  const reminderJalaliDate = gregorianISOToJalali(reminderGregorianDate);
  const eventDate = gregorianDateAfter(5);
  const reminder = createReminderTimestamp(reminderJalaliDate, "09:15", eventDate);

  assert.equal(
    reminder,
    new Date(`${reminderGregorianDate}T09:15:00+03:30`).toISOString(),
  );
  assert.equal(formatReminderTimestamp(reminder), `${reminderJalaliDate} 09:15`);
});

test("custom reminders reject invalid times and dates after the ceremony", () => {
  const eventDate = gregorianDateAfter(5);
  assert.throws(
    () => createReminderTimestamp(gregorianISOToJalali(gregorianDateAfter(3)), "25:00", eventDate),
    /ساعت یادآوری/,
  );
  assert.throws(
    () => createReminderTimestamp(gregorianISOToJalali(gregorianDateAfter(6)), "09:00", eventDate),
    /روز مراسم یا قبل/,
  );
});
