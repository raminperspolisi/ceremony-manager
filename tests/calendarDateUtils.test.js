import test from "node:test";
import assert from "node:assert/strict";
import {
  gregorianISOToJalali,
  jalaliToGregorianISO,
  normalizeJalaliDate,
  toGregorianISODate,
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

test("calendar dates normalize Jalali and Gregorian values before storage", () => {
  assert.equal(toGregorianISODate("۱۴۰۵/۰۸/۱۸"), "2026-11-09");
  assert.equal(toGregorianISODate("1405-08-18"), "2026-11-09");
  assert.equal(toGregorianISODate("2026-11-09"), "2026-11-09");
  assert.equal(toGregorianISODate("2026-02-30"), null);
  assert.equal(toGregorianISODate("۱۴۰۵/۱۳/۱۸"), null);
});
