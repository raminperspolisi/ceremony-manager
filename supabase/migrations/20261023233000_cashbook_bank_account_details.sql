ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS card_number text,
  ADD COLUMN IF NOT EXISTS holder_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financial_accounts_card_number_format_check'
      AND conrelid = 'public.financial_accounts'::regclass
  ) THEN
    ALTER TABLE public.financial_accounts
      ADD CONSTRAINT financial_accounts_card_number_format_check
      CHECK (card_number IS NULL OR card_number ~ '^[0-9]{16}$');
  END IF;
END
$$;
