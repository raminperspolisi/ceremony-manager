CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

ALTER TABLE public.bot_orders
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS payment_notification_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS bot_orders_payment_notification_idx
  ON public.bot_orders (created_at, id)
  WHERE status = 'approved'
    AND payment_notified_at IS NULL;

CREATE TABLE IF NOT EXISTS private.bot_order_customer_states (
  order_id bigint PRIMARY KEY REFERENCES public.bot_orders (id) ON DELETE CASCADE,
  telegram_user_id text NOT NULL,
  state text NOT NULL CHECK (state = 'awaiting_address'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.bot_order_customer_states
  FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS bot_order_customer_states_user_idx
  ON private.bot_order_customer_states (telegram_user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.claim_bot_order_payment_notification(
  p_approval_secret text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_expected_hash text;
  v_order record;
  v_payment_card text;
  v_payment_holder text;
  v_payment_bank text;
BEGIN
  SELECT config.secret_hash
  INTO v_expected_hash
  FROM private.bot_approval_config AS config
  WHERE config.singleton;

  IF v_expected_hash IS NULL
    OR encode(
      extensions.digest(
        convert_to(COALESCE(p_approval_secret, ''), 'UTF8'),
        'sha256'
      ),
      'hex'
    ) IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION 'اعتبار دسترسی ربات برای مدیریت سفارش معتبر نیست.';
  END IF;

  SELECT orders.id,
         orders.telegram_user_id,
         orders.total_price
  INTO v_order
  FROM public.bot_orders AS orders
  WHERE orders.status = 'approved'
    AND orders.total_price IS NOT NULL
    AND orders.payment_notified_at IS NULL
    AND (
      orders.payment_notification_claimed_at IS NULL
      OR orders.payment_notification_claimed_at < now() - interval '2 minutes'
    )
  ORDER BY orders.created_at, orders.id
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT NULLIF(btrim(account.card_number), ''),
         NULLIF(btrim(account.holder_name), ''),
         NULLIF(btrim(account.bank_name), '')
  INTO v_payment_card, v_payment_holder, v_payment_bank
  FROM public.financial_accounts AS account
  WHERE account.is_active
    AND account.account_type = 'bank'
    AND NULLIF(btrim(account.card_number), '') IS NOT NULL
    AND NULLIF(btrim(account.holder_name), '') IS NOT NULL
  ORDER BY account.created_at DESC, account.id DESC
  LIMIT 1;

  IF v_payment_card IS NULL OR v_payment_holder IS NULL THEN
    RAISE EXCEPTION 'حساب بانکی فعال با شماره‌کارت و نام صاحب حساب ثبت نشده است.';
  END IF;

  UPDATE public.bot_orders
  SET payment_notification_claimed_at = now()
  WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'id', v_order.id,
    'telegram_user_id', v_order.telegram_user_id,
    'total_price', v_order.total_price,
    'payment_info', jsonb_build_object(
      'card_number', v_payment_card,
      'holder_name', v_payment_holder,
      'bank_name', v_payment_bank
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_bot_order_payment_notification(
  p_order_id bigint,
  p_approval_secret text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_expected_hash text;
  v_telegram_user_id text;
BEGIN
  SELECT config.secret_hash
  INTO v_expected_hash
  FROM private.bot_approval_config AS config
  WHERE config.singleton;

  IF v_expected_hash IS NULL
    OR encode(
      extensions.digest(
        convert_to(COALESCE(p_approval_secret, ''), 'UTF8'),
        'sha256'
      ),
      'hex'
    ) IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION 'اعتبار دسترسی ربات برای مدیریت سفارش معتبر نیست.';
  END IF;

  UPDATE public.bot_orders
  SET payment_notified_at = now()
  WHERE id = p_order_id
    AND status = 'approved'
    AND payment_notification_claimed_at IS NOT NULL
    AND payment_notified_at IS NULL
  RETURNING telegram_user_id INTO v_telegram_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('id', p_order_id, 'changed', false);
  END IF;

  INSERT INTO private.bot_order_customer_states (
    telegram_user_id,
    order_id,
    state,
    updated_at
  )
  VALUES (
    v_telegram_user_id,
    p_order_id,
    'awaiting_address',
    now()
  )
  ON CONFLICT (order_id)
  DO UPDATE SET
    telegram_user_id = EXCLUDED.telegram_user_id,
    state = EXCLUDED.state,
    updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object('id', p_order_id, 'changed', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_bot_order_address(
  p_telegram_user_id text,
  p_address text,
  p_approval_secret text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_expected_hash text;
  v_order_id bigint;
  v_customer_name text;
BEGIN
  SELECT config.secret_hash
  INTO v_expected_hash
  FROM private.bot_approval_config AS config
  WHERE config.singleton;

  IF v_expected_hash IS NULL
    OR encode(
      extensions.digest(
        convert_to(COALESCE(p_approval_secret, ''), 'UTF8'),
        'sha256'
      ),
      'hex'
    ) IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION 'اعتبار دسترسی ربات برای مدیریت سفارش معتبر نیست.';
  END IF;

  IF NULLIF(btrim(p_telegram_user_id), '') IS NULL THEN
    RAISE EXCEPTION 'شناسه تلگرام مشتری معتبر نیست.';
  END IF;

  SELECT state.order_id
  INTO v_order_id
  FROM private.bot_order_customer_states AS state
  WHERE state.telegram_user_id = btrim(p_telegram_user_id)
    AND state.state = 'awaiting_address'
  ORDER BY state.updated_at DESC, state.order_id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF length(btrim(COALESCE(p_address, ''))) < 10
    OR length(btrim(COALESCE(p_address, ''))) > 1000 THEN
    RETURN jsonb_build_object('found', true, 'saved', false);
  END IF;

  UPDATE public.bot_orders AS orders
  SET delivery_address = btrim(p_address)
  WHERE orders.id = v_order_id
    AND orders.telegram_user_id = btrim(p_telegram_user_id)
    AND orders.status IN ('approved', 'payment_review')
  RETURNING orders.customer_name INTO v_customer_name;

  IF NOT FOUND THEN
    DELETE FROM private.bot_order_customer_states AS state
    WHERE state.order_id = v_order_id;
    RETURN jsonb_build_object('found', false);
  END IF;

  DELETE FROM private.bot_order_customer_states AS state
  WHERE state.order_id = v_order_id;

  RETURN jsonb_build_object(
    'found', true,
    'saved', true,
    'id', v_order_id,
    'telegram_user_id', btrim(p_telegram_user_id),
    'customer_name', v_customer_name,
    'delivery_address', btrim(p_address)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_bot_order_payment_notification(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_bot_order_payment_notification(bigint, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_bot_order_address(text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_bot_order_payment_notification(text)
  TO anon;
GRANT EXECUTE ON FUNCTION public.complete_bot_order_payment_notification(bigint, text)
  TO anon;
GRANT EXECUTE ON FUNCTION public.submit_bot_order_address(text, text, text)
  TO anon;
