CREATE OR REPLACE FUNCTION public.bot_catalog()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', inventory.id,
        'title', inventory.title,
        'item_type', COALESCE(inventory.item_type, 'sale'),
        'price_level1', inventory.price_level1,
        'price_level2', inventory.price_level2,
        'price_level3', inventory.price_level3,
        'description', ''
      )
      ORDER BY inventory.title
    ),
    '[]'::jsonb
  )
  FROM public.inventory AS inventory;
$function$;

REVOKE ALL ON FUNCTION public.bot_catalog() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_catalog() TO anon;
ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS holder_name text;

GRANT UPDATE (status, total_price) ON TABLE public.bot_orders TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can update bot order status"
  ON public.bot_orders;
CREATE POLICY "Authenticated users can update bot order status"
ON public.bot_orders
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (
  status IN ('pending', 'processing', 'completed', 'cancelled')
  AND (total_price IS NULL OR total_price >= 0)
);

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
  v_payment_card text;
  v_payment_holder text;
  v_payment_bank text;
  v_payment_info jsonb;
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
           inventory.price_level3,
           ''::text AS description
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
      'description', v_product.description
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

  IF NOT v_has_unpriced_item THEN
    SELECT NULLIF(btrim(account.card_number), ''),
           NULLIF(btrim(account.holder_name), ''),
           NULLIF(btrim(account.bank_name), '')
    INTO v_payment_card, v_payment_holder, v_payment_bank
    FROM public.financial_accounts AS account
    WHERE account.is_active
      AND account.account_type = 'bank'
      AND NULLIF(btrim(account.card_number), '') IS NOT NULL
    ORDER BY account.created_at DESC, account.id DESC
    LIMIT 1;

    IF v_payment_card IS NOT NULL AND v_payment_holder IS NOT NULL THEN
      v_payment_info := jsonb_build_object(
        'card_number', v_payment_card,
        'holder_name', v_payment_holder,
        'bank_name', v_payment_bank
      );
    END IF;
  END IF;

  INSERT INTO public.bot_orders (
    telegram_user_id,
    customer_name,
    telegram_username,
    items,
    total_price
  )
  VALUES (
    btrim(p_telegram_user_id),
    left(btrim(p_customer_name), 120),
    left(COALESCE(btrim(p_telegram_username), ''), 64),
    v_order_items,
    CASE WHEN v_has_unpriced_item THEN NULL ELSE v_total END
  )
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'items', v_order_items,
    'total_price', CASE WHEN v_has_unpriced_item THEN NULL ELSE v_total END,
    'payment_info', v_payment_info
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_bot_order(text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_bot_order(text, text, text, jsonb)
  TO anon;
