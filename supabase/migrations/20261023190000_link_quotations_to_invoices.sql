ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS quotation_id text;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_quotation_id_key
  ON public.invoices (quotation_id)
  WHERE quotation_id IS NOT NULL;
