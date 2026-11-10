CREATE TABLE IF NOT EXISTS private.custom_event_telegram_reminders (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  remind_at timestamptz NOT NULL,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, event_id, remind_at)
);
ALTER TABLE private.custom_event_telegram_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.custom_event_telegram_reminders
  FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS custom_event_telegram_reminders_due_idx
  ON private.custom_event_telegram_reminders (remind_at, claimed_at)
  WHERE sent_at IS NULL;

CREATE OR REPLACE FUNCTION public.list_telegram_event_reminders(
  p_organization_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_reminders jsonb;
  v_connected boolean;
BEGIN
  IF v_user_id IS NULL
    OR NOT public.is_organization_member(p_organization_id)
    OR NOT public.has_organization_section(p_organization_id, 'calendar')
    OR NOT EXISTS (
      SELECT 1
      FROM public.events AS event
      WHERE event.id = p_event_id
        AND event.organization_id = p_organization_id
    ) THEN
    RAISE EXCEPTION 'برای مدیریت یادآوری به دسترسی تقویم این مراسم نیاز دارید.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM private.event_telegram_links AS link
    WHERE link.organization_id = p_organization_id
      AND link.user_id = v_user_id
  ) INTO v_connected;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', reminder.id, 'remind_at', reminder.remind_at)
      ORDER BY reminder.remind_at
    ),
    '[]'::jsonb
  )
  INTO v_reminders
  FROM private.custom_event_telegram_reminders AS reminder
  WHERE reminder.organization_id = p_organization_id
    AND reminder.user_id = v_user_id
    AND reminder.event_id = p_event_id
    AND reminder.sent_at IS NULL;

  RETURN jsonb_build_object(
    'connected', v_connected,
    'reminders', v_reminders
  );
END;
$function$;

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
  IF to_char((p_remind_at AT TIME ZONE 'Asia/Tehran')::date, 'YYYY-MM-DD') > v_event_date THEN
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

CREATE OR REPLACE FUNCTION public.delete_telegram_event_reminder(
  p_organization_id uuid,
  p_reminder_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.is_organization_member(p_organization_id)
    OR NOT public.has_organization_section(p_organization_id, 'calendar') THEN
    RAISE EXCEPTION 'برای حذف یادآوری به دسترسی تقویم نیاز دارید.';
  END IF;

  DELETE FROM private.custom_event_telegram_reminders
  WHERE id = p_reminder_id
    AND organization_id = p_organization_id
    AND user_id = auth.uid()
    AND sent_at IS NULL;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_custom_telegram_event_reminder(
  p_reminder_secret text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_expected_hash text;
  v_reminder private.custom_event_telegram_reminders%ROWTYPE;
  v_link private.event_telegram_links%ROWTYPE;
  v_event public.events%ROWTYPE;
BEGIN
  SELECT config.secret_hash
  INTO v_expected_hash
  FROM private.telegram_reminder_config AS config
  WHERE config.singleton;
  IF v_expected_hash IS NULL OR encode(
    extensions.digest(convert_to(COALESCE(p_reminder_secret, ''), 'UTF8'), 'sha256'),
    'hex'
  ) IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION 'اعتبار دسترسی اعلان تلگرام معتبر نیست.';
  END IF;

  SELECT reminder.*
  INTO v_reminder
  FROM private.custom_event_telegram_reminders AS reminder
  JOIN private.event_telegram_links AS link
    ON link.organization_id = reminder.organization_id
   AND link.user_id = reminder.user_id
  JOIN public.organization_memberships AS membership
    ON membership.organization_id = reminder.organization_id
   AND membership.user_id = reminder.user_id
   AND (
     membership.role IN ('owner', 'admin')
     OR membership.section_permissions -> 'calendar' = 'true'::jsonb
   )
  WHERE reminder.remind_at <= now()
    AND reminder.sent_at IS NULL
    AND (
      reminder.claimed_at IS NULL
      OR reminder.claimed_at < now() - interval '5 minutes'
    )
  ORDER BY reminder.remind_at, reminder.created_at
  LIMIT 1
  FOR UPDATE OF reminder SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE private.custom_event_telegram_reminders
  SET claimed_at = now()
  WHERE id = v_reminder.id;

  SELECT link.* INTO v_link
  FROM private.event_telegram_links AS link
  WHERE link.organization_id = v_reminder.organization_id
    AND link.user_id = v_reminder.user_id;
  SELECT event.* INTO v_event
  FROM public.events AS event
  WHERE event.id = v_reminder.event_id
    AND event.organization_id = v_reminder.organization_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_reminder.id,
    'chat_id', v_link.chat_id,
    'customer_name', v_event.customer_name,
    'event_type', v_event.event_type,
    'event_date', v_event.event_date,
    'remind_at', v_reminder.remind_at,
    'pending_task_count', (
      SELECT count(*)
      FROM public.event_tasks AS task
      WHERE task.event_id = v_event.id
        AND task.organization_id = v_event.organization_id
        AND NOT task.completed
    ),
    'pending_tasks', COALESCE((
      SELECT jsonb_agg(pending.title ORDER BY pending.created_at)
      FROM (
        SELECT task.title, task.created_at
        FROM public.event_tasks AS task
        WHERE task.event_id = v_event.id
          AND task.organization_id = v_event.organization_id
          AND NOT task.completed
        ORDER BY task.created_at
        LIMIT 15
      ) AS pending
    ), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_custom_telegram_event_reminder(
  p_reminder_id uuid,
  p_sent boolean,
  p_reminder_secret text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_expected_hash text;
BEGIN
  SELECT config.secret_hash
  INTO v_expected_hash
  FROM private.telegram_reminder_config AS config
  WHERE config.singleton;
  IF v_expected_hash IS NULL OR encode(
    extensions.digest(convert_to(COALESCE(p_reminder_secret, ''), 'UTF8'), 'sha256'),
    'hex'
  ) IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION 'اعتبار دسترسی اعلان تلگرام معتبر نیست.';
  END IF;

  UPDATE private.custom_event_telegram_reminders
  SET claimed_at = CASE WHEN p_sent THEN claimed_at ELSE now() END,
      sent_at = CASE WHEN p_sent THEN now() ELSE NULL END
  WHERE id = p_reminder_id
    AND claimed_at IS NOT NULL
    AND sent_at IS NULL;
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_telegram_event_reminders(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_telegram_event_reminder(uuid, uuid, timestamptz)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_telegram_event_reminder(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_custom_telegram_event_reminder(text)
  FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.finish_custom_telegram_event_reminder(uuid, boolean, text)
  FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.list_telegram_event_reminders(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_telegram_event_reminder(uuid, uuid, timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_telegram_event_reminder(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_custom_telegram_event_reminder(text)
  TO anon;
GRANT EXECUTE ON FUNCTION public.finish_custom_telegram_event_reminder(uuid, boolean, text)
  TO anon;
