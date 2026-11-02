ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS discount_amount numeric(14, 0) NOT NULL DEFAULT 0;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS discount_amount numeric(14, 0) NOT NULL DEFAULT 0;

UPDATE public.quotations
SET discount_amount = 0
WHERE discount_amount IS NULL OR discount_amount < 0;

UPDATE public.invoices
SET discount_amount = 0
WHERE discount_amount IS NULL OR discount_amount < 0;

ALTER TABLE public.quotations
  DROP CONSTRAINT IF EXISTS quotations_discount_amount_nonnegative;

ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_discount_amount_nonnegative CHECK (discount_amount >= 0);

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_discount_amount_nonnegative;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_discount_amount_nonnegative CHECK (discount_amount >= 0);
