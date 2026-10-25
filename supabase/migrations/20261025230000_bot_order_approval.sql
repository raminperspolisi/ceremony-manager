CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.bot_approval_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  secret_hash text NOT NULL CHECK (secret_hash ~ '^[0-9a-f]{64}$')
);
REVOKE ALL ON TABLE private.bot_approval_config FROM PUBLIC, anon, authenticated;

ALTER TABLE public.bot_orders
  DROP CONSTRAINT IF EXISTS bot_orders_status_check;
ALTER TABLE public.bot_orders
  ADD CONSTRAINT bot_orders_status_check
  CHECK (status IN (
    'pending',
    'approved',
    'rejected',
    'processing',
    'completed',
    'cancelled'
  ));

CREATE OR REPLACE FUNCTION public.submit_bot_order(
  p_telegram_user_id text,
  p_customer_name text,
  p_telegram_username text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_item jsonb;
  v_product record;
  v_quantity numeric;
  v_total numeric(14, 0) := 0;
  v_has_unpriced_item boolean := false;
  v_order_items jsonb := '[]'::jsonb;
  v_order_id bigint;
BEGIN
  IF NULLIF(btrim(p_telegram_user_id), '') IS NULL
    OR NULLIF(btrim(p_customer_name), '') IS NULL THEN
    RAISE EXCEPTION 'شناسهٔ مشتری و نام نمایشی الزامی است.';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'فهرست اقلام سفارش معتبر نیست.';
  END IF;
  IF jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'فهرست اقلام سفارش معتبر نیست.';
  END IF;

  FOR v_item IN
    SELECT entry.value
    FROM jsonb_array_elements(p_items) AS entry(value)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR NULLIF(v_item->>'id', '') IS NULL
      OR jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'قلم سفارش معتبر نیست.';
    END IF;

    v_quantity := (v_item->>'quantity')::numeric;
    IF v_quantity <> trunc(v_quantity) OR v_quantity < 1 OR v_quantity > 99 THEN
      RAISE EXCEPTION 'تعداد هر قلم باید بین ۱ تا ۹۹ باشد.';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_order_items) AS saved(value)
      WHERE saved.value->>'id' = v_item->>'id'
    ) THEN
      RAISE EXCEPTION 'یک کالا در سفارش تکراری است.';
    END IF;

    SELECT inventory.id,
           inventory.title,
           COALESCE(inventory.item_type, 'sale') AS item_type,
           inventory.price_level1,
           inventory.price_level2,
           inventory.price_level3
    INTO v_product
    FROM public.inventory AS inventory
    WHERE inventory.id::text = v_item->>'id';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'یکی از کالاهای انتخاب‌شده دیگر در کاتالوگ نیست.';
    END IF;

    v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
      'id', v_product.id::text,
      'title', v_product.title,
      'item_type', v_product.item_type,
      'quantity', v_quantity,
      'unit_price', v_product.price_level1,
      'price_level1', v_product.price_level1,
      'price_level2', v_product.price_level2,
      'price_level3', v_product.price_level3,
      'description', ''
    ));

    IF v_product.price_level1 IS NULL THEN
      v_has_unpriced_item := true;
    ELSE
      IF v_product.price_level1 < 0 THEN
        RAISE EXCEPTION 'قیمت سطح ۱ کالا معتبر نیست.';
      END IF;
      v_total := v_total + (v_product.price_level1 * v_quantity);
    END IF;
  END LOOP;

  INSERT INTO public.bot_orders (
    telegram_user_id,
    customer_name,
    telegram_username,
    items,
    total_price,
    status
  )
  VALUES (
    btrim(p_telegram_user_id),
    left(btrim(p_customer_name), 120),
    left(COALESCE(btrim(p_telegram_username), ''), 64),
    v_order_items,
    CASE WHEN v_has_unpriced_item THEN NULL ELSE v_total END,
    'pending'
  )
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'items', v_order_items,
    'total_price', CASE WHEN v_has_unpriced_item THEN NULL ELSE v_total END,
    'status', 'pending'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_bot_order(text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_bot_order(text, text, text, jsonb)
  TO anon;

CREATE OR REPLACE FUNCTION public.process_bot_order_action(
  p_order_id bigint,
  p_action text,
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
  v_changed boolean := false;
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

  IF p_action NOT IN ('approve', 'reject', 'receipt') THEN
    RAISE EXCEPTION 'عملیات سفارش معتبر نیست.';
  END IF;

  SELECT orders.id,
         orders.telegram_user_id,
         orders.customer_name,
         orders.telegram_username,
         orders.items,
         orders.total_price,
         orders.status
  INTO v_order
  FROM public.bot_orders AS orders
  WHERE orders.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'سفارش پیدا نشد.';
  END IF;

  IF p_action = 'receipt' THEN
    RETURN jsonb_build_object(
      'id', v_order.id,
      'telegram_user_id', v_order.telegram_user_id,
      'status', v_order.status
    );
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'id', v_order.id,
      'telegram_user_id', v_order.telegram_user_id,
      'status', v_order.status,
      'changed', false
    );
  END IF;

  IF p_action = 'reject' THEN
    UPDATE public.bot_orders
    SET status = 'rejected'
    WHERE id = v_order.id;
    RETURN jsonb_build_object(
      'id', v_order.id,
      'telegram_user_id', v_order.telegram_user_id,
      'status', 'rejected',
      'changed', true
    );
  END IF;

  IF v_order.total_price IS NULL THEN
    RAISE EXCEPTION 'برای تأیید، مدیر باید ابتدا مبلغ نهایی سفارش را ثبت کند.';
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
    RAISE EXCEPTION 'حساب بانکی فعال با شماره کارت و نام صاحب حساب ثبت نشده است.';
  END IF;

  UPDATE public.bot_orders
  SET status = 'approved'
  WHERE id = v_order.id;

  v_changed := true;
  RETURN jsonb_build_object(
    'id', v_order.id,
    'telegram_user_id', v_order.telegram_user_id,
    'customer_name', v_order.customer_name,
    'telegram_username', v_order.telegram_username,
    'items', v_order.items,
    'total_price', v_order.total_price,
    'status', 'approved',
    'changed', v_changed,
    'payment_info', jsonb_build_object(
      'card_number', v_payment_card,
      'holder_name', v_payment_holder,
      'bank_name', v_payment_bank
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.process_bot_order_action(bigint, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_bot_order_action(bigint, text, text)
  TO anon;
