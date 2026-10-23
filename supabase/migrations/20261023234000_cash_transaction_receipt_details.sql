ALTER TABLE public.cash_transactions
  ADD COLUMN IF NOT EXISTS reference_number text,
  ADD COLUMN IF NOT EXISTS receipt_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cash_transactions_reference_number_length_check'
      AND conrelid = 'public.cash_transactions'::regclass
  ) THEN
    ALTER TABLE public.cash_transactions
      ADD CONSTRAINT cash_transactions_reference_number_length_check
      CHECK (reference_number IS NULL OR length(reference_number) <= 80);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cash_transactions_receipt_note_length_check'
      AND conrelid = 'public.cash_transactions'::regclass
  ) THEN
    ALTER TABLE public.cash_transactions
      ADD CONSTRAINT cash_transactions_receipt_note_length_check
      CHECK (receipt_note IS NULL OR length(receipt_note) <= 240);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.record_cash_transaction(p_transaction jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_type text := p_transaction->>'transaction_type';
  v_amount numeric(14, 0) := (p_transaction->>'amount')::numeric;
  v_account_id bigint := (p_transaction->>'account_id')::bigint;
  v_destination_id bigint := NULLIF(p_transaction->>'transfer_to_account_id', '')::bigint;
  v_invoice_id bigint := NULLIF(p_transaction->>'invoice_id', '')::bigint;
  v_sync_id uuid := (p_transaction->>'offline_sync_id')::uuid;
  v_date date := (p_transaction->>'transaction_date')::date;
  v_reference_number text := NULLIF(btrim(p_transaction->>'reference_number'), '');
  v_receipt_note text := NULLIF(btrim(p_transaction->>'receipt_note'), '');
  v_account public.financial_accounts%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_transaction public.cash_transactions%ROWTYPE;
  v_balance numeric(14, 0);
  v_new_paid numeric(14, 0);
  v_created boolean := false;
BEGIN
  IF v_type NOT IN ('income', 'expense', 'transfer') OR v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'نوع یا مبلغ گردش مالی معتبر نیست.';
  END IF;
  IF v_account_id IS NULL OR v_sync_id IS NULL OR v_date IS NULL THEN
    RAISE EXCEPTION 'حساب، شناسه همگام‌سازی و تاریخ الزامی هستند.';
  END IF;
  IF v_type = 'transfer' AND (v_destination_id IS NULL OR v_destination_id = v_account_id OR v_invoice_id IS NOT NULL) THEN
    RAISE EXCEPTION 'حساب مقصد انتقال معتبر نیست.';
  END IF;
  IF v_type <> 'transfer' AND v_destination_id IS NOT NULL THEN
    RAISE EXCEPTION 'حساب مقصد فقط برای انتقال قابل استفاده است.';
  END IF;
  IF v_invoice_id IS NOT NULL AND v_type <> 'income' THEN
    RAISE EXCEPTION 'پرداخت فاکتور باید از نوع دریافت باشد.';
  END IF;
  IF length(v_reference_number) > 80 OR length(v_receipt_note) > 240 THEN
    RAISE EXCEPTION 'اطلاعات رسید بیش از حد مجاز است.';
  END IF;

  SELECT * INTO v_transaction
  FROM public.cash_transactions
  WHERE offline_sync_id = v_sync_id;
  IF FOUND THEN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = v_transaction.invoice_id;
    RETURN jsonb_build_object(
      'transaction', to_jsonb(v_transaction),
      'invoice', CASE WHEN v_invoice.id IS NULL THEN NULL ELSE to_jsonb(v_invoice) END
    );
  END IF;

  IF v_invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = v_invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاکتور انتخاب‌شده پیدا نشد.'; END IF;
  END IF;

  PERFORM id
  FROM public.financial_accounts
  WHERE id = v_account_id OR id = v_destination_id
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_account FROM public.financial_accounts WHERE id = v_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'حساب مبدا پیدا نشد.'; END IF;
  IF v_date < v_account.opening_date THEN RAISE EXCEPTION 'تاریخ گردش نمی‌تواند قبل از تاریخ افتتاح حساب باشد.'; END IF;
  IF v_destination_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.financial_accounts WHERE id = v_destination_id
  ) THEN
    RAISE EXCEPTION 'حساب مقصد پیدا نشد.';
  END IF;
  IF v_type = 'expense' AND length(btrim(COALESCE(p_transaction->>'category', ''))) = 0 THEN
    RAISE EXCEPTION 'دسته‌بندی هزینه الزامی است.';
  END IF;

  IF v_type IN ('expense', 'transfer') THEN
    SELECT v_account.opening_balance
      + COALESCE(SUM(CASE
          WHEN transaction_type = 'income' THEN amount
          WHEN transaction_type IN ('expense', 'transfer') THEN -amount
          ELSE 0
        END), 0)
    INTO v_balance
    FROM public.cash_transactions
    WHERE account_id = v_account_id;
    SELECT v_balance + COALESCE(SUM(amount), 0)
      INTO v_balance
    FROM public.cash_transactions
    WHERE transaction_type = 'transfer' AND transfer_to_account_id = v_account_id;
    IF v_balance < v_amount THEN RAISE EXCEPTION 'موجودی حساب برای این پرداخت کافی نیست.'; END IF;
  END IF;

  IF v_invoice_id IS NOT NULL THEN
    v_new_paid := COALESCE(v_invoice.paid_amount, 0) + v_amount;
    IF v_new_paid > COALESCE(v_invoice.total_price, 0) THEN
      RAISE EXCEPTION 'مبلغ دریافت از مانده فاکتور بیشتر است.';
    END IF;
  END IF;

  INSERT INTO public.cash_transactions (
    transaction_type, amount, account_id, transfer_to_account_id, invoice_id,
    category, description, transaction_date, reference_number, receipt_note, offline_sync_id
  ) VALUES (
    v_type, v_amount, v_account_id, v_destination_id, v_invoice_id,
    NULLIF(p_transaction->>'category', ''), COALESCE(p_transaction->>'description', ''),
    v_date, v_reference_number, v_receipt_note, v_sync_id
  )
  ON CONFLICT (offline_sync_id) DO NOTHING
  RETURNING * INTO v_transaction;

  IF FOUND THEN
    v_created := true;
    IF v_invoice_id IS NOT NULL THEN
      UPDATE public.invoices
      SET paid_amount = v_new_paid,
          payment_status = CASE
            WHEN COALESCE(total_price, 0) > 0 AND v_new_paid >= total_price THEN 'paid'
            ELSE 'deposit_paid'
          END
      WHERE id = v_invoice_id
      RETURNING * INTO v_invoice;
    END IF;
  ELSE
    SELECT * INTO v_transaction
    FROM public.cash_transactions
    WHERE offline_sync_id = v_sync_id;
    IF v_transaction.invoice_id IS NOT NULL THEN
      SELECT * INTO v_invoice FROM public.invoices WHERE id = v_transaction.invoice_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'transaction', to_jsonb(v_transaction),
    'invoice', CASE WHEN v_invoice.id IS NULL THEN NULL ELSE to_jsonb(v_invoice) END,
    'created', v_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_cash_transaction(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_cash_transaction(jsonb) TO authenticated;
