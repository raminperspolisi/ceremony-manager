import { jalaliToGregorianISO, normalizeJalaliDate } from "./calendarDateUtils.js";

export function createReminderTimestamp(jalaliDate, time, eventDate) {
  const normalizedDate = normalizeJalaliDate(jalaliDate);
  if (!normalizedDate) throw new Error("تاریخ یادآوری شمسی معتبر نیست.");

  const [year, month, day] = normalizedDate.split("/").map(Number);
  const gregorianDate = jalaliToGregorianISO(year, month, day);
  if (!gregorianDate) throw new Error("تبدیل تاریخ یادآوری انجام نشد.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("ساعت یادآوری را به‌شکل ساعت:دقیقه وارد کنید.");
  }
  if (gregorianDate > String(eventDate || "").slice(0, 10)) {
    throw new Error("تاریخ یادآوری باید در روز مراسم یا قبل از آن باشد.");
  }

  const timestamp = new Date(`${gregorianDate}T${time}:00+03:30`);
  if (Number.isNaN(timestamp.getTime()) || timestamp.getTime() <= Date.now()) {
    throw new Error("زمان یادآوری باید در آینده باشد.");
  }
  return timestamp.toISOString();
}

export function formatReminderTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "زمان نامعتبر";
  const tehranDate = new Date(date.getTime() + 210 * 60 * 1000);
  const isoDate = `${tehranDate.getUTCFullYear()}-${String(tehranDate.getUTCMonth() + 1).padStart(2, "0")}-${String(tehranDate.getUTCDate()).padStart(2, "0")}`;
  const jalaliDate = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).formatToParts(new Date(`${isoDate}T00:00:00Z`));
  const jalaliParts = Object.fromEntries(
    jalaliDate
      .filter((part) => ["year", "month", "day"].includes(part.type))
      .map(({ type, value }) => [type, value]),
  );
  const hour = String(tehranDate.getUTCHours()).padStart(2, "0");
  const minute = String(tehranDate.getUTCMinutes()).padStart(2, "0");
  if (!jalaliParts.year || !jalaliParts.month || !jalaliParts.day) {
    return `${isoDate} ${hour}:${minute}`;
  }
  return `${jalaliParts.year}/${jalaliParts.month}/${jalaliParts.day} ${hour}:${minute}`;
}
