import test from "node:test";
import assert from "node:assert/strict";
import {
  gregorianISOToJalali,
  jalaliToGregorianISO,
  normalizeJalaliDate,
} from "../src/calendarDateUtils.js";

test("calendar dates convert between Gregorian and Jalali without changing the displayed day", () => {
  assert.equal(gregorianISOToJalali("2026-11-09"), "1405/08/18");
  assert.equal(jalaliToGregorianISO(1405, 8, 18), "2026-11-09");
  assert.equal(normalizeJalaliDate(new Date(2026, 10, 9, 12)), "1405/08/18");
});

test("calendar date input accepts Persian numerals and rejects invalid Jalali dates", () => {
  assert.equal(normalizeJalaliDate("۱۴۰۵/۰۸/۱۸"), "1405/08/18");
  assert.equal(normalizeJalaliDate("1405-08-18"), "1405/08/18");
  assert.equal(normalizeJalaliDate("۱۴۰۵/۱۳/۱۸"), "");
  assert.equal(normalizeJalaliDate("1405/12/30"), "");
  assert.equal(jalaliToGregorianISO(1405, 13, 18), null);
});
