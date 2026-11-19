ALTER TABLE public.cash_transactions
  ADD COLUMN IF NOT EXISTS reference_number text,
  ADD COLUMN IF NOT EXISTS receipt_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cash_transactions_reference_number_length_check'
      AND conrelid = 'public.cash_transactions'::regclass
  ) THEN
    ALTER TABLE public.cash_transactions
      ADD CONSTRAINT cash_transactions_reference_number_length_check
      CHECK (reference_number IS NULL OR length(reference_number) <= 80);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cash_transactions_receipt_note_length_check'
      AND conrelid = 'public.cash_transactions'::regclass
  ) THEN
    ALTER TABLE public.cash_transactions
      ADD CONSTRAINT cash_transactions_receipt_note_length_check
      CHECK (receipt_note IS NULL OR length(receipt_note) <= 240);
  END IF;
END
$$;
