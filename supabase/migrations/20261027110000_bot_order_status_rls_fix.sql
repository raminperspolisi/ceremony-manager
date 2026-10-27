REVOKE INSERT, UPDATE, DELETE ON TABLE public.bot_orders FROM anon, PUBLIC;
REVOKE UPDATE ON TABLE public.bot_orders FROM authenticated;
GRANT SELECT ON TABLE public.bot_orders TO authenticated;
GRANT UPDATE (status, total_price) ON TABLE public.bot_orders TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can update bot order status"
  ON public.bot_orders;
CREATE POLICY "Authenticated users can update bot order status"
ON public.bot_orders
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
