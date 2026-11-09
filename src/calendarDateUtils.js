import moment from "jalali-moment";

const toAsciiDigits = (value) => String(value).replace(/[۰-۹٠-٩]/g, (digit) => (
  "۰۱۲۳۴۵۶۷۸۹".includes(digit)
    ? "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)
    : "٠١٢٣٤٥٦٧٨٩".indexOf(digit)
));

export function normalizeJalaliDate(input) {
  if (input === null || input === undefined || input === "") return "";
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return moment(input).locale("fa").format("jYYYY/jMM/jDD");
  }

  let value = toAsciiDigits(input).trim();
  value = value.replace(/[\u002f\u002d.\u060c\s]+/g, "/").replace(/^\/+|\/+$/g, "");

  if (/^\d{8}$/.test(value)) value = `${value.slice(0, 4)}/${value.slice(4, 6)}/${value.slice(6, 8)}`;
  if (/^\d{6}$/.test(value)) value = `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4, 6)}`;

  const parts = value.split("/").filter(Boolean);
  if (parts.length !== 3) return "";

  let [year, month, day] = parts.map((part) => part.replace(/\D/g, ""));
  if (year.length === 2) year = `13${year}`;
  if (year.length === 3) year = `1${year}`;
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) return "";

  const normalized = `${year}/${month.padStart(2, "0")}/${day.padStart(2, "0")}`;
  if (Number(year) < 1300 || Number(year) > 1500) return "";

  const parsed = moment(normalized, "jYYYY/jMM/jDD", true);
  return parsed.isValid() && parsed.format("jYYYY/jMM/jDD") === normalized ? normalized : "";
}

export function jalaliToGregorianISO(jy, jm, jd) {
  const jalaliDate = normalizeJalaliDate(`${jy}/${jm}/${jd}`);
  if (!jalaliDate) return null;

  const parsed = moment(jalaliDate, "jYYYY/jMM/jDD", true);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : null;
}

export function gregorianISOToJalali(iso) {
  if (!iso) return "";
  const parsed = moment(iso);
  return parsed.isValid() ? parsed.locale("fa").format("jYYYY/jMM/jDD") : "";
}
