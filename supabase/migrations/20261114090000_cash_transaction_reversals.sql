ALTER TABLE public.cash_transactions
  ADD COLUMN IF NOT EXISTS reversal_of_transaction_id bigint
    REFERENCES public.cash_transactions(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS cash_transactions_reversal_of_transaction_key
  ON public.cash_transactions (reversal_of_transaction_id)
  WHERE reversal_of_transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reverse_cash_transaction(
  p_transaction_id bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_original public.cash_transactions%ROWTYPE;
  v_reversal public.cash_transactions%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_expense public.invoice_expenses%ROWTYPE;
  v_account public.financial_accounts%ROWTYPE;
  v_type text;
  v_account_id bigint;
  v_destination_id bigint;
  v_event_id uuid;
  v_category text;
  v_description text;
  v_date date := CURRENT_DATE;
  v_balance numeric(14, 0);
  v_new_paid numeric(14, 0);
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'برای ثبت برگشت باید وارد حساب شوید.';
  END IF;
  IF p_transaction_id IS NULL OR length(v_reason) NOT BETWEEN 4 AND 240 THEN
    RAISE EXCEPTION 'گردش اصلی و دلیل برگشت (۴ تا ۲۴۰ نویسه) الزامی است.';
  END IF;

  SELECT * INTO v_original
  FROM public.cash_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'گردش اصلی پیدا نشد.'; END IF;
  IF NOT public.is_organization_member(v_original.organization_id)
    OR NOT public.has_organization_section(v_original.organization_id, 'accounting') THEN
    RAISE EXCEPTION 'برای برگشت این گردش دسترسی حسابداری ندارید.';
  END IF;
  IF v_original.reversal_of_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'گردش برگشتی را نمی‌توان دوباره برگشت زد.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.cash_transactions AS existing
    WHERE existing.reversal_of_transaction_id = v_original.id
  ) THEN
    RAISE EXCEPTION 'این گردش قبلاً برگشت خورده است.';
  END IF;

  v_type := CASE v_original.transaction_type
    WHEN 'income' THEN 'expense'
    WHEN 'expense' THEN 'income'
    ELSE 'transfer'
  END;
  v_account_id := CASE
    WHEN v_original.transaction_type = 'transfer' THEN v_original.transfer_to_account_id
    ELSE v_original.account_id
  END;
  v_destination_id := CASE
    WHEN v_original.transaction_type = 'transfer' THEN v_original.account_id
    ELSE NULL
  END;
  v_event_id := v_original.event_id;
  v_category := CASE WHEN v_type = 'expense' THEN 'برگشت دریافت' ELSE NULL END;
  v_description := 'برگشت گردش #' || v_original.id::text || ' - ' || v_reason;

  IF v_original.invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice
    FROM public.invoices
    WHERE id = v_original.invoice_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاکتور مرتبط با گردش اصلی پیدا نشد.'; END IF;
    v_event_id := v_invoice.event_id;
  END IF;

  SELECT * INTO v_expense
  FROM public.invoice_expenses
  WHERE cash_transaction_id = v_original.id
  FOR UPDATE;
  IF v_expense.id IS NOT NULL THEN
    SELECT * INTO v_invoice
    FROM public.invoices
    WHERE id = v_expense.invoice_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاکتور هزینهٔ مرتبط با گردش پیدا نشد.'; END IF;
    v_event_id := v_invoice.event_id;
  END IF;

  PERFORM account.id
  FROM public.financial_accounts AS account
  WHERE account.id = v_account_id OR account.id = v_destination_id
  ORDER BY account.id
  FOR UPDATE;

  SELECT * INTO v_account
  FROM public.financial_accounts
  WHERE id = v_account_id;
  IF NOT FOUND OR v_account.organization_id <> v_original.organization_id THEN
    RAISE EXCEPTION 'حساب مربوط به برگشت معتبر نیست.';
  END IF;
  IF v_date < v_account.opening_date THEN
    RAISE EXCEPTION 'تاریخ برگشت نمی‌تواند قبل از تاریخ افتتاح حساب باشد.';
  END IF;

  IF v_type IN ('expense', 'transfer') THEN
    SELECT v_account.opening_balance
      + COALESCE(SUM(CASE
          WHEN transaction.transaction_type = 'income' THEN transaction.amount
          WHEN transaction.transaction_type IN ('expense', 'transfer') THEN -transaction.amount
          ELSE 0
        END), 0)
    INTO v_balance
    FROM public.cash_transactions AS transaction
    WHERE transaction.account_id = v_account_id
      AND transaction.organization_id = v_original.organization_id;
    SELECT v_balance + COALESCE(SUM(transaction.amount), 0)
      INTO v_balance
    FROM public.cash_transactions AS transaction
    WHERE transaction.transaction_type = 'transfer'
      AND transaction.transfer_to_account_id = v_account_id
      AND transaction.organization_id = v_original.organization_id;
    IF v_balance < v_original.amount THEN
      RAISE EXCEPTION 'موجودی حساب برای برگشت کامل کافی نیست.';
    END IF;
  END IF;

  INSERT INTO public.cash_transactions (
    transaction_type, amount, account_id, transfer_to_account_id, invoice_id,
    event_id, category, description, transaction_date, offline_sync_id,
    organization_id, reversal_of_transaction_id
  ) VALUES (
    v_type, v_original.amount, v_account_id, v_destination_id, NULL,
    v_event_id, v_category, v_description, v_date, gen_random_uuid(),
    v_original.organization_id, v_original.id
  )
  RETURNING * INTO v_reversal;

  IF v_original.invoice_id IS NOT NULL THEN
    v_new_paid := GREATEST(COALESCE(v_invoice.paid_amount, 0) - v_original.amount, 0);
    UPDATE public.invoices
    SET paid_amount = v_new_paid,
        payment_status = CASE
          WHEN v_new_paid <= 0 THEN 'unpaid'
          WHEN COALESCE(total_price, 0) > 0 AND v_new_paid >= total_price THEN 'paid'
          ELSE 'deposit_paid'
        END
    WHERE id = v_invoice.id
    RETURNING * INTO v_invoice;
  END IF;

  IF v_expense.id IS NOT NULL THEN
    UPDATE public.invoice_expenses
    SET is_paid = false,
        payment_date = NULL,
        account_id = NULL,
        cash_transaction_id = NULL
    WHERE id = v_expense.id;
  END IF;

  RETURN jsonb_build_object(
    'transaction', to_jsonb(v_reversal),
    'invoice', CASE WHEN v_invoice.id IS NULL THEN NULL ELSE to_jsonb(v_invoice) END,
    'reversed_transaction_id', v_original.id,
    'invoice_expense_id', CASE WHEN v_expense.id IS NULL THEN NULL ELSE v_expense.id END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reverse_cash_transaction(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_cash_transaction(bigint, text) TO authenticated;

DROP POLICY IF EXISTS organization_section_access ON public.cash_transactions;
CREATE POLICY organization_section_access ON public.cash_transactions
FOR ALL TO authenticated
USING (
  public.is_organization_member(organization_id)
  AND public.has_organization_section(organization_id, 'accounting')
)
WITH CHECK (
  reversal_of_transaction_id IS NULL
  AND public.is_organization_member(organization_id)
  AND public.has_organization_section(organization_id, 'accounting')
);
