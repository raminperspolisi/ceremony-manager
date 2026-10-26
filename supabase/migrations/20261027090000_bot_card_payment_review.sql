ALTER TABLE public.bot_orders
  DROP CONSTRAINT IF EXISTS bot_orders_status_check;
ALTER TABLE public.bot_orders
  ADD CONSTRAINT bot_orders_status_check
  CHECK (status IN (
    'pending',
    'approved',
    'payment_review',
    'rejected',
    'processing',
    'completed',
    'cancelled'
  ));

DROP POLICY IF EXISTS "Authenticated users can update bot order status"
  ON public.bot_orders;
CREATE POLICY "Authenticated users can update bot order status"
ON public.bot_orders
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (
  status IN ('pending', 'payment_review', 'processing', 'completed', 'cancelled')
  AND (total_price IS NULL OR total_price >= 0)
);

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

  IF p_action NOT IN ('approve', 'reject', 'receipt', 'payment_review') THEN
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

  IF p_action = 'payment_review' THEN
    IF v_order.status = 'approved' THEN
      UPDATE public.bot_orders
      SET status = 'payment_review'
      WHERE id = v_order.id;
      RETURN jsonb_build_object(
        'id', v_order.id,
        'telegram_user_id', v_order.telegram_user_id,
        'status', 'payment_review',
        'changed', true
      );
    END IF;

    RETURN jsonb_build_object(
      'id', v_order.id,
      'telegram_user_id', v_order.telegram_user_id,
      'status', v_order.status,
      'changed', false
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

  RETURN jsonb_build_object(
    'id', v_order.id,
    'telegram_user_id', v_order.telegram_user_id,
    'customer_name', v_order.customer_name,
    'telegram_username', v_order.telegram_username,
    'items', v_order.items,
    'total_price', v_order.total_price,
    'status', 'approved',
    'changed', true,
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
