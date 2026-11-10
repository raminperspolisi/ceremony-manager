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
  const eventDateGregorian = gregorianDateAfter(5);
  const eventDateJalali = gregorianISOToJalali(eventDateGregorian);
  const reminder = createReminderTimestamp(reminderJalaliDate, "09:15", eventDateJalali);

  assert.equal(
    reminder,
    new Date(`${reminderGregorianDate}T09:15:00+03:30`).toISOString(),
  );
  assert.equal(formatReminderTimestamp(reminder), `${reminderJalaliDate} 09:15`);

  assert.equal(
    createReminderTimestamp(
      reminderJalaliDate,
      "09:15",
      eventDateGregorian,
    ),
    reminder,
  );
});

test("custom reminders reject invalid times and dates after the ceremony", () => {
  const eventDateGregorian = gregorianDateAfter(5);
  const eventDateJalali = gregorianISOToJalali(eventDateGregorian);
  assert.throws(
    () => createReminderTimestamp(gregorianISOToJalali(gregorianDateAfter(3)), "25:00", eventDateJalali),
    /ساعت یادآوری/,
  );
  assert.throws(
    () => createReminderTimestamp(
      gregorianISOToJalali(gregorianDateAfter(6)),
      "09:00",
      eventDateJalali,
    ),
    /روز مراسم یا قبل/,
  );
});
