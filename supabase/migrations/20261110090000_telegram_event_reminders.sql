CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.telegram_reminder_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  secret_hash text NOT NULL
);
REVOKE ALL ON TABLE private.telegram_reminder_config
  FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.event_telegram_links (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id text NOT NULL,
  telegram_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id),
  UNIQUE (organization_id, chat_id)
);
REVOKE ALL ON TABLE private.event_telegram_links
  FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.event_telegram_link_tokens (
  token_hash text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.event_telegram_link_tokens
  FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.event_telegram_reminder_queue (
  link_id uuid NOT NULL REFERENCES private.event_telegram_links(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_date text NOT NULL CHECK (event_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  days_before smallint NOT NULL CHECK (days_before IN (1, 7)),
  claimed_at timestamptz,
  sent_at timestamptz,
  PRIMARY KEY (link_id, event_id, event_date, days_before)
);
REVOKE ALL ON TABLE private.event_telegram_reminder_queue
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_telegram_reminder_link(
  p_organization_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_token text;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.is_organization_member(p_organization_id)
    OR NOT public.has_organization_section(p_organization_id, 'calendar') THEN
    RAISE EXCEPTION 'برای اتصال اعلان تلگرام به دسترسی تقویم نیاز دارید.';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  DELETE FROM private.event_telegram_link_tokens
  WHERE expires_at <= now()
    OR (
      organization_id = p_organization_id
      AND user_id = auth.uid()
    );
  INSERT INTO private.event_telegram_link_tokens (
    token_hash, organization_id, user_id, expires_at
  )
  VALUES (
    encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
    p_organization_id,
    auth.uid(),
    now() + interval '15 minutes'
  );
  RETURN v_token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_telegram_reminder_link(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_link record;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.is_organization_member(p_organization_id)
    OR NOT public.has_organization_section(p_organization_id, 'calendar') THEN
    RAISE EXCEPTION 'برای مشاهدهٔ تنظیمات اعلان تلگرام به دسترسی تقویم نیاز دارید.';
  END IF;

  SELECT telegram_username, created_at
  INTO v_link
  FROM private.event_telegram_links
  WHERE organization_id = p_organization_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('connected', false);
  END IF;
  RETURN jsonb_build_object(
    'connected', true,
    'telegram_username', v_link.telegram_username,
    'created_at', v_link.created_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.unlink_telegram_reminder(
  p_organization_id uuid
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
    RAISE EXCEPTION 'برای قطع اتصال اعلان تلگرام به دسترسی تقویم نیاز دارید.';
  END IF;

  DELETE FROM private.event_telegram_links
  WHERE organization_id = p_organization_id
    AND user_id = auth.uid();
  DELETE FROM private.event_telegram_link_tokens
  WHERE organization_id = p_organization_id
    AND user_id = auth.uid();
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_telegram_reminder_link(
  p_token text,
  p_telegram_user_id text,
  p_chat_id text,
  p_telegram_username text,
  p_reminder_secret text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_expected_hash text;
  v_token_row record;
  v_link_id uuid;
BEGIN
  SELECT secret_hash INTO v_expected_hash
  FROM private.telegram_reminder_config
  WHERE singleton;
  IF v_expected_hash IS NULL OR encode(
    extensions.digest(convert_to(COALESCE(p_reminder_secret, ''), 'UTF8'), 'sha256'),
    'hex'
  ) IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION 'اعتبار دسترسی اعلان تلگرام معتبر نیست.';
  END IF;
  IF p_telegram_user_id IS NULL
    OR p_chat_id IS DISTINCT FROM p_telegram_user_id
    OR p_telegram_user_id !~ '^[0-9]{1,20}$'
    OR p_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'اطلاعات اتصال تلگرام معتبر نیست.';
  END IF;

  DELETE FROM private.event_telegram_link_tokens
  WHERE token_hash = encode(
      extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'),
      'hex'
    )
    AND expires_at > now()
  RETURNING organization_id, user_id INTO v_token_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'کد اتصال نامعتبر یا منقضی شده است؛ از برنامه کد تازه بگیرید.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships AS membership
    WHERE membership.organization_id = v_token_row.organization_id
      AND membership.user_id = v_token_row.user_id
      AND (
        membership.role IN ('owner', 'admin')
        OR membership.section_permissions -> 'calendar' = 'true'::jsonb
      )
  ) THEN
    RAISE EXCEPTION 'دسترسی تقویم این کاربر دیگر فعال نیست.';
  END IF;

  INSERT INTO private.event_telegram_links (
    organization_id, user_id, chat_id, telegram_username
  )
  VALUES (
    v_token_row.organization_id,
    v_token_row.user_id,
    p_chat_id,
    NULLIF(left(btrim(COALESCE(p_telegram_username, '')), 64), '')
  )
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET
    chat_id = EXCLUDED.chat_id,
    telegram_username = EXCLUDED.telegram_username,
    created_at = now()
  RETURNING id INTO v_link_id;
  RETURN jsonb_build_object('linked', true, 'link_id', v_link_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_telegram_event_reminder(
  p_reminder_secret text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_expected_hash text;
  v_reminder record;
  v_today date := (now() AT TIME ZONE 'Asia/Tehran')::date;
BEGIN
  SELECT secret_hash INTO v_expected_hash
  FROM private.telegram_reminder_config
  WHERE singleton;
  IF v_expected_hash IS NULL OR encode(
    extensions.digest(convert_to(COALESCE(p_reminder_secret, ''), 'UTF8'), 'sha256'),
    'hex'
  ) IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION 'اعتبار دسترسی اعلان تلگرام معتبر نیست.';
  END IF;

  INSERT INTO private.event_telegram_reminder_queue (
    link_id, event_id, event_date, days_before
  )
  SELECT link.id, event.id, event.event_date, reminder.days_before
  FROM private.event_telegram_links AS link
  JOIN public.organization_memberships AS membership
    ON membership.organization_id = link.organization_id
   AND membership.user_id = link.user_id
   AND (
     membership.role IN ('owner', 'admin')
     OR membership.section_permissions -> 'calendar' = 'true'::jsonb
   )
  JOIN public.events AS event
    ON event.organization_id = link.organization_id
  CROSS JOIN (VALUES (7::smallint), (1::smallint)) AS reminder(days_before)
  WHERE event.event_date = to_char(v_today + reminder.days_before, 'YYYY-MM-DD')
  ON CONFLICT (link_id, event_id, event_date, days_before) DO NOTHING;

  WITH candidate AS (
    SELECT queue.link_id, queue.event_id, queue.event_date, queue.days_before
    FROM private.event_telegram_reminder_queue AS queue
    JOIN public.events AS event
      ON event.id = queue.event_id
    WHERE queue.sent_at IS NULL
      AND event.event_date = queue.event_date
      AND queue.event_date = to_char(v_today + queue.days_before, 'YYYY-MM-DD')
      AND EXISTS (
        SELECT 1
        FROM private.event_telegram_links AS link
        JOIN public.organization_memberships AS membership
          ON membership.organization_id = link.organization_id
         AND membership.user_id = link.user_id
         AND (
           membership.role IN ('owner', 'admin')
           OR membership.section_permissions -> 'calendar' = 'true'::jsonb
         )
        WHERE link.id = queue.link_id
      )
      AND (
        queue.claimed_at IS NULL
        OR queue.claimed_at < now() - interval '5 minutes'
      )
    ORDER BY queue.days_before, queue.event_id
    LIMIT 1
    FOR UPDATE OF queue SKIP LOCKED
  )
  UPDATE private.event_telegram_reminder_queue AS queue
  SET claimed_at = now()
  FROM candidate
  WHERE queue.link_id = candidate.link_id
    AND queue.event_id = candidate.event_id
    AND queue.event_date = candidate.event_date
    AND queue.days_before = candidate.days_before
  RETURNING queue.* INTO v_reminder;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'link_id', v_reminder.link_id,
      'event_id', event.id,
      'days_before', v_reminder.days_before,
      'chat_id', link.chat_id,
      'telegram_username', link.telegram_username,
      'customer_name', event.customer_name,
      'event_type', event.event_type,
      'event_date', event.event_date,
      'pending_task_count', (
        SELECT count(*)
        FROM public.event_tasks AS task
        WHERE task.event_id = event.id
          AND task.organization_id = event.organization_id
          AND NOT task.completed
      ),
      'pending_tasks', COALESCE((
        SELECT jsonb_agg(pending.title ORDER BY pending.created_at)
        FROM (
          SELECT task.title, task.created_at
          FROM public.event_tasks AS task
          WHERE task.event_id = event.id
            AND task.organization_id = event.organization_id
            AND NOT task.completed
          ORDER BY task.created_at
          LIMIT 15
        ) AS pending
      ), '[]'::jsonb)
    )
    FROM private.event_telegram_links AS link
    JOIN public.events AS event
      ON event.organization_id = link.organization_id
    WHERE link.id = v_reminder.link_id
      AND event.id = v_reminder.event_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_telegram_event_reminder(
  p_link_id uuid,
  p_event_id uuid,
  p_event_date text,
  p_days_before smallint,
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
  SELECT secret_hash INTO v_expected_hash
  FROM private.telegram_reminder_config
  WHERE singleton;
  IF v_expected_hash IS NULL OR encode(
    extensions.digest(convert_to(COALESCE(p_reminder_secret, ''), 'UTF8'), 'sha256'),
    'hex'
  ) IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION 'اعتبار دسترسی اعلان تلگرام معتبر نیست.';
  END IF;

  UPDATE private.event_telegram_reminder_queue
  SET claimed_at = CASE WHEN p_sent THEN claimed_at ELSE now() END,
      sent_at = CASE WHEN p_sent THEN now() ELSE NULL END
  WHERE link_id = p_link_id
    AND event_id = p_event_id
    AND event_date = p_event_date
    AND days_before = p_days_before
    AND claimed_at IS NOT NULL
    AND sent_at IS NULL;
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_telegram_reminder_link(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_telegram_reminder_link(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlink_telegram_reminder(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_telegram_reminder_link(text, text, text, text, text)
  FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.claim_telegram_event_reminder(text)
  FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.finish_telegram_event_reminder(uuid, uuid, text, smallint, boolean, text)
  FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.create_telegram_reminder_link(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_telegram_reminder_link(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_telegram_reminder(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_telegram_reminder_link(text, text, text, text, text)
  TO anon;
GRANT EXECUTE ON FUNCTION public.claim_telegram_event_reminder(text)
  TO anon;
GRANT EXECUTE ON FUNCTION public.finish_telegram_event_reminder(uuid, uuid, text, smallint, boolean, text)
  TO anon;
