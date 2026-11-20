ALTER TABLE public.cash_transactions
  DROP CONSTRAINT IF EXISTS cash_transactions_invoice_id_fkey;

ALTER TABLE public.cash_transactions
  ADD CONSTRAINT cash_transactions_invoice_id_fkey
  FOREIGN KEY (invoice_id)
  REFERENCES public.invoices(id)
  ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.guard_invoice_inventory_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_transaction_id bigint;
  v_invoice_source_prefix text := OLD.id::text || ':';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.inventory_reservations AS reservation
    WHERE reservation.organization_id = OLD.organization_id
      AND reservation.source_type = 'invoice'
      AND left(reservation.source_id, length(v_invoice_source_prefix)) = v_invoice_source_prefix
      AND reservation.reservation_type = 'rent'
      AND reservation.status = 'issued'
  ) THEN
    RAISE EXCEPTION 'کالای اجاره‌ای این فاکتور هنوز عودت نشده است؛ ابتدا عودت انبار را ثبت کنید.';
  END IF;

  FOR v_transaction_id IN
    SELECT DISTINCT cash_transaction.id
    FROM public.cash_transactions AS cash_transaction
    LEFT JOIN public.invoice_expenses AS invoice_expense
      ON invoice_expense.cash_transaction_id = cash_transaction.id
    WHERE cash_transaction.organization_id = OLD.organization_id
      AND (
        cash_transaction.invoice_id = OLD.id
        OR invoice_expense.invoice_id = OLD.id
      )
      AND cash_transaction.reversal_of_transaction_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.cash_transactions AS reversal
        WHERE reversal.reversal_of_transaction_id = cash_transaction.id
      )
    ORDER BY cash_transaction.id
  LOOP
    PERFORM public.reverse_cash_transaction(
      v_transaction_id,
      'حذف فاکتور رسمی شمارهٔ ' || OLD.id::text
    );
  END LOOP;

  DELETE FROM public.inventory_stock_movements AS movement
  WHERE movement.organization_id = OLD.organization_id
    AND (
      (
        movement.source_type = 'invoice'
        AND left(COALESCE(movement.source_id, ''), length(v_invoice_source_prefix)) = v_invoice_source_prefix
      )
      OR EXISTS (
        SELECT 1
        FROM public.inventory_reservations AS reservation
        WHERE reservation.id = movement.reservation_id
          AND reservation.organization_id = OLD.organization_id
          AND reservation.source_type = 'invoice'
          AND left(reservation.source_id, length(v_invoice_source_prefix)) = v_invoice_source_prefix
      )
    );

  DELETE FROM public.inventory_reservations AS reservation
  WHERE reservation.organization_id = OLD.organization_id
    AND reservation.source_type = 'invoice'
    AND left(reservation.source_id, length(v_invoice_source_prefix)) = v_invoice_source_prefix;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS invoice_inventory_delete_guard ON public.invoices;
CREATE TRIGGER invoice_inventory_delete_guard
BEFORE DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_inventory_delete();

REVOKE ALL ON FUNCTION public.guard_invoice_inventory_delete() FROM PUBLIC, anon, authenticated;
