CREATE OR REPLACE FUNCTION private.jalali_date_to_gregorian(p_jalali_date text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
DECLARE
  v_parts text[];
  v_jy integer;
  v_jm integer;
  v_jd integer;
  v_j_day_no integer;
  v_next_year_day_no integer;
  v_g_day_no integer;
  v_gy integer;
  v_days_in_year integer;
  v_leap boolean := true;
BEGIN
  v_parts := string_to_array(replace(p_jalali_date, '-', '/'), '/');
  IF array_length(v_parts, 1) <> 3
    OR length(v_parts[1]) <> 4
    OR length(v_parts[2]) NOT BETWEEN 1 AND 2
    OR length(v_parts[3]) NOT BETWEEN 1 AND 2
    OR left(v_parts[1], 2) NOT IN ('13', '14')
    OR v_parts[1] ~ '[^0-9]'
    OR v_parts[2] ~ '[^0-9]'
    OR v_parts[3] ~ '[^0-9]' THEN
    RETURN NULL;
  END IF;

  v_jy := v_parts[1]::integer - 979;
  v_jm := v_parts[2]::integer;
  v_jd := v_parts[3]::integer;
  IF v_jm NOT BETWEEN 1 AND 12
    OR v_jd NOT BETWEEN 1 AND 31
    OR (v_jm BETWEEN 7 AND 12 AND v_jd > 30)
    OR (v_jm BETWEEN 1 AND 6 AND v_jd > 31) THEN
    RETURN NULL;
  END IF;
  IF v_jm = 12 AND v_jd = 30 THEN
    v_next_year_day_no := 365 * (v_jy + 1)
      + ((v_jy + 1) / 33) * 8
      + (((v_jy + 1) % 33 + 3) / 4);
    IF v_next_year_day_no - (
      365 * v_jy + (v_jy / 33) * 8 + ((v_jy % 33 + 3) / 4)
    ) = 365 THEN
      RETURN NULL;
    END IF;
  END IF;

  v_j_day_no := 365 * v_jy
    + (v_jy / 33) * 8
    + ((v_jy % 33 + 3) / 4);
  IF v_jm <= 6 THEN
    v_j_day_no := v_j_day_no + (v_jm - 1) * 31;
  ELSE
    v_j_day_no := v_j_day_no + 6 * 31 + (v_jm - 7) * 30;
  END IF;
  v_j_day_no := v_j_day_no + v_jd - 1;
  v_g_day_no := v_j_day_no + 79;

  v_gy := 1600 + 400 * (v_g_day_no / 146097);
  v_g_day_no := v_g_day_no % 146097;
  IF v_g_day_no >= 36525 THEN
    v_g_day_no := v_g_day_no - 1;
    v_gy := v_gy + 100 * (v_g_day_no / 36524);
    v_g_day_no := v_g_day_no % 36524;
    IF v_g_day_no >= 365 THEN
      v_g_day_no := v_g_day_no + 1;
    ELSE
      v_leap := false;
    END IF;
  END IF;

  v_gy := v_gy + 4 * (v_g_day_no / 1461);
  v_g_day_no := v_g_day_no % 1461;
  IF v_g_day_no >= 366 THEN
    v_leap := false;
    v_g_day_no := v_g_day_no - 1;
    v_gy := v_gy + v_g_day_no / 365;
    v_g_day_no := v_g_day_no % 365;
  END IF;

  IF v_leap THEN
    v_days_in_year := 366;
  ELSE
    v_days_in_year := 365;
  END IF;
  IF v_g_day_no < 0 OR v_g_day_no >= v_days_in_year THEN
    RETURN NULL;
  END IF;
  RETURN make_date(v_gy, 1, 1) + v_g_day_no;
END;
$function$;

REVOKE ALL ON FUNCTION private.jalali_date_to_gregorian(text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_telegram_event_reminder(
  p_organization_id uuid,
  p_event_id uuid,
  p_remind_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_event_date text;
  v_event_date_gregorian date;
  v_reminder_id uuid;
BEGIN
  IF v_user_id IS NULL
    OR NOT public.is_organization_member(p_organization_id)
    OR NOT public.has_organization_section(p_organization_id, 'calendar') THEN
    RAISE EXCEPTION 'برای تنظیم یادآوری به دسترسی تقویم نیاز دارید.';
  END IF;
  IF p_remind_at IS NULL OR p_remind_at <= now() THEN
    RAISE EXCEPTION 'زمان یادآوری باید در آینده باشد.';
  END IF;

  SELECT event.event_date
  INTO v_event_date
  FROM public.events AS event
  WHERE event.id = p_event_id
    AND event.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'مراسم در فضای کاری انتخاب‌شده پیدا نشد.';
  END IF;

  IF left(v_event_date, 2) IN ('13', '14')
    THEN v_event_date_gregorian := private.jalali_date_to_gregorian(v_event_date);
  ELSE
    v_event_date_gregorian := left(v_event_date, 10)::date;
  END IF;
  IF v_event_date_gregorian IS NULL THEN
    RAISE EXCEPTION 'تاریخ مراسم در قالب قابل‌شناسایی نیست.';
  END IF;
  IF (p_remind_at AT TIME ZONE 'Asia/Tehran')::date > v_event_date_gregorian THEN
    RAISE EXCEPTION 'تاریخ یادآوری باید در روز مراسم یا قبل از آن باشد.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM private.event_telegram_links AS link
    WHERE link.organization_id = p_organization_id
      AND link.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'ابتدا تلگرام را از بخش پروفایل به فضای کاری وصل کنید.';
  END IF;
  IF (
    SELECT count(*)
    FROM private.custom_event_telegram_reminders AS reminder
    WHERE reminder.organization_id = p_organization_id
      AND reminder.user_id = v_user_id
      AND reminder.event_id = p_event_id
      AND reminder.sent_at IS NULL
  ) >= 20 THEN
    RAISE EXCEPTION 'برای هر مراسم حداکثر ۲۰ یادآوری فعال می‌توانید ثبت کنید.';
  END IF;

  INSERT INTO private.custom_event_telegram_reminders (
    organization_id, user_id, event_id, remind_at
  )
  VALUES (p_organization_id, v_user_id, p_event_id, p_remind_at)
  ON CONFLICT (organization_id, user_id, event_id, remind_at)
  DO UPDATE SET remind_at = EXCLUDED.remind_at
  RETURNING id INTO v_reminder_id;

  RETURN jsonb_build_object(
    'id', v_reminder_id,
    'remind_at', p_remind_at
  );
END;
$function$;
