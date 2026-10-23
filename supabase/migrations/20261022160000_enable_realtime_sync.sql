DO $$
DECLARE
  target_table text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Supabase publication supabase_realtime does not exist.';
  END IF;

  FOREACH target_table IN ARRAY ARRAY[
    'customers',
    'ceremonies',
    'events',
    'inventory',
    'quotations',
    'invoices',
    'financial_accounts',
    'cash_transactions'
  ]
  LOOP
    IF to_regclass(format('public.%I', target_table)) IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = target_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', target_table);
    END IF;
  END LOOP;
END
$$;
