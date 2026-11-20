CREATE OR REPLACE FUNCTION public.edit_standalone_cash_transaction(
  p_transaction_id bigint,
  p_transaction jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_original public.cash_transactions%ROWTYPE;
  v_reversal jsonb;
  v_replacement jsonb;
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF p_transaction_id IS NULL OR length(v_reason) NOT BETWEEN 4 AND 240 THEN
    RAISE EXCEPTION 'گردش و دلیل اصلاح (۴ تا ۲۴۰ نویسه) الزامی است.';
  END IF;

  SELECT * INTO v_original
  FROM public.cash_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'گردش موردنظر پیدا نشد.'; END IF;
  IF NOT public.is_organization_member(v_original.organization_id)
    OR NOT public.has_organization_section(v_original.organization_id, 'accounting') THEN
    RAISE EXCEPTION 'برای ویرایش گردش به دسترسی حسابداری نیاز دارید.';
  END IF;
  IF v_original.invoice_id IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.invoice_expenses AS expense
      WHERE expense.cash_transaction_id = v_original.id
    ) THEN
    RAISE EXCEPTION 'گردش متصل به فاکتور از این مسیر قابل ویرایش نیست.';
  END IF;
  IF v_original.reversal_of_transaction_id IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.cash_transactions AS reversal
      WHERE reversal.reversal_of_transaction_id = v_original.id
    ) THEN
    RAISE EXCEPTION 'گردش برگشتی یا برگشت‌خورده قابل ویرایش نیست.';
  END IF;
  IF NULLIF(p_transaction->>'invoice_id', '') IS NOT NULL THEN
    RAISE EXCEPTION 'اصلاح گردش مستقل نمی‌تواند به فاکتور متصل شود.';
  END IF;

  v_reversal := public.reverse_cash_transaction(
    v_original.id,
    'اصلاح گردش #' || v_original.id::text || ': ' || v_reason
  );
  v_replacement := public.record_cash_transaction(
    (p_transaction - 'invoice_id')
      || jsonb_build_object(
        'organization_id', v_original.organization_id,
        'offline_sync_id', gen_random_uuid()
      )
  );

  RETURN jsonb_build_object(
    'reversal', v_reversal,
    'replacement', v_replacement
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.edit_standalone_cash_transaction(bigint, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_standalone_cash_transaction(bigint, jsonb, text) TO authenticated;
