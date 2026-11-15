CREATE TABLE IF NOT EXISTS private.workspace_task_telegram_reminders (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.workspace_tasks(id) ON DELETE CASCADE,
  remind_at timestamptz NOT NULL,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, task_id)
);

WITH ranked_reminders AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY organization_id, user_id, task_id
      ORDER BY created_at DESC, id DESC
    ) AS reminder_rank
  FROM private.workspace_task_telegram_reminders
)
DELETE FROM private.workspace_task_telegram_reminders AS reminder
USING ranked_reminders
WHERE reminder.id = ranked_reminders.id
  AND ranked_reminders.reminder_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS workspace_task_telegram_reminders_task_key
  ON private.workspace_task_telegram_reminders (organization_id, user_id, task_id);

ALTER TABLE private.workspace_task_telegram_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.workspace_task_telegram_reminders
  FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS workspace_task_telegram_reminders_due_idx
  ON private.workspace_task_telegram_reminders (remind_at, claimed_at)
  WHERE sent_at IS NULL;

CREATE OR REPLACE FUNCTION public.list_telegram_workspace_task_reminders(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_connected boolean;
  v_reminders jsonb;
BEGIN
  IF v_user_id IS NULL
    OR NOT public.is_organization_member(p_organization_id)
    OR NOT public.has_organization_section(p_organization_id, 'dashboard') THEN
    RAISE EXCEPTION 'برای مدیریت اعلان‌های دفترچه به دسترسی داشبورد نیاز دارید.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM private.event_telegram_links AS link
    WHERE link.organization_id = p_organization_id
      AND link.user_id = v_user_id
  ) INTO v_connected;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', reminder.id,
        'task_id', reminder.task_id,
        'remind_at', reminder.remind_at
      )
      ORDER BY reminder.remind_at
    ),
    '[]'::jsonb
  )
  INTO v_reminders
  FROM private.workspace_task_telegram_reminders AS reminder
  JOIN public.workspace_tasks AS task
    ON task.id = reminder.task_id
   AND task.organization_id = reminder.organization_id
  WHERE reminder.organization_id = p_organization_id
    AND reminder.user_id = v_user_id
    AND reminder.sent_at IS NULL
    AND NOT task.completed;

  RETURN jsonb_build_object(
    'connected', v_connected,
    'reminders', v_reminders
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_workspace_task_with_telegram_reminder(
  p_organization_id uuid,
  p_title text,
  p_notes text,
  p_remind_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_task public.workspace_tasks%ROWTYPE;
  v_reminder_id uuid;
BEGIN
  IF v_user_id IS NULL
    OR NOT public.is_organization_member(p_organization_id)
    OR NOT public.has_organization_section(p_organization_id, 'dashboard') THEN
    RAISE EXCEPTION 'برای افزودن کار به دسترسی داشبورد نیاز دارید.';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 180 THEN
    RAISE EXCEPTION 'عنوان کار باید بین ۱ تا ۱۸۰ نویسه باشد.';
  END IF;
  IF p_notes IS NOT NULL AND length(p_notes) > 2000 THEN
    RAISE EXCEPTION 'یادداشت کار حداکثر می‌تواند ۲۰۰۰ نویسه باشد.';
  END IF;
  IF p_remind_at IS NULL OR p_remind_at <= now() THEN
    RAISE EXCEPTION 'زمان اعلان باید در آینده باشد.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM private.event_telegram_links AS link
    WHERE link.organization_id = p_organization_id
      AND link.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'ابتدا تلگرام را از بخش پروفایل به فضای کاری وصل کنید.';
  END IF;

  INSERT INTO public.workspace_tasks (organization_id, title, notes)
  VALUES (p_organization_id, btrim(p_title), NULLIF(btrim(COALESCE(p_notes, '')), ''))
  RETURNING * INTO v_task;

  INSERT INTO private.workspace_task_telegram_reminders (
    organization_id, user_id, task_id, remind_at
  )
  VALUES (p_organization_id, v_user_id, v_task.id, p_remind_at)
  RETURNING id INTO v_reminder_id;

  RETURN jsonb_build_object(
    'task', to_jsonb(v_task),
    'reminder', jsonb_build_object(
      'id', v_reminder_id,
      'task_id', v_task.id,
      'remind_at', p_remind_at
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_telegram_workspace_task_reminder(
  p_organization_id uuid,
  p_task_id uuid,
  p_remind_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_reminder_id uuid;
BEGIN
  IF v_user_id IS NULL
    OR NOT public.is_organization_member(p_organization_id)
    OR NOT public.has_organization_section(p_organization_id, 'dashboard') THEN
    RAISE EXCEPTION 'برای تنظیم اعلان به دسترسی داشبورد نیاز دارید.';
  END IF;
  IF p_remind_at IS NULL OR p_remind_at <= now() THEN
    RAISE EXCEPTION 'زمان اعلان باید در آینده باشد.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_tasks AS task
    WHERE task.id = p_task_id
      AND task.organization_id = p_organization_id
      AND NOT task.completed
  ) THEN
    RAISE EXCEPTION 'کار در فضای کاری انتخاب‌شده پیدا نشد یا قبلاً انجام شده است.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM private.event_telegram_links AS link
    WHERE link.organization_id = p_organization_id
      AND link.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'ابتدا تلگرام را از بخش پروفایل به فضای کاری وصل کنید.';
  END IF;

  INSERT INTO private.workspace_task_telegram_reminders (
    organization_id, user_id, task_id, remind_at
  )
  VALUES (p_organization_id, v_user_id, p_task_id, p_remind_at)
  ON CONFLICT (organization_id, user_id, task_id)
  DO UPDATE SET
    remind_at = EXCLUDED.remind_at,
    claimed_at = NULL,
    sent_at = NULL
  RETURNING id INTO v_reminder_id;

  RETURN jsonb_build_object(
    'id', v_reminder_id,
    'task_id', p_task_id,
    'remind_at', p_remind_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_telegram_workspace_task_reminder(
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
    OR NOT public.has_organization_section(p_organization_id, 'dashboard') THEN
    RAISE EXCEPTION 'برای حذف اعلان به دسترسی داشبورد نیاز دارید.';
  END IF;

  DELETE FROM private.workspace_task_telegram_reminders
  WHERE id = p_reminder_id
    AND organization_id = p_organization_id
    AND user_id = auth.uid()
    AND sent_at IS NULL;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_telegram_workspace_task_reminder(
  p_reminder_secret text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_expected_hash text;
  v_reminder private.workspace_task_telegram_reminders%ROWTYPE;
  v_task public.workspace_tasks%ROWTYPE;
  v_link private.event_telegram_links%ROWTYPE;
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
  FROM private.workspace_task_telegram_reminders AS reminder
  JOIN public.workspace_tasks AS task
    ON task.id = reminder.task_id
   AND task.organization_id = reminder.organization_id
   AND NOT task.completed
  JOIN private.event_telegram_links AS link
    ON link.organization_id = reminder.organization_id
   AND link.user_id = reminder.user_id
  JOIN public.organization_memberships AS membership
    ON membership.organization_id = reminder.organization_id
   AND membership.user_id = reminder.user_id
   AND (
     membership.role IN ('owner', 'admin')
     OR membership.section_permissions -> 'dashboard' = 'true'::jsonb
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

  UPDATE private.workspace_task_telegram_reminders
  SET claimed_at = now()
  WHERE id = v_reminder.id;

  SELECT task.* INTO v_task
  FROM public.workspace_tasks AS task
  WHERE task.id = v_reminder.task_id
    AND task.organization_id = v_reminder.organization_id;
  SELECT link.* INTO v_link
  FROM private.event_telegram_links AS link
  WHERE link.organization_id = v_reminder.organization_id
    AND link.user_id = v_reminder.user_id;

  RETURN jsonb_build_object(
    'id', v_reminder.id,
    'chat_id', v_link.chat_id,
    'title', v_task.title,
    'notes', v_task.notes,
    'remind_at', v_reminder.remind_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_telegram_workspace_task_reminder(
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

  UPDATE private.workspace_task_telegram_reminders
  SET claimed_at = CASE WHEN p_sent THEN claimed_at ELSE now() END,
      sent_at = CASE WHEN p_sent THEN now() ELSE NULL END
  WHERE id = p_reminder_id
    AND claimed_at IS NOT NULL
    AND sent_at IS NULL;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION private.cancel_completed_workspace_task_telegram_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.completed AND NOT OLD.completed THEN
    DELETE FROM private.workspace_task_telegram_reminders
    WHERE task_id = NEW.id
      AND organization_id = NEW.organization_id
      AND sent_at IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS cancel_completed_workspace_task_telegram_reminders
  ON public.workspace_tasks;
CREATE TRIGGER cancel_completed_workspace_task_telegram_reminders
AFTER UPDATE OF completed ON public.workspace_tasks
FOR EACH ROW
EXECUTE FUNCTION private.cancel_completed_workspace_task_telegram_reminders();

REVOKE ALL ON FUNCTION public.list_telegram_workspace_task_reminders(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_workspace_task_with_telegram_reminder(uuid, text, text, timestamptz)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_telegram_workspace_task_reminder(uuid, uuid, timestamptz)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_telegram_workspace_task_reminder(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_telegram_workspace_task_reminder(text)
  FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.finish_telegram_workspace_task_reminder(uuid, boolean, text)
  FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.list_telegram_workspace_task_reminders(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace_task_with_telegram_reminder(uuid, text, text, timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_telegram_workspace_task_reminder(uuid, uuid, timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_telegram_workspace_task_reminder(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_telegram_workspace_task_reminder(text)
  TO anon;
GRANT EXECUTE ON FUNCTION public.finish_telegram_workspace_task_reminder(uuid, boolean, text)
  TO anon;