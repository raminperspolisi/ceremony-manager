import moment from 'jalali-moment';

const formatPersianDigits = (value) => String(value ?? '')
  .replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);

const normalizeDigits = (value) => String(value ?? '')
  .replace(/[۰-۹]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))
  .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit));

const parseDashboardDate = (value) => {
  if (!value) return null;
  const normalized = normalizeDigits(value).trim();
  if (/^1[34]\d{2}[/-]/.test(normalized)) {
    const parsed = moment(normalized.replace(/-/g, '/'), 'jYYYY/jM/jD', true);
    return parsed.isValid() ? parsed : null;
  }
  const isoDate = moment(normalized, 'YYYY-MM-DD', true);
  if (isoDate.isValid()) return isoDate;
  const slashDate = moment(normalized, 'YYYY/M/D', true);
  if (slashDate.isValid()) return slashDate;
  if (moment.ISO_8601) {
    const isoTimestamp = moment(normalized, moment.ISO_8601, true);
    if (isoTimestamp.isValid()) return isoTimestamp;
  }
  return null;
};

export const toDashboardIsoDate = (value) => parseDashboardDate(value)?.format('YYYY-MM-DD') || '';

export const formatDashboardDate = (value) => {
  const parsed = parseDashboardDate(value);
  return parsed ? formatPersianDigits(parsed.locale('fa').format('jYYYY/jMM/jDD')) : 'تاریخ ثبت نشده';
};

export const getPendingEventTasks = (tasks, events, today, limit = 8) => {
  const eventById = new Map((events || []).map((event) => [String(event.id), event]));
  const pendingTasks = (tasks || [])
    .filter((task) => !task.completed)
    .map((task) => {
      const event = eventById.get(String(task.event_id));
      if (!event) return null;
      return {
        ...task,
        event_date: event.event_date,
        event_date_iso: toDashboardIsoDate(event.event_date),
        event_type: event.event_type || 'مراسم',
        customer_name: event.customer_name || 'مشتری ثبت‌نشده',
      };
    })
    .filter(Boolean);

  return pendingTasks
    .sort((first, second) => {
      const firstDate = first.event_date_iso;
      const secondDate = second.event_date_iso;
      const firstOverdue = Boolean(firstDate && firstDate < today);
      const secondOverdue = Boolean(secondDate && secondDate < today);
      if (firstOverdue !== secondOverdue) return firstOverdue ? -1 : 1;
      if (firstOverdue) return secondDate.localeCompare(firstDate);
      if (firstDate && secondDate) return firstDate.localeCompare(secondDate);
      if (firstDate) return -1;
      if (secondDate) return 1;
      return String(first.id).localeCompare(String(second.id));
    })
    .slice(0, limit);
};
