DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'bot_orders'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_orders';
  END IF;
END;
$migration$;

DROP POLICY IF EXISTS "Authenticated users can update bot order status"
  ON public.bot_orders;
CREATE POLICY "Authenticated users can update bot order status"
ON public.bot_orders
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (
  status IN (
    'pending',
    'approved',
    'payment_review',
    'rejected',
    'processing',
    'completed',
    'cancelled'
  )
  AND (total_price IS NULL OR total_price >= 0)
);
