ALTER TABLE public.cash_transactions
  DROP CONSTRAINT IF EXISTS cash_transactions_invoice_id_fkey;

ALTER TABLE public.cash_transactions
  ADD CONSTRAINT cash_transactions_invoice_id_fkey
  FOREIGN KEY (invoice_id)
  REFERENCES public.invoices(id)
  ON DELETE SET NULL;
